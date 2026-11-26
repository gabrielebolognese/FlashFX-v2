// gpu:bridge - end-to-end proof of FlashFX Link v1 (docs/MCP-PRODUCT-ARCHITECTURE.md): a REAL editor build
// with the Link flag on (VITE_FFX_LINK=1), a REAL Chrome (headless, launched like a user's browser: no
// anti-throttling flags), the REAL MCP server over stdio in --mode tab with an early-access code, and:
//
//   connect   the shim mints a pairing link; the tab opens it; the token is stripped from the address bar;
//             a real mouse click on Connect (a user gesture) pairs it
//   security  foreign Origin / rebinding Host refused; the used token cannot pair again; a second tab is
//             refused; writes outside the output folder refused; personal mode gates paid tools
//   build     create_project, apply_recipe (background + kinetic-title + pop-in), get_state, screenshot,
//             render_strip
//   export    export_mp4 (real exporter, MP4 checked) + export_project (.ffx) + save_project, then
//             import_project re-opens the .ffx with the same layers (editable round trip)
//   resilience a reload re-pairs by itself (session key, no click); Pause blocks calls, Resume restores;
//             a background (hidden) tab still answers; Disconnect drops the pairing
//
// Local only (needs Chrome + a GPU), like every gpu:* script:  npm run gpu:bridge
// Env: FLASHFX_BRIDGE_DIST=<dir> reuse a flagged build; FLASHFX_BRIDGE_OUT=<dir> keep the outputs there
// (default: a temp dir); FLASHFX_HEADED=1 to watch.

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { findChrome } from '../mcp/lib/find-chrome.mjs';
import { hashCode } from '../mcp/lib/entitlement.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WORK = mkdtempSync(join(tmpdir(), 'ffx-gpu-bridge-'));
const OUT = process.env.FLASHFX_BRIDGE_OUT ?? join(WORK, 'out');
mkdirSync(OUT, { recursive: true });
const report = { startedAt: new Date().toISOString(), checks: [], timings: {}, files: {} };
let failures = 0;

async function step(name, fn) {
  const t0 = Date.now();
  try {
    const detail = await fn();
    report.checks.push({ name, ok: true, ms: Date.now() - t0, ...(detail ? { detail } : {}) });
    console.log(`  ok  ${name}${detail ? `  ${JSON.stringify(detail).slice(0, 160)}` : ''}`);
  } catch (e) {
    failures += 1;
    report.checks.push({ name, ok: false, ms: Date.now() - t0, error: e.message });
    console.log(`  FAIL ${name}: ${e.message}`);
  }
}

// ------------------------------------------------------------------ 1. flagged editor build --------
function newestMtime(dir) {
  let n = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    n = Math.max(n, e.isDirectory() ? newestMtime(p) : statSync(p).mtimeMs);
  }
  return n;
}
const DIST = process.env.FLASHFX_BRIDGE_DIST ?? join(tmpdir(), 'flashfx-link-dist');
const srcNewest = Math.max(newestMtime(join(ROOT, 'src')), statSync(join(ROOT, 'index.html')).mtimeMs);
if (!process.env.FLASHFX_BRIDGE_DIST && (!existsSync(join(DIST, 'index.html')) || statSync(join(DIST, 'index.html')).mtimeMs < srcNewest)) {
  console.log(`building the editor with VITE_FFX_LINK=1 into ${DIST} ...`);
  const t0 = Date.now();
  const gen = spawnSync(process.execPath, [join(ROOT, 'scripts/gen-agent-manifest.mjs')], { cwd: ROOT, stdio: 'inherit' });
  assert.equal(gen.status, 0, 'gen-agent-manifest failed');
  const b = spawnSync(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', DIST, '--emptyOutDir', '--logLevel', 'warn'], {
    cwd: ROOT, stdio: 'inherit', env: { ...process.env, VITE_FFX_LINK: '1' },
  });
  assert.equal(b.status, 0, 'vite build failed');
  report.timings.buildMs = Date.now() - t0;
}
const builtBridge = readdirSync(join(DIST, 'assets')).some((f) => f.endsWith('.js') && readFileSync(join(DIST, 'assets', f), 'utf8').includes('ffx-link-session'));
assert.ok(builtBridge, 'the flagged build does not contain the FlashFX Link bridge');

// Static server with the SPA fallback (like Netlify).
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
const http = createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let p = normalize(join(DIST, url));
  if (!p.startsWith(normalize(DIST))) { res.writeHead(403); res.end(); return; }
  if (!existsSync(p) || statSync(p).isDirectory()) p = join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': MIME[extname(p).toLowerCase()] ?? 'application/octet-stream' });
  res.end(readFileSync(p));
});
await new Promise((r) => http.listen(0, '127.0.0.1', r));
const EDITOR = `http://127.0.0.1:${http.address().port}`;

// ------------------------------------------------------------------ 2. MCP server (stdio, tab mode) --
const CODE = `FFX-${randomBytes(16).toString('hex').toUpperCase()}`;
const allowlist = join(WORK, 'allowlist.json');
writeFileSync(allowlist, JSON.stringify({ version: 1, codes: [{ hash: hashCode(CODE), kind: 'team', label: 'gpu-bridge' }] }));

function startMcp(extraEnv = {}) {
  const proc = spawn(process.execPath, [join(ROOT, 'mcp/flashfx-mcp.mjs'), '--mode', 'tab', '--url', EDITOR, '--no-open', '--link-port', '0'], {
    cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, FLASHFX_OUTPUT_DIR: OUT, FLASHFX_ALLOWLIST: allowlist, FLASHFX_LINK_WAIT_MS: '60000', ...extraEnv },
  });
  const stderr = [];
  proc.stderr.on('data', (d) => { for (const l of String(d).split('\n').filter(Boolean)) stderr.push(l); });
  const pending = new Map();
  let id = 0;
  createInterface({ input: proc.stdout }).on('line', (line) => {
    const m = JSON.parse(line);
    if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  const request = (method, params = {}, timeoutMs = 300000) => new Promise((res, rej) => {
    const i = ++id;
    const t = setTimeout(() => { pending.delete(i); rej(new Error(`${method} timed out`)); }, timeoutMs);
    pending.set(i, (m) => { clearTimeout(t); m.error ? rej(new Error(m.error.message)) : res(m.result); });
    proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: i, method, params })}\n`);
  });
  const tool = async (name, args = {}, timeoutMs) => {
    const r = await request('tools/call', { name, arguments: args }, timeoutMs);
    if (r.isError) throw new Error(`${name}: ${r.content?.[0]?.text}`);
    return r.structuredContent ?? r;
  };
  const toolRaw = (name, args = {}, timeoutMs) => request('tools/call', { name, arguments: args }, timeoutMs);
  return { proc, request, tool, toolRaw, stderr };
}

// ------------------------------------------------------------------ 3. a user's Chrome ---------------
const chromePath = findChrome();
assert.ok(chromePath, 'no Chrome/Edge found (set CHROME_PATH)');
const profile = join(WORK, 'chrome-profile');
const devPort = await new Promise((r) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const headed = process.env.FLASHFX_HEADED === '1';
const chrome = spawn(chromePath, [
  '--enable-unsafe-webgpu', '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${devPort}`,
  `--user-data-dir=${profile}`, '--window-size=1600,1000', ...(headed ? [] : ['--headless=new']), 'about:blank',
], { stdio: 'ignore' });

async function cdpConnect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', () => j(new Error('cdp connect failed'))); });
  let n = 0;
  const pend = new Map();
  const logs = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.exceptionThrown') logs.push(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  });
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = ++n;
    pend.set(i, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result?.value;
  };
  return { ws, send, evaluate, logs };
}

let page;
const mcp = startMcp({ FLASHFX_ACCESS_CODE: CODE });
let pairingUrl;
let linkPort;

try {
  let target = null;
  for (let i = 0; i < 100 && !target; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${devPort}/json`)).json()).find((t) => t.type === 'page') ?? null; } catch { /* booting */ }
    if (!target) await sleep(150);
  }
  assert.ok(target, 'Chrome did not open a page');
  page = await cdpConnect(target.webSocketDebuggerUrl);
  await page.send('Runtime.enable');
  await page.send('Page.enable');
  // A returning user: no onboarding wizard / consent banner in the way (the same init the MCP uses).
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: "try{localStorage.setItem('flashfx_onboarding_seen','true');localStorage.setItem('ffx-analytics-consent','denied');localStorage.setItem('ffx-tutorial-seen','1')}catch(e){}" });
  if (!headed) await page.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });

  const waitFor = async (expr, timeoutMs = 120000, what = expr) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      try { const v = await page.evaluate(expr); if (v) return v; } catch { /* navigating */ }
      await sleep(250);
    }
    throw new Error(`timed out waiting for ${what}. page errors: ${page.logs.slice(-5).join(' | ')}`);
  };
  const clickSelector = async (sel) => {
    const r = await waitFor(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`, 30000, sel);
    for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: 'left', clickCount: 1 });
  };
  const rawWs = (port, { origin, host = `127.0.0.1:${port}` }) => new Promise((res) => {
    const s = connect(port, '127.0.0.1');
    let buf = '';
    s.on('data', (d) => { buf += d; if (buf.includes('\r\n\r\n')) { s.destroy(); res(Number(buf.split(' ')[1])); } });
    s.on('error', () => res(-1));
    s.write([`GET /link HTTP/1.1`, `Host: ${host}`, 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Key: ${randomBytes(16).toString('base64')}`, 'Sec-WebSocket-Version: 13', `Origin: ${origin}`, '', ''].join('\r\n'));
  });

  await step('MCP initialize over stdio (tab mode, early-access code)', async () => {
    const init = await mcp.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'gpu-bridge', version: '1' } });
    assert.match(init.instructions, /FlashFX Link mode/);
    const st = await mcp.tool('link_status');
    assert.equal(st.paired, false);
    assert.equal(st.access.mode, 'full');
    pairingUrl = st.pairingUrl;
    linkPort = st.port;
    assert.match(pairingUrl, new RegExp(`^${EDITOR.replace(/[.]/g, '\\.')}/#ffx-link=\\d+\\.[0-9a-f]{32}$`));
    return { port: linkPort, access: st.access.kind };
  });

  await step('connect: the tab opens the pairing link, the token leaves the address bar, Connect pairs it', async () => {
    const t0 = Date.now();
    await page.send('Page.navigate', { url: pairingUrl });
    await waitFor("typeof window.__ffxAgent === 'object' && !!document.querySelector('[data-ffx-link-card=\"pending\"]')", 180000, 'the Connect Claude card');
    report.timings.editorBootMs = Date.now() - t0;
    const href = await page.evaluate('location.href');
    assert.ok(!href.includes('ffx-link='), `token still in the URL: ${href}`);
    await clickSelector('[data-ffx-link-card="pending"] button.inline-flex');
    await waitFor("!!document.querySelector('[data-ffx-link-banner=\"connected\"]')", 20000, 'the connected banner');
    const st = await mcp.tool('link_status');
    assert.equal(st.paired, true);
    assert.deepEqual(st.editor.missingActions, []);
    return { editorActions: st.editor.actions, bootMs: report.timings.editorBootMs };
  });

  await step('security: foreign Origin and rebinding Host refused; the used token cannot pair a second tab', async () => {
    assert.equal(await rawWs(linkPort, { origin: 'https://evil.example' }), 403);
    assert.equal(await rawWs(linkPort, { origin: EDITOR, host: `attacker.test:${linkPort}` }), 403);
    // A second tab with the same (already used) link: it must not take over.
    const second = await page.send('Target.createTarget', { url: pairingUrl });
    const t2 = (await (await fetch(`http://127.0.0.1:${devPort}/json`)).json()).find((t) => t.id === second.targetId);
    const p2 = await cdpConnect(t2.webSocketDebuggerUrl);
    await p2.send('Runtime.enable');
    const t0 = Date.now();
    let card = null;
    while (Date.now() - t0 < 120000 && !card) { try { card = await p2.evaluate("document.querySelector('[data-ffx-link-card]')?.getAttribute('data-ffx-link-card')"); } catch { /* boot */ } if (!card) await sleep(300); }
    assert.equal(card, 'pending');
    const pos = await p2.evaluate("(() => { const b = document.querySelector('[data-ffx-link-card=\"pending\"] button.inline-flex').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()");
    for (const type of ['mousePressed', 'mouseReleased']) await p2.send('Input.dispatchMouseEvent', { type, x: pos.x, y: pos.y, button: 'left', clickCount: 1 });
    let err = null;
    const t1 = Date.now();
    while (Date.now() - t1 < 15000 && !err) { err = await p2.evaluate("document.querySelector('[data-ffx-link-error]')?.textContent ?? null"); if (!err) await sleep(200); }
    assert.match(String(err), /expired|already connected/);
    p2.ws.close();
    await page.send('Target.closeTarget', { targetId: second.targetId });
    await page.send('Target.activateTarget', { targetId: target.id }).catch(() => {});
    const st = await mcp.tool('link_status');
    assert.equal(st.paired, true, 'the first tab must still be paired');
    return { secondTab: err, refused: st.refused.map((r) => r.reason) };
  });

  let layerCount = 0;
  await step('build: create_project + apply_recipe background, kinetic-title, pop-in', async () => {
    await mcp.tool('create_project', { name: 'Link e2e', format: 'long', durationFrames: 90, clipLength: 'comp' }, 180000);
    await mcp.tool('apply_recipe', { id: 'background', params: {}, startFrame: 0 });
    const title = await mcp.tool('apply_recipe', { id: 'kinetic-title', params: { text: 'Hello World' }, startFrame: 0, endFrame: 90 });
    await mcp.tool('apply_recipe', { id: 'pop-in', params: { label: 'MADE WITH CLAUDE', y: 780 }, startFrame: 30, endFrame: 90 });
    const st = await mcp.tool('get_state');
    layerCount = st.layers.length;
    assert.ok(layerCount >= 3, `expected layers, got ${layerCount}`);
    assert.ok(st.layers.some((l) => /Hello/.test(String(l.text ?? l.name ?? ''))), 'the title text layer is missing');
    return { layers: layerCount, undoDepth: st.canUndo, titleCheckFrames: title.checkFrames };
  });

  await step('look: screenshot (inline PNG) + render_strip (early-access tool)', async () => {
    const shot = await mcp.toolRaw('screenshot', { path: 'e2e/shot.png' });
    assert.ok(!shot.isError, shot.content?.[0]?.text);
    assert.ok(shot.content.some((c) => c.type === 'image' && c.mimeType === 'image/png'));
    const strip = await mcp.tool('render_strip', { frames: [0, 15, 30, 60, 89], path: 'e2e/strip.png', inline: false });
    report.files.strip = strip.path;
    assert.ok(statSync(strip.path).size > 5000);
    return { screenshot: shot.structuredContent.path, strip: strip.path };
  });

  await step('export: export_mp4 through the real exporter writes a valid MP4 inside the output folder', async () => {
    const r = await mcp.tool('export_mp4', { path: 'e2e/link-e2e.mp4' }, 900000);
    const buf = readFileSync(r.result.path);
    assert.equal(buf.toString('latin1', 4, 8), 'ftyp');
    assert.ok(buf.length > 20000, `mp4 too small: ${buf.length}`);
    report.files.mp4 = r.result.path;
    const ff = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,width,height,nb_frames', '-of', 'json', r.result.path], { encoding: 'utf8' });
    const probe = ff.status === 0 ? JSON.parse(ff.stdout).streams?.[0] : null;
    return { path: r.result.path, bytes: buf.length, ...(probe ? { probe } : { probe: 'ffprobe not available' }) };
  });

  await step('save: export_project (.ffx) + save_project; writes outside the output folder are refused', async () => {
    const r = await mcp.tool('export_project', { path: 'e2e/link-e2e.ffx' }, 300000);
    assert.ok(statSync(r.result.path).size > 500);
    report.files.ffx = r.result.path;
    await mcp.tool('save_project');
    const escape = await mcp.toolRaw('export_project', { path: join(tmpdir(), 'escape.ffx') });
    assert.ok(escape.isError && /only writes inside/.test(escape.content[0].text));
    return { path: r.result.path, bytes: statSync(r.result.path).size };
  });

  await step('editable round trip: import_project re-opens the .ffx with the same layers', async () => {
    await mcp.tool('import_project', { path: report.files.ffx }, 300000);
    const st = await mcp.tool('get_state');
    assert.equal(st.layers.length, layerCount);
    assert.ok(st.layers.some((l) => /Hello/.test(String(l.text ?? l.name ?? ''))));
    return { layers: st.layers.length };
  });

  await step('reload: the tab re-pairs by itself (session key, no new click); agent.listProjects + agent.openProject continue the project', async () => {
    await page.send('Page.reload');
    await sleep(1500);
    await waitFor("!!document.querySelector('[data-ffx-link-banner=\"connected\"]')", 180000, 'auto re-pair after reload');
    const list = (await mcp.tool('run_action', { actionId: 'agent.listProjects' })).result;
    assert.ok(list.projects.length >= 1, 'no projects listed');
    const latest = list.projects[0];
    const opened = (await mcp.tool('run_action', { actionId: 'agent.openProject', args: { projectId: latest.id } }, 180000)).result;
    const st = await mcp.tool('get_state');
    assert.equal(st.layers.length, layerCount);
    return { activeAfterReload: list.activeProjectId, reopened: opened.name, layers: st.layers.length };
  });

  await step('pause blocks Claude, resume restores', async () => {
    await clickSelector('[aria-label="Pause Claude"]');
    await waitFor("!!document.querySelector('[data-ffx-link-banner=\"paused\"]')", 5000);
    const r = await mcp.toolRaw('run_action', { actionId: 'agent.seek', args: { frame: 10 } });
    assert.ok(r.isError && /paused/.test(r.content[0].text), r.content?.[0]?.text);
    await clickSelector('[aria-label="Resume Claude"]');
    await waitFor("!!document.querySelector('[data-ffx-link-banner=\"connected\"]')", 5000);
    await mcp.tool('run_action', { actionId: 'agent.seek', args: { frame: 10 } });
  });

  await step('hidden tab (R2): calls still complete with the editor in a background tab', async () => {
    const other = await page.send('Target.createTarget', { url: 'about:blank' });
    await page.send('Target.activateTarget', { targetId: other.targetId }).catch(() => {});
    await sleep(800);
    const visibility = await page.evaluate('document.visibilityState');
    // Each call on its own, so the report shows exactly which kind of call a hidden tab stalls.
    const calls = [
      ['get_state', {}],
      ['run_action', { actionId: 'editor.addText', args: ['Background tab'] }],
      ['run_action', { actionId: 'agent.seek', args: { frame: 45 } }],
      ['screenshot', { path: 'e2e/hidden-tab.png', inline: false }],
    ];
    const results = [];
    for (const [name, args] of calls) {
      const t0 = Date.now();
      try {
        const r = await mcp.toolRaw(name, args, 150000);
        results.push({ call: args.actionId ?? name, ok: !r.isError, ms: Date.now() - t0, ...(r.isError ? { error: r.content?.[0]?.text?.slice(0, 160) } : {}) });
      } catch (e) {
        results.push({ call: args.actionId ?? name, ok: false, ms: Date.now() - t0, error: e.message });
      }
    }
    await page.send('Target.closeTarget', { targetId: other.targetId });
    await page.send('Target.activateTarget', { targetId: target.id }).catch(() => {});
    report.hiddenTab = { visibilityState: visibility, results };
    assert.ok(results.every((r) => r.ok), `hidden tab stalled: ${JSON.stringify(results)}`);
    return { visibilityState: visibility, results };
  });

  await step('disconnect: close_browser drops the pairing; the tab shows it', async () => {
    await mcp.tool('close_browser');
    await waitFor("!document.querySelector('[data-ffx-link-banner]')", 10000, 'banner gone');
    const st = await mcp.tool('link_status');
    assert.equal(st.paired, false);
    assert.match(st.pairingUrl, /#ffx-link=/);
    assert.ok(st.pairingUrl !== pairingUrl, 'a fresh pairing link is minted');
  });

  await step('personal mode (no access code): render_frame and non-starter recipes are refused before any browser work', async () => {
    const free = startMcp({ FLASHFX_ACCESS_CODE: '' });
    try {
      await free.request('initialize', {});
      const rf = await free.toolRaw('render_frame', {});
      assert.ok(rf.isError && /early-access code/.test(rf.content[0].text));
      const ec = await free.toolRaw('apply_recipe', { id: 'end-card' });
      assert.ok(ec.isError && /personal mode includes/.test(ec.content[0].text));
      const st = await free.tool('link_status');
      assert.equal(st.access.mode, 'personal');
      return { recipes: st.access.recipes };
    } finally { free.proc.kill(); }
  });
} finally {
  report.finishedAt = new Date().toISOString();
  report.passed = report.checks.filter((c) => c.ok).length;
  report.failed = failures;
  report.mcpStderrTail = mcp.stderr.slice(-15);
  writeFileSync(join(OUT, 'gpu-bridge-report.json'), JSON.stringify(report, null, 2));
  try { page?.ws.close(); } catch { /* closed */ }
  mcp.proc.kill();
  chrome.kill();
  http.close();
  await sleep(300);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome lock */ }
}

if (process.env.FLASHFX_BRIDGE_OUT) {
  for (const k of Object.keys(report.files)) {
    if (!report.files[k].startsWith(OUT)) copyFileSync(report.files[k], join(OUT, `copy-${k}`));
  }
}
console.log(`\ngpu:bridge: ${report.passed}/${report.checks.length} passed. Report: ${join(OUT, 'gpu-bridge-report.json')}`);
process.exit(failures ? 1 : 0);
