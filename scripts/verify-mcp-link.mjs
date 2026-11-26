// verify:mcp-link - CI-safe checks of FlashFX Link (docs/MCP-PRODUCT-ARCHITECTURE.md v1) without a GPU or a
// browser: the page protocol (src/agent/linkProtocol.ts, bundled with esbuild), the RFC 6455 codec, the
// shim's security checks over a REAL loopback socket (Origin, Host, path, one-time token, one tab at a time,
// session-key reconnect), call routing, the early-access gate, the output-folder write fence, and the
// packaged server (packages/flashfx-mcp) answering MCP over stdio. The real browser + editor end to end is
// `npm run gpu:bridge` (local only).

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { build } from 'esbuild';
import { encodeFrame, FrameDecoder } from '../mcp/lib/ws-server.mjs';
import { LinkServer, TabSession, hostAllowed, originAllowed } from '../mcp/lib/tab-session.mjs';
import { checkEntitlement, gateMessage, hashCode, GRACE_MS } from '../mcp/lib/entitlement.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TMP = mkdtempSync(join(tmpdir(), 'ffx-verify-link-'));
let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log(`  ok  ${name}`); };

// ---------------------------------------------------------------- page protocol (real TS) ----------
const protoFile = join(TMP, 'linkProtocol.mjs');
await build({ entryPoints: [join(ROOT, 'src/agent/linkProtocol.ts')], bundle: true, format: 'esm', platform: 'neutral', outfile: protoFile, logLevel: 'error' });
const P = await import(pathToFileURL(protoFile).href);
const TOKEN = 'a'.repeat(32);

await check('fragment parse: valid, embedded, invalid port / short token / missing', () => {
  assert.deepEqual(P.parseLinkFragment(`#ffx-link=47615.${TOKEN}`), { port: 47615, token: TOKEN });
  assert.deepEqual(P.parseLinkFragment(`#x=1&ffx-link=50000.${TOKEN}`), { port: 50000, token: TOKEN });
  assert.equal(P.parseLinkFragment(`#ffx-link=80.${TOKEN}`), null);
  assert.equal(P.parseLinkFragment('#ffx-link=47615.short'), null);
  assert.equal(P.parseLinkFragment(`#ffx-link=47615.${TOKEN}<script>`), null);
  assert.equal(P.parseLinkFragment('#other=1'), null);
});
await check('fragment strip keeps other params, drops the token', () => {
  assert.equal(P.stripLinkFragment(`#ffx-link=47615.${TOKEN}`), '');
  assert.equal(P.stripLinkFragment(`#x=1&ffx-link=47615.${TOKEN}&y=2`), '#x=1&y=2');
});
await check('socket URL is always the literal 127.0.0.1', () => {
  assert.equal(P.linkSocketUrl(47615), 'ws://127.0.0.1:47615/link');
  assert.throws(() => P.linkSocketUrl(22));
});
await check('shim messages: only whitelisted methods, malformed dropped', () => {
  assert.deepEqual(P.parseShimMessage(JSON.stringify({ type: 'call', id: 1, method: 'run', args: ['editor.addText', {}] })), { type: 'call', id: 1, method: 'run', args: ['editor.addText', {}] });
  assert.equal(P.parseShimMessage(JSON.stringify({ type: 'call', id: 1, method: 'eval', args: ['1'] })), null);
  assert.equal(P.parseShimMessage(JSON.stringify({ type: 'call', id: 'x', method: 'run' })), null);
  assert.equal(P.parseShimMessage('{not json'), null);
  assert.equal(P.parseShimMessage(JSON.stringify({ type: 'welcome', sessionKey: 'short', shimVersion: '1' })), null);
  assert.equal(P.parseShimMessage(JSON.stringify({ type: 'welcome', sessionKey: 'b'.repeat(64), shimVersion: '1', mode: 'full' })).mode, 'full');
  assert.equal(P.parseStoredSession(JSON.stringify({ port: 47615, sessionKey: 'b'.repeat(64) })).port, 47615);
  assert.equal(P.parseStoredSession('garbage'), null);
});

// ---------------------------------------------------------------- RFC 6455 codec --------------------
await check('frame codec: masked round trip at 3 length encodings; unmasked / oversized refused', () => {
  for (const n of [5, 300, 70000]) {
    const payload = randomBytes(n);
    const d = new FrameDecoder();
    const wire = encodeFrame(0x2, payload, { mask: randomBytes(4) });
    // feed in two pieces to exercise buffering
    const a = d.push(wire.subarray(0, 3));
    const b = d.push(wire.subarray(3));
    assert.equal(a.length, 0);
    assert.equal(b.length, 1);
    assert.ok(b[0].payload.equals(payload));
  }
  assert.throws(() => new FrameDecoder().push(encodeFrame(0x1, 'x')), (e) => e.code === 1002);
  assert.throws(() => new FrameDecoder({ maxPayload: 10 }).push(encodeFrame(0x1, 'x'.repeat(11), { mask: randomBytes(4) })), (e) => e.code === 1009);
});

assert.ok(originAllowed('https://editor.flashfx.app', ['https://editor.flashfx.app']));
assert.ok(!originAllowed('https://editor.flashfx.app.evil.com', ['https://editor.flashfx.app']));
assert.ok(!originAllowed('http://editor.flashfx.app', ['https://editor.flashfx.app']));
assert.ok(originAllowed('http://127.0.0.1:5173', ['http://127.0.0.1:*']));
assert.ok(!originAllowed('http://127.0.0.1:5173.evil.com', ['http://127.0.0.1:*']));
assert.ok(!originAllowed(undefined, ['https://editor.flashfx.app']));
assert.ok(hostAllowed('127.0.0.1:4000', 4000) && hostAllowed('localhost:4000', 4000));
assert.ok(!hostAllowed('evil.com:4000', 4000) && !hostAllowed('127.0.0.1:4001', 4000));
passed += 1; console.log('  ok  origin / host rules (suffix, scheme and port tricks refused)');

// ---------------------------------------------------------------- live loopback shim ----------------
/** A raw WebSocket client acting as a browser tab (sets Origin / Host itself). */
function rawClient(port, { origin = 'https://editor.flashfx.app', host = `127.0.0.1:${port}`, path = '/link' } = {}) {
  return new Promise((resolve) => {
    const sock = connect(port, '127.0.0.1');
    const key = randomBytes(16).toString('base64');
    let head = Buffer.alloc(0);
    let upgraded = false;
    const dec = new FrameDecoder({ requireMask: false });
    const messages = [];
    const waiters = [];
    const client = {
      status: null,
      messages,
      send: (obj) => sock.write(encodeFrame(0x1, Buffer.from(JSON.stringify(obj)), { mask: randomBytes(4) })),
      next: (ms = 3000) => new Promise((res, rej) => {
        if (messages.length) { res(messages.shift()); return; }
        const t = setTimeout(() => rej(new Error('no message')), ms);
        waiters.push((m) => { clearTimeout(t); res(m); });
      }),
      closed: new Promise((res) => sock.on('close', res)),
      end: () => sock.destroy(),
    };
    sock.on('data', (chunk) => {
      if (!upgraded) {
        head = Buffer.concat([head, chunk]);
        const i = head.indexOf('\r\n\r\n');
        if (i === -1) return;
        client.status = Number(head.toString('latin1').split(' ')[1]);
        upgraded = client.status === 101;
        const rest = head.subarray(i + 4);
        resolve(client);
        if (!upgraded || !rest.length) return;
        chunk = rest;
      }
      for (const f of dec.push(chunk)) {
        if (f.opcode !== 0x1) continue;
        const m = JSON.parse(f.payload.toString('utf8'));
        const w = waiters.shift();
        if (w) w(m); else messages.push(m);
      }
    });
    sock.on('error', () => resolve(client));
    sock.write([`GET ${path} HTTP/1.1`, `Host: ${host}`, 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Key: ${key}`,
      'Sec-WebSocket-Version: 13', ...(origin ? [`Origin: ${origin}`] : []), '', ''].join('\r\n'));
  });
}

const hello = (extra) => ({ type: 'hello', bridgeVersion: 1, agentVersion: 'ffx-agent/1', manifestVersion: 1, appVersion: 'test', actions: ['agent.createProject', 'agent.exportMp4', 'agent.exportProject', 'agent.renderFrame', 'agent.importProject'], ...extra });

const srv = new LinkServer({ port: 0, allowedOrigins: ['https://editor.flashfx.app'], shimVersion: '9.9.9' });
const port = await srv.start();
const token = srv.newPairing();

await check('handshake refused: foreign Origin, missing Origin, rebinding Host, wrong path', async () => {
  assert.equal((await rawClient(port, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await rawClient(port, { origin: null })).status, 403);
  assert.equal((await rawClient(port, { host: `evil.example:${port}` })).status, 403);
  assert.equal((await rawClient(port, { path: '/' })).status, 404);
});

let tab;
let sessionKey;
await check('bad token -> bye; good token -> welcome with a session key; token is single-use', async () => {
  const bad = await rawClient(port);
  assert.equal(bad.status, 101);
  bad.send(hello({ token: 'f'.repeat(32) }));
  assert.deepEqual(await bad.next(), { type: 'bye', reason: 'bad-token' });
  tab = await rawClient(port);
  tab.send(hello({ token }));
  const w = await tab.next();
  assert.equal(w.type, 'welcome');
  assert.equal(w.shimVersion, '9.9.9');
  assert.match(w.sessionKey, /^[0-9a-f]{64}$/);
  sessionKey = w.sessionKey;
  assert.ok(srv.paired);
  assert.equal(srv.pairingToken, null);
  const reuse = await rawClient(port);
  reuse.send(hello({ token }));
  assert.equal((await reuse.next()).reason, 'bad-token');
});

await check('one tab at a time: a second pairing is refused while one is live', async () => {
  srv.newPairing();
  const second = await rawClient(port);
  second.send(hello({ token: srv.pairingToken }));
  assert.equal((await second.next()).reason, 'already-connected');
  srv.pairingToken = null;
});

await check('calls route by id; page errors become rejections', async () => {
  const p1 = srv.call('getState');
  const p2 = srv.call('run', ['editor.addText', {}]);
  const c1 = await tab.next();
  const c2 = await tab.next();
  assert.equal(c1.type, 'call');
  assert.equal(c1.method, 'getState');
  assert.deepEqual(c2.args, ['editor.addText', {}]);
  tab.send({ type: 'result', id: c2.id, ok: false, error: 'nope' });
  tab.send({ type: 'result', id: c1.id, ok: true, value: { layers: 3 } });
  assert.deepEqual(await p1, { layers: 3 });
  await assert.rejects(p2, /nope/);
});

await check('reload: the session key reconnects and replaces the old socket; pending calls fail cleanly', async () => {
  const pending = srv.call('getState', [], 5000);
  pending.catch(() => {}); // asserted below, after the reconnect
  await tab.next();
  const again = await rawClient(port);
  again.send(hello({ sessionKey }));
  assert.equal((await again.next()).type, 'welcome');
  await assert.rejects(pending, /reloaded during the call/);
  const p = srv.call('ping');
  const c = await again.next();
  again.send({ type: 'result', id: c.id, ok: true, value: { pong: true } });
  assert.deepEqual(await p, { pong: true });
  tab = again;
});

await check('pause / resume events are tracked; disconnect sends bye', async () => {
  srv.onPageMessage({ type: 'event', event: 'paused' });
  assert.ok(srv.paused);
  srv.onPageMessage({ type: 'event', event: 'resumed' });
  srv.disconnect('disconnected');
  assert.deepEqual(await tab.next(), { type: 'bye', reason: 'disconnected' });
  await tab.closed;
  assert.ok(!srv.paired);
  await srv.stop();
});

await check('output-folder fence: relative paths land inside, escapes are refused', () => {
  const ts = new TabSession({ outputDir: join(TMP, 'out'), linkPort: 0 });
  assert.equal(ts.outPath('a/b.mp4'), join(TMP, 'out', 'a', 'b.mp4'));
  assert.throws(() => ts.outPath('../escape.mp4'), /only writes inside/);
  assert.throws(() => ts.outPath(join(tmpdir(), 'elsewhere.mp4')), /only writes inside/);
});

// ---------------------------------------------------------------- early-access gate -----------------
const allow = join(TMP, 'allow.json');
writeFileSync(allow, JSON.stringify({ version: 1, codes: [{ hash: hashCode('FFX-GOOD-CODE-0000'), kind: 'founding' }, { hash: hashCode('FFX-OLD'), kind: 'early', revoked: true }] }));
await check('allowlist: none / unknown / revoked = personal; normalized match = full', async () => {
  assert.equal((await checkEntitlement({ allowlistPath: allow })).mode, 'personal');
  assert.equal((await checkEntitlement({ code: 'nope', allowlistPath: allow })).mode, 'personal');
  assert.equal((await checkEntitlement({ code: 'ffx-old', allowlistPath: allow })).mode, 'personal');
  const ok = await checkEntitlement({ code: 'ffx good code 0000', allowlistPath: allow });
  assert.equal(ok.mode, 'full');
  assert.equal(ok.kind, 'founding');
});
await check('remote endpoint: yes is cached; offline within 7 days = full; beyond = personal; a "no" clears the cache', async () => {
  const cachePath = join(TMP, 'ent.json');
  const yes = async () => ({ json: async () => ({ ok: true, kind: 'early', minVersion: '0.2.0' }) });
  const down = async () => { throw new Error('offline'); };
  const no = async () => ({ json: async () => ({ ok: false, reason: 'revoked' }) });
  const t0 = 1_800_000_000_000;
  const r1 = await checkEntitlement({ code: 'X'.repeat(20), version: '0.1.0', endpoint: 'https://e', cachePath, now: t0, fetchImpl: yes });
  assert.equal(r1.mode, 'full');
  assert.match(r1.updateRequired, /older than the minimum 0\.2\.0/);
  assert.equal((await checkEntitlement({ code: 'X'.repeat(20), endpoint: 'https://e', cachePath, now: t0 + GRACE_MS - 1, fetchImpl: down })).source, 'cache');
  assert.equal((await checkEntitlement({ code: 'X'.repeat(20), endpoint: 'https://e', cachePath, now: t0 + GRACE_MS + 1, fetchImpl: down })).mode, 'personal');
  assert.equal((await checkEntitlement({ code: 'X'.repeat(20), endpoint: 'https://e', cachePath, now: t0, fetchImpl: no })).mode, 'personal');
  assert.equal((await checkEntitlement({ code: 'X'.repeat(20), endpoint: 'https://e', cachePath, now: t0 + 1, fetchImpl: down })).mode, 'personal');
});
await check('gate: personal blocks render_frame / non-starter recipes only; full allows all', () => {
  const personal = { entitled: false };
  assert.match(gateMessage(personal, 'render_frame'), /early-access code/);
  assert.match(gateMessage(personal, 'apply_recipe', { id: 'end-card' }), /end-card/);
  assert.equal(gateMessage(personal, 'apply_recipe', { id: 'kinetic-title' }), null);
  assert.equal(gateMessage(personal, 'export_mp4'), null);
  assert.equal(gateMessage({ entitled: true }, 'render_frame'), null);
  assert.equal(gateMessage(null, 'render_frame'), null); // headless from source: no gate
});

// ---------------------------------------------------------------- packaged server -------------------
await check('package builds (no ../scripts, no esbuild inside) and the bundle answers MCP over stdio', async () => {
  const b = spawnSync(process.execPath, [join(ROOT, 'scripts/build-mcp-package.mjs'), '--no-zip'], { encoding: 'utf8' });
  assert.equal(b.status, 0, b.stderr);
  const proc = spawn(process.execPath, [join(ROOT, 'packages/flashfx-mcp/server/index.mjs')], {
    env: { ...process.env, FLASHFX_LINK_OPEN: '0', FLASHFX_LINK_PORT: '0', FLASHFX_ACCESS_CODE: '' }, stdio: ['pipe', 'pipe', 'pipe'],
  });
  let out = '';
  const got = new Promise((res) => proc.stdout.on('data', (d) => { out += d; if (out.split('\n').filter(Boolean).length >= 3) res(); }));
  proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })}\n`);
  proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })}\n`);
  proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'link_status', arguments: {} } })}\n`);
  await Promise.race([got, new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout: ${out}`)), 15000))]);
  proc.kill();
  const msgs = Object.fromEntries(out.split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((m) => [m.id, m]));
  assert.match(msgs[1].result.instructions, /FlashFX Link mode/);
  const names = msgs[2].result.tools.map((t) => t.name);
  for (const n of ['create_project', 'apply_recipe', 'export_mp4', 'export_project', 'link_status']) assert.ok(names.includes(n), n);
  const st = msgs[3].result.structuredContent;
  assert.equal(st.packaged, true);
  assert.equal(st.mode, 'auto');
  assert.equal(st.editorUrl, 'https://editor.flashfx.app');
  assert.equal(st.access.mode, 'personal');
  assert.match(st.pairingUrl, /^https:\/\/editor\.flashfx\.app\/#ffx-link=\d+\.[0-9a-f]{32}$/);
});

rmSync(TMP, { recursive: true, force: true });
console.log(`verify:mcp-link: ${passed} checks passed`);
