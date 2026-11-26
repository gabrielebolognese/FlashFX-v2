// FlashFX Link, shim side (docs/MCP-PRODUCT-ARCHITECTURE.md, option B / v1): instead of launching its own
// Chrome over CDP (session.mjs, "headless" mode), the MCP server pairs with the user's OWN editor tab
// (editor.flashfx.app in their normal browser) over a loopback WebSocket and relays every call to the
// page's whitelisted `window.__ffxAgent` runtime through src/agent/bridge.ts. The project Claude builds is
// a normal project in the user's own project list, autosaved, one undo step per action.
//
// Security (R6): binds 127.0.0.1 only; accepts only the editor Origin(s) and a loopback Host header (blocks
// DNS rebinding); a 128-bit pairing token travels in the URL fragment and is single-use; one tab at a time;
// the reconnect session key is 256-bit and per tab; writes land only inside the output folder.
//
// TabSession implements the same session surface the tool layer uses (see FlashFxSession in session.mjs).

import { spawn } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { acceptUpgrade } from './ws-server.mjs';

export const LINK_BRIDGE_VERSION = 1;
export const DEFAULT_EDITOR_URL = 'https://editor.flashfx.app';
export const DEFAULT_LINK_PORT = 47615;
/** Actions the tool layer cannot work without: an older editor build is reported instead of half-working. */
export const REQUIRED_ACTIONS = ['agent.createProject', 'agent.exportMp4', 'agent.exportProject', 'agent.renderFrame', 'agent.importProject'];

const log = (...a) => process.stderr.write(`[flashfx-link] ${a.join(' ')}\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Exact origins, or `http://127.0.0.1:*` / `http://localhost:*` style port wildcards. */
export function originAllowed(origin, allowed) {
  if (typeof origin !== 'string' || !origin) return false;
  return allowed.some((a) => {
    if (a.endsWith(':*')) {
      const base = a.slice(0, -2);
      return origin.startsWith(`${base}:`) && /^\d{1,5}$/.test(origin.slice(base.length + 1));
    }
    return origin === a;
  });
}

/** The Host header must name the loopback port we bound (a DNS-rebinding page sends its own host name). */
export function hostAllowed(host, port) {
  return host === `127.0.0.1:${port}` || host === `localhost:${port}` || host === `[::1]:${port}`;
}

function sameSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Open a URL in the user's default browser. */
export function openInBrowser(url) {
  const [cmd, args] = process.platform === 'win32'
    ? ['cmd', ['/c', 'start', '""', `"${url}"`]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try {
    const p = spawn(cmd, args, { stdio: 'ignore', detached: true, windowsVerbatimArguments: process.platform === 'win32' });
    p.on('error', () => log(`could not open the browser: open ${url} by hand`));
    p.unref();
  } catch { log(`could not open the browser: open ${url} by hand`); }
}

/**
 * The loopback WebSocket endpoint + pairing state + call routing. One paired tab at a time.
 */
export class LinkServer {
  constructor({ port = DEFAULT_LINK_PORT, allowedOrigins, shimVersion = '0.0.0', mode = 'personal', client = 'Claude' }) {
    this.wantPort = port;
    this.port = null;
    this.allowedOrigins = allowedOrigins;
    this.shimVersion = shimVersion;
    this.mode = mode;
    this.client = client;
    this.server = null;
    this.pairingToken = null;
    this.sessionKey = null;
    this.conn = null;
    this.hello = null;
    this.paused = false;
    this.seq = 0;
    this.pending = new Map();
    this.logs = [];
    this.waiters = new Set();
    this.rejected = []; // last refused handshakes, for link_status / tests
  }

  async start() {
    if (this.server) return this.port;
    const server = createServer((req, res) => { res.writeHead(404); res.end(); });
    server.on('upgrade', (req, socket) => this.onUpgrade(req, socket));
    const listen = (p) => new Promise((res, rej) => {
      server.once('error', rej);
      server.listen(p, '127.0.0.1', () => { server.off('error', rej); res(server.address().port); });
    });
    try {
      this.port = await listen(this.wantPort);
    } catch (e) {
      if (e.code !== 'EADDRINUSE' || this.wantPort === 0) throw e;
      log(`port ${this.wantPort} is busy (another FlashFX Link?), using a free port`);
      this.port = await listen(0);
    }
    this.server = server;
    log(`listening on 127.0.0.1:${this.port}`);
    return this.port;
  }

  /** A fresh single-use pairing token (invalidates any older one). */
  newPairing() {
    this.pairingToken = randomBytes(16).toString('hex');
    return this.pairingToken;
  }

  pairingUrl(editorUrl) {
    if (!this.pairingToken) this.newPairing();
    return `${editorUrl}/#ffx-link=${this.port}.${this.pairingToken}`;
  }

  get paired() { return !!(this.conn && !this.conn.closed && this.hello); }

  refuse(status, reason, detail) {
    this.rejected.push({ status, reason: detail ?? reason });
    if (this.rejected.length > 20) this.rejected.shift();
    log(`refused a connection: ${detail ?? reason}`);
    return { status, reason };
  }

  onUpgrade(req, socket) {
    const conn = acceptUpgrade(req, socket, (r) => {
      const path = (r.url ?? '').split('?')[0];
      if (path !== '/link') return this.refuse(404, 'Not Found', `path ${path}`);
      if (!hostAllowed(r.headers.host, this.port)) return this.refuse(403, 'Forbidden', `host ${r.headers.host}`);
      if (!originAllowed(r.headers.origin, this.allowedOrigins)) return this.refuse(403, 'Forbidden', `origin ${r.headers.origin ?? '(none)'}`);
      return null;
    });
    if (!conn) return;
    let greeted = false;
    const helloTimer = setTimeout(() => { if (!greeted) conn.close(1008, 'no hello'); }, 10000);
    conn.on('message', (data, isBinary) => {
      if (isBinary) return; // the v1 protocol is JSON text only
      let msg;
      try { msg = JSON.parse(data); } catch { conn.close(1007, 'bad json'); return; }
      if (!greeted) {
        greeted = true;
        clearTimeout(helloTimer);
        this.onHello(conn, msg);
        return;
      }
      if (conn !== this.conn) return;
      this.onPageMessage(msg);
    });
    conn.on('close', () => {
      clearTimeout(helloTimer);
      if (conn !== this.conn) return;
      this.conn = null;
      this.hello = null;
      this.paused = false;
      this.failPending('the FlashFX tab disconnected (closed, reloaded or the user clicked Disconnect)');
      log('tab disconnected');
    });
  }

  onHello(conn, msg) {
    const bye = (reason) => { conn.send(JSON.stringify({ type: 'bye', reason })); conn.close(1008, reason); this.rejected.push({ status: 'bye', reason }); };
    if (!msg || msg.type !== 'hello') return bye('no-hello');
    if (msg.bridgeVersion !== LINK_BRIDGE_VERSION) return bye('incompatible');
    const byToken = sameSecret(msg.token, this.pairingToken);
    const bySession = !byToken && sameSecret(msg.sessionKey, this.sessionKey);
    if (!byToken && !bySession) return bye(msg.sessionKey ? 'unknown-session' : 'bad-token');
    // One tab at a time. A reconnect with the session key replaces the old (possibly half-dead) socket;
    // a second pairing token for a different tab is refused while one is live.
    if (this.paired && !bySession) return bye('already-connected');
    if (this.conn && this.conn !== conn) {
      const old = this.conn;
      this.conn = null;
      old.close(1000, 'replaced');
      // Calls sent to the old socket will never be answered (the page reloaded): fail them now.
      this.failPending('the FlashFX tab reloaded during the call; check get_state and retry');
    }
    if (byToken) {
      this.pairingToken = null; // single use
      this.sessionKey = randomBytes(32).toString('hex');
    }
    this.conn = conn;
    this.hello = {
      agentVersion: String(msg.agentVersion ?? ''),
      manifestVersion: msg.manifestVersion,
      appVersion: String(msg.appVersion ?? ''),
      actions: Array.isArray(msg.actions) ? msg.actions.map(String) : [],
    };
    this.paused = false;
    conn.send(JSON.stringify({ type: 'welcome', sessionKey: this.sessionKey, shimVersion: this.shimVersion, mode: this.mode, client: this.client }));
    log(`tab paired (${byToken ? 'new pairing' : 'reconnect'}, editor ${this.hello.appVersion}, ${this.hello.actions.length} actions)`);
    for (const w of this.waiters) w();
    this.waiters.clear();
  }

  onPageMessage(msg) {
    if (msg?.type === 'result') {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.ok) p.resolve(msg.value); else p.reject(new Error(String(msg.error ?? 'failed in the page')));
      return;
    }
    if (msg?.type === 'event') {
      if (msg.event === 'log') { this.logs.push(String(msg.line).slice(0, 500)); if (this.logs.length > 200) this.logs.shift(); }
      if (msg.event === 'paused') this.paused = true;
      if (msg.event === 'resumed') this.paused = false;
    }
  }

  failPending(message) {
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error(message)); }
    this.pending.clear();
  }

  /** Resolve when a tab pairs (or false after timeoutMs). */
  waitForPairing(timeoutMs) {
    if (this.paired) return Promise.resolve(true);
    return new Promise((res) => {
      const done = () => { clearTimeout(t); res(true); };
      const t = setTimeout(() => { this.waiters.delete(done); res(false); }, timeoutMs);
      this.waiters.add(done);
    });
  }

  /** Call a page method (src/agent/linkProtocol.ts LINK_METHODS). */
  call(method, args = [], timeoutMs = 120000) {
    if (!this.paired) return Promise.reject(new Error('no FlashFX tab is connected'));
    const id = ++this.seq;
    return new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`the FlashFX tab did not answer ${method} within ${Math.round(timeoutMs / 1000)} s. If the tab is in the background or minimised, ask the user to bring it to the front.`));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolvePromise, reject, timer });
      this.conn.send(JSON.stringify({ type: 'call', id, method, args }));
    });
  }

  disconnect(reason = 'disconnected') {
    if (this.conn) {
      this.conn.send(JSON.stringify({ type: 'bye', reason }));
      this.conn.close(1000, reason);
    }
    this.sessionKey = null;
  }

  async stop() {
    this.disconnect('shim-stopped');
    if (this.server) { await new Promise((r) => this.server.close(() => r())); this.server = null; }
  }
}

/**
 * The session surface of the MCP tool layer, backed by the user's own editor tab.
 * config: { url, linkPort, linkOpen, linkWaitMs, outputDir, extraOrigins, shimVersion, mode }
 */
export class TabSession {
  constructor(config) {
    this.config = config;
    this.kind = 'tab';
    this.editorUrl = (config.url ?? DEFAULT_EDITOR_URL).replace(/\/+$/, '');
    const origins = [new URL(this.editorUrl).origin, ...(config.extraOrigins ?? [])];
    if (!origins.includes(new URL(DEFAULT_EDITOR_URL).origin) && !config.url) origins.push(new URL(DEFAULT_EDITOR_URL).origin);
    this.link = new LinkServer({
      port: config.linkPort ?? DEFAULT_LINK_PORT,
      allowedOrigins: [...new Set(origins)],
      shimVersion: config.shimVersion ?? '0.0.0',
      mode: config.mode === 'full' ? 'full' : 'personal',
    });
    this.outputDir = resolve(config.outputDir ?? join(homedir(), 'FlashFX', 'exports'));
    this.openedFor = null; // the pairing token we last opened the browser with
    this.uploadSeq = 0;
  }

  /** Bind the loopback port and mint a pairing link (does not open the browser). */
  async prepare() {
    await this.link.start();
    if (!this.link.paired && !this.link.pairingToken) this.link.newPairing();
    return { port: this.link.port, pairingUrl: this.link.paired ? null : this.link.pairingUrl(this.editorUrl) };
  }

  status() {
    const h = this.link.hello;
    return {
      transport: 'tab',
      editorUrl: this.editorUrl,
      port: this.link.port,
      paired: this.link.paired,
      paused: this.link.paused,
      pairingUrl: this.link.paired || !this.link.port ? null : this.link.pairingUrl(this.editorUrl),
      editor: h ? { appVersion: h.appVersion, actions: h.actions.length, missingActions: REQUIRED_ACTIONS.filter((a) => !h.actions.includes(a)) } : null,
      allowedOrigins: this.link.allowedOrigins,
      outputDir: this.outputDir,
      refused: this.link.rejected.slice(-5),
    };
  }

  async baseUrl() { return this.editorUrl; }

  async manifest() {
    if (this.link.paired) return this.link.call('listFeatures');
    try {
      const r = await fetch(`${this.editorUrl}/agent/features.json`, { signal: AbortSignal.timeout(10000) });
      if (r.ok && (r.headers.get('content-type') ?? '').includes('json')) return await r.json();
    } catch { /* fall through to the tab */ }
    await this.ensure();
    return this.link.call('listFeatures');
  }

  /** Pair with a tab: open the editor in the user's browser once per pairing link, then wait. */
  async ensure(waitMs = this.config.linkWaitMs ?? 180000) {
    if (this.link.paired) return this.checkCompat();
    const { pairingUrl } = await this.prepare();
    if (this.config.linkOpen !== false && this.openedFor !== this.link.pairingToken) {
      this.openedFor = this.link.pairingToken;
      log(`opening ${this.editorUrl} in your browser to connect`);
      openInBrowser(pairingUrl);
    } else if (this.config.linkOpen === false) {
      log(`waiting for a tab: open ${pairingUrl}`);
    }
    const ok = await this.link.waitForPairing(waitMs);
    if (!ok) {
      throw new Error(`FlashFX is not connected yet. A FlashFX editor tab should have opened in the browser: ask the user to click Connect on the "Connect Claude" card there, then Allow if the browser asks about apps on this device. If no tab opened, ask them to open this link: ${this.link.pairingUrl(this.editorUrl)}`);
    }
    return this.checkCompat();
  }

  checkCompat() {
    const missing = REQUIRED_ACTIONS.filter((a) => !this.link.hello.actions.includes(a));
    if (missing.length) throw new Error(`the connected FlashFX editor is older than this FlashFX Link (missing ${missing.join(', ')}). Ask the user to reload the editor tab; if it persists, the editor update is not live yet.`);
  }

  /** Resolve a write target inside the output folder (relative paths land in it; others are refused). */
  outPath(p, fallbackName) {
    const target = resolve(this.outputDir, p ?? fallbackName);
    const rel = relative(this.outputDir, target);
    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new Error(`FlashFX Link only writes inside the output folder ${this.outputDir} (got ${p}). Use a relative path like "my-title.mp4".`);
    }
    mkdirSync(dirname(target), { recursive: true });
    return target;
  }

  async run(actionId, args, timeoutMs = 120000) {
    await this.ensure();
    if (this.link.paused) throw new Error('the user paused Claude in the FlashFX tab: ask them to click Resume');
    return this.link.call('run', [String(actionId), args], timeoutMs);
  }

  async state() {
    await this.ensure();
    return this.link.call('getState');
  }

  /** In tab mode a screenshot is a rendered frame (the page's offscreen export path), up to 1280 px wide. */
  async screenshot({ path, inline = true } = {}) {
    await this.ensure();
    const st = await this.link.call('getState');
    const width = Math.min(1280, st.width ?? 1280);
    const r = await this.renderFrame(path ?? `screenshots/screenshot-${Date.now()}.png`, { width });
    if (!r?.ok) throw new Error(r?.error ?? 'render failed');
    const { path: outPath, width: w, height: h } = r.result;
    return { path: outPath, width: w, height: h, canvasRect: null, inlineJpeg: null, inlinePng: inline ? readFileSync(outPath).toString('base64') : null };
  }

  async exportMp4(path, opts = {}, timeoutMs = 3600000) {
    const outPath = this.outPath(path, 'flashfx.mp4');
    const r = await this.run('agent.exportMp4', opts, timeoutMs);
    if (!r?.ok) return r;
    const { exportId, bytes, audioDropped } = r.result;
    await this.streamExport(exportId, bytes, outPath);
    return { ok: true, actionId: 'agent.exportMp4', result: { path: outPath, bytes, audioDropped } };
  }

  async renderFrame(path, opts = {}, timeoutMs = 300000) {
    const r = await this.run('agent.renderFrame', opts, timeoutMs);
    if (!r?.ok) return r;
    const { exportId, bytes, frame, width, height } = r.result;
    const outPath = this.outPath(path, `frames/frame-${frame}.png`);
    await this.streamExport(exportId, bytes, outPath);
    return { ok: true, actionId: 'agent.renderFrame', result: { path: outPath, bytes, frame, width, height } };
  }

  async renderStrip(path, opts = {}, timeoutMs = 900000) {
    const r = await this.run('agent.renderStrip', opts, timeoutMs);
    if (!r?.ok) return r;
    const { exportId, bytes, ...info } = r.result;
    const outPath = this.outPath(path, `frames/strip-${info.frames.join('-').slice(0, 60)}.png`);
    await this.streamExport(exportId, bytes, outPath);
    return { ok: true, actionId: 'agent.renderStrip', result: { path: outPath, bytes, ...info } };
  }

  async exportProject(path, timeoutMs = 600000) {
    const outPath = this.outPath(path, 'flashfx-project.ffx');
    const r = await this.run('agent.exportProject', undefined, timeoutMs);
    if (!r?.ok) return r;
    const { exportId, bytes, fileName, projectId } = r.result;
    await this.streamExport(exportId, bytes, outPath);
    return { ok: true, actionId: 'agent.exportProject', result: { path: outPath, bytes, fileName, projectId } };
  }

  async importFile(actionId, path, extraArgs = {}, timeoutMs = 600000) {
    const inPath = resolve(path);
    if (!existsSync(inPath)) throw new Error(`no such file: ${inPath}`);
    const data = readFileSync(inPath).toString('base64');
    return this.run(actionId, { data, fileName: basename(inPath), ...extraArgs }, timeoutMs);
  }

  async importFileChunked(actionId, path, extraArgs = {}, timeoutMs = 600000) {
    const inPath = resolve(path);
    if (!existsSync(inPath)) throw new Error(`no such file: ${inPath}`);
    await this.ensure();
    const bytes = readFileSync(inPath);
    const uploadId = `link-${process.pid}-${++this.uploadSeq}`;
    const CHUNK = Number(process.env.FLASHFX_UPLOAD_CHUNK) > 0 ? Number(process.env.FLASHFX_UPLOAD_CHUNK) : 4 * 1024 * 1024;
    try {
      for (let off = 0; off < bytes.length; off += CHUNK) {
        await this.link.call('writeUpload', [uploadId, off, bytes.subarray(off, off + CHUNK).toString('base64')], 120000);
      }
    } catch (e) {
      await this.link.call('discardUpload', [uploadId]).catch(() => {});
      throw e;
    }
    return this.run(actionId, { uploadId, fileName: basename(inPath), ...extraArgs }, timeoutMs);
  }

  async streamExport(exportId, bytes, outPath) {
    const out = createWriteStream(outPath);
    const CHUNK = 4 * 1024 * 1024;
    try {
      for (let off = 0; off < bytes; off += CHUNK) {
        const c = await this.link.call('readExport', [exportId, off, CHUNK], 120000);
        if (!out.write(Buffer.from(c.base64, 'base64'))) await new Promise((r) => out.once('drain', r));
      }
    } finally {
      await new Promise((r) => out.end(r));
      await this.link.call('releaseExport', [exportId]).catch(() => {});
    }
    return outPath;
  }

  recentLogs(n = 20) { return this.link.logs.slice(-n); }

  /** The tab belongs to the user: "closing" only drops the pairing (the next call opens a fresh link). */
  async closeBrowser() {
    this.link.disconnect('disconnected');
    this.openedFor = null;
    await sleep(50);
  }

  async shutdown() { await this.link.stop(); }
}
