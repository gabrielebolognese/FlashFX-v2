// One FlashFX browser session for the MCP server: an app server (Vite dev, the built dist/, or an
// external URL), a Chrome with WebGPU (launched headless / headed, or attached to over a debugging
// port) and a Chrome DevTools Protocol connection to the FlashFX tab. Everything that changes the
// project goes through the in-app agent runtime `window.__ffxAgent` (src/agent/runtime.ts) - the
// whitelisted store actions the UI itself uses - never through DOM clicks.
//
// No dependencies beyond Node 22 (built-in fetch + WebSocket), same approach as
// scripts/lib/headless-gpu.mjs (whose Chrome finder is reused).

import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChrome } from '../../scripts/lib/headless-gpu.mjs';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => process.stderr.write(`[flashfx-mcp] ${a.join(' ')}\n`);

/** Read the session config from CLI args (win) and env vars. */
export function readConfig(argv = process.argv.slice(2), env = process.env) {
  const arg = (name) => {
    const i = argv.indexOf(`--${name}`);
    if (i === -1) return undefined;
    const v = argv[i + 1];
    return v === undefined || v.startsWith('--') ? true : v;
  };
  const flag = (name, envName) => {
    const a = arg(name);
    if (a !== undefined) return a !== 'false' && a !== '0';
    const e = env[envName];
    return e !== undefined && e !== '' && e !== '0' && e !== 'false';
  };
  const url = arg('url') ?? env.FLASHFX_URL;
  const server = arg('server') ?? env.FLASHFX_SERVER ?? (url ? 'none' : 'dev');
  const [w, h] = String(arg('window') ?? env.FLASHFX_WINDOW ?? '1920x1080').split('x').map((n) => parseInt(n, 10));
  const attach = arg('attach') ?? env.FLASHFX_CDP_PORT;
  return {
    url: typeof url === 'string' ? url.replace(/\/+$/, '') : undefined,
    server: String(server),
    headed: flag('headed', 'FLASHFX_HEADED'),
    chrome: (typeof arg('chrome') === 'string' ? arg('chrome') : undefined) ?? env.CHROME_PATH,
    attachPort: attach ? parseInt(String(attach), 10) : undefined,
    profile: typeof (arg('profile') ?? env.FLASHFX_PROFILE) === 'string' ? (arg('profile') ?? env.FLASHFX_PROFILE) : undefined,
    width: Number.isFinite(w) && w > 0 ? w : 1920,
    height: Number.isFinite(h) && h > 0 ? h : 1080,
    bootTimeoutMs: parseInt(env.FLASHFX_BOOT_TIMEOUT_MS ?? '180000', 10),
  };
}

function freePort() {
  return new Promise((res, rej) => {
    const s = createNetServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
}

async function waitForHttp(url, timeoutMs, isAlive = () => true) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (!isAlive()) throw new Error(`server for ${url} exited before it came up`);
    try { const r = await fetch(url); if (r.ok) return; } catch { /* not up yet */ }
    await sleep(300);
  }
  throw new Error(`timed out waiting for ${url}`);
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4', '.txt': 'text/plain', '.onnx': 'application/octet-stream',
};

/** Static server for the built app (dist/) with the SPA fallback Netlify applies. */
async function serveDist(dir) {
  if (!existsSync(join(dir, 'index.html'))) throw new Error(`${dir}/index.html not found: run \`npm run build\` first or use --server dev`);
  const server = createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
    let p = normalize(join(dir, url));
    if (!p.startsWith(normalize(dir))) { res.writeHead(403); res.end(); return; }
    if (!existsSync(p) || statSync(p).isDirectory()) p = join(dir, 'index.html');
    const headers = { 'content-type': MIME[extname(p).toLowerCase()] ?? 'application/octet-stream' };
    if (url.startsWith('/agent/')) headers['access-control-allow-origin'] = '*';
    res.writeHead(200, headers);
    res.end(readFileSync(p));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, stop: () => new Promise((r) => server.close(() => r())) };
}

/** Vite dev server from the repo (regenerates /agent/features.json first, like `npm run dev`). */
async function serveDev(timeoutMs) {
  const node = process.execPath;
  await new Promise((res, rej) => {
    const g = spawn(node, [join(ROOT, 'scripts/gen-agent-manifest.mjs')], { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    g.stderr.on('data', (d) => { err += d; });
    g.on('exit', (code) => (code === 0 ? res() : rej(new Error(`gen-agent-manifest failed: ${err}`))));
  });
  const port = await freePort();
  const vite = join(ROOT, 'node_modules/vite/bin/vite.js');
  const proc = spawn(node, [vite, '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'] });
  let alive = true;
  proc.on('exit', () => { alive = false; });
  proc.stderr.on('data', (d) => log('vite:', String(d).trim()));
  const url = `http://127.0.0.1:${port}`;
  await waitForHttp(url, timeoutMs, () => alive);
  return { url, stop: async () => { if (alive) proc.kill(); } };
}

/** Minimal CDP client over one page target's WebSocket. */
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.logs = [];
    this.closed = false;
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) {
        this.pushLog(`${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`);
      }
      if (m.method === 'Runtime.exceptionThrown') {
        this.pushLog(`exception: ${m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text}`);
      }
      if (m.id && this.pending.has(m.id)) { this.pending.get(m.id)(m); this.pending.delete(m.id); }
    });
    ws.addEventListener('close', () => {
      this.closed = true;
      for (const r of this.pending.values()) r({ error: { message: 'CDP connection closed' } });
      this.pending.clear();
    });
  }

  static async connect(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', () => j(new Error(`cannot connect to ${wsUrl}`))); });
    return new Cdp(ws);
  }

  pushLog(line) {
    this.logs.push(line);
    if (this.logs.length > 200) this.logs.shift();
  }

  async send(method, params = {}, timeoutMs = 60000) {
    if (this.closed) throw new Error('CDP connection closed');
    const res = await Promise.race([
      new Promise((r) => { const i = ++this.id; this.pending.set(i, r); this.ws.send(JSON.stringify({ id: i, method, params })); }),
      sleep(timeoutMs).then(() => null),
    ]);
    if (!res) throw new Error(`${method} timed out after ${timeoutMs}ms`);
    if (res.error) throw new Error(`${method}: ${res.error.message}`);
    return res.result;
  }

  async evaluate(expression, timeoutMs = 60000) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, timeoutMs);
    if (r.exceptionDetails) throw new Error(`page exception: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result?.value;
  }

  close() { try { this.ws.close(); } catch { /* closed */ } }
}

// Runs before the app on every load of a profile WE launched: a fresh automation profile would
// otherwise boot into the first-run onboarding wizard and the analytics consent banner. Analytics
// stay off for automated sessions ('denied'), and an existing choice is never overwritten.
const INIT_SCRIPT = `try {
  if (!localStorage.getItem('flashfx_onboarding_seen')) localStorage.setItem('flashfx_onboarding_seen', 'true');
  if (!localStorage.getItem('ffx-analytics-consent')) localStorage.setItem('ffx-analytics-consent', 'denied');
  if (!localStorage.getItem('ffx-tutorial-seen')) localStorage.setItem('ffx-tutorial-seen', '1');
} catch (e) { /* storage unavailable */ }`;

// Two frames, or 250 ms when rAF is paused (hidden / occluded window).
const raf2 = 'new Promise((r) => { requestAnimationFrame(() => requestAnimationFrame(() => r(true))); setTimeout(() => r(true), 250); })';

export class FlashFxSession {
  constructor(config) {
    this.config = config;
    this.server = null; // { url, stop }
    this.chrome = null; // ChildProcess when we launched it
    this.profileDir = null;
    this.tempProfile = false;
    this.cdp = null;
    this.devPort = null;
    this.starting = null;
  }

  /** The FlashFX base URL (starts the local server if needed, but not Chrome). */
  async baseUrl() {
    if (this.config.url) return this.config.url;
    if (!this.server) {
      const mode = this.config.server;
      log(`starting the ${mode} app server...`);
      if (mode === 'dist') this.server = await serveDist(join(ROOT, 'dist'));
      else if (mode === 'dev') this.server = await serveDev(this.config.bootTimeoutMs);
      else throw new Error(`--server must be dev or dist (or pass --url), got "${mode}"`);
      log(`app server at ${this.server.url}`);
    }
    return this.server.url;
  }

  /** Fetch the static manifest; fall back to the in-page runtime when the URL does not serve it. */
  async manifest() {
    const base = await this.baseUrl();
    try {
      const r = await fetch(`${base}/agent/features.json`);
      if (r.ok && (r.headers.get('content-type') ?? '').includes('json')) return await r.json();
    } catch { /* fall through */ }
    await this.ensure();
    return this.cdp.evaluate('window.__ffxAgent.listFeatures()');
  }

  /** Lazily bring up server + Chrome + the FlashFX tab with the agent runtime installed. */
  async ensure() {
    if (this.cdp && !this.cdp.closed) return;
    if (!this.starting) this.starting = this.start().finally(() => { this.starting = null; });
    await this.starting;
  }

  async start() {
    await this.closeBrowser();
    const base = await this.baseUrl();
    const { headed, width, height } = this.config;
    let pageWs;
    if (this.config.attachPort) {
      this.devPort = this.config.attachPort;
      const targets = await (await fetch(`http://127.0.0.1:${this.devPort}/json`)).json();
      let t = targets.find((x) => x.type === 'page' && x.url.startsWith(base));
      if (!t) t = await (await fetch(`http://127.0.0.1:${this.devPort}/json/new?${encodeURIComponent(base)}`, { method: 'PUT' })).json();
      pageWs = t.webSocketDebuggerUrl;
      log(`attached to Chrome on port ${this.devPort}`);
    } else {
      const chrome = this.config.chrome ?? findChrome();
      if (!chrome) throw new Error('no Chrome/Chromium/Edge found (set CHROME_PATH or --chrome)');
      this.devPort = await freePort();
      if (this.config.profile) {
        this.profileDir = resolve(this.config.profile);
        mkdirSync(this.profileDir, { recursive: true });
      } else {
        this.profileDir = mkdtempSync(join(tmpdir(), 'flashfx-mcp-chrome-'));
        this.tempProfile = true;
      }
      const args = [
        '--enable-unsafe-webgpu', '--no-first-run', '--no-default-browser-check', '--disable-features=Translate',
        '--autoplay-policy=no-user-gesture-required',
        // Keep rendering + timers at full speed when the window is in the background or covered.
        '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
        `--remote-debugging-port=${this.devPort}`,
        `--user-data-dir=${this.profileDir}`, `--window-size=${width},${height}`,
      ];
      // Headed: a chromeless app window (no tabs / URL bar) so a screen recording shows only FlashFX.
      if (headed) args.push('--app=about:blank');
      else args.push('--headless=new', 'about:blank');
      this.chrome = spawn(chrome, args, { stdio: 'ignore' });
      this.chrome.on('exit', () => { this.chrome = null; });
      let t = null;
      for (let i = 0; i < 150 && !t; i++) {
        try {
          const targets = await (await fetch(`http://127.0.0.1:${this.devPort}/json`)).json();
          t = targets.find((x) => x.type === 'page') ?? null;
        } catch { /* not up yet */ }
        if (!t) await sleep(150);
      }
      if (!t) throw new Error('Chrome did not open a page target');
      pageWs = t.webSocketDebuggerUrl;
      log(`launched Chrome (${headed ? 'headed' : 'headless'}, ${width}x${height})`);
    }

    this.cdp = await Cdp.connect(pageWs);
    await this.cdp.send('Runtime.enable');
    await this.cdp.send('Page.enable');
    if (!this.config.attachPort) {
      await this.cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: INIT_SCRIPT });
      if (!headed) await this.cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    }
    const current = await this.cdp.evaluate('location.href');
    if (!String(current).startsWith(base)) await this.cdp.send('Page.navigate', { url: `${base}/` });
    await this.waitForAgent();
  }

  async waitForAgent() {
    const t0 = Date.now();
    while (Date.now() - t0 < this.config.bootTimeoutMs) {
      try {
        const ok = await this.cdp.evaluate("document.readyState === 'complete' && typeof window.__ffxAgent === 'object'", 5000);
        if (ok) return;
        const unsupported = await this.cdp.evaluate("!('gpu' in navigator)", 5000);
        if (unsupported) throw new Error('this Chrome has no navigator.gpu (WebGPU is required)');
      } catch (e) {
        if (String(e.message).includes('WebGPU')) throw e;
      }
      await sleep(300);
    }
    throw new Error(`FlashFX did not install window.__ffxAgent within ${this.config.bootTimeoutMs}ms. Recent page errors:\n${this.cdp.logs.slice(-10).join('\n')}`);
  }

  /** Dispatch one whitelisted action through window.__ffxAgent.run. */
  async run(actionId, args, timeoutMs = 120000, { retryOnReload = false } = {}) {
    await this.ensure();
    const expr = `window.__ffxAgent.run(${JSON.stringify(String(actionId))}, ${args === undefined ? 'undefined' : JSON.stringify(args)})`;
    try {
      return await this.cdp.evaluate(expr, timeoutMs);
    } catch (e) {
      // The tab reloaded mid-action (e.g. the Vite dev server re-optimizing deps or an HMR full
      // reload). Wait for the runtime to come back so the next call works, then retry only actions
      // that are safe to repeat; otherwise say so (the project state is whatever was autosaved).
      if (!/navigated or closed|context was destroyed|Cannot find context/i.test(e.message)) throw e;
      log(`page reloaded during ${actionId}; waiting for FlashFX again`);
      await this.waitForAgent();
      if (retryOnReload) return this.cdp.evaluate(expr, timeoutMs);
      throw new Error(`the FlashFX tab reloaded during ${actionId} (dev server reload?). Re-check get_state before continuing; use --server dist for a stable session.`);
    }
  }

  async state() {
    await this.ensure();
    return this.cdp.evaluate('window.__ffxAgent.getState()');
  }

  /** PNG of the window (or just the preview canvas). Returns { path, width, height, canvasRect, inlineJpeg }. */
  async screenshot({ path, region = 'window', inline = true } = {}) {
    await this.ensure();
    await this.cdp.evaluate(raf2);
    // The preview canvas is tagged data-ffx-canvas in Viewport.tsx; clamp it to the visible window.
    const canvasRect = await this.cdp.evaluate(`(() => {
      const c = document.querySelector('canvas[data-ffx-canvas]');
      if (!c) return null;
      const r = c.getBoundingClientRect();
      const x = Math.max(0, r.left), y = Math.max(0, r.top);
      const w = Math.min(window.innerWidth, r.right) - x, h = Math.min(window.innerHeight, r.bottom) - y;
      return w > 0 && h > 0 ? { x, y, width: w, height: h } : null;
    })()`);
    const metrics = await this.cdp.send('Page.getLayoutMetrics');
    const vw = metrics.cssVisualViewport?.clientWidth ?? this.config.width;
    const vh = metrics.cssVisualViewport?.clientHeight ?? this.config.height;
    let clip;
    if (region === 'canvas') {
      if (!canvasRect) throw new Error('no canvas on the page (is a project open? call create_project)');
      clip = { ...canvasRect, scale: 1 };
    }
    const shot = await this.cdp.send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip } : {}) });
    const outPath = resolve(path ?? join(tmpdir(), 'flashfx-mcp', `screenshot-${Date.now()}.png`));
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, Buffer.from(shot.data, 'base64'));
    let inlineJpeg = null;
    if (inline) {
      const c = clip ?? { x: 0, y: 0, width: vw, height: vh };
      const scale = Math.min(1, 1280 / c.width);
      const small = await this.cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 70, clip: { ...c, scale } });
      inlineJpeg = small.data;
    }
    return { path: outPath, width: Math.round(clip ? clip.width : vw), height: Math.round(clip ? clip.height : vh), canvasRect, inlineJpeg };
  }

  /** Export through the real exporter (agent.exportMp4) and stream the bytes to `path`. */
  async exportMp4(path, opts = {}, timeoutMs = 3600000) {
    const r = await this.run('agent.exportMp4', opts, timeoutMs);
    if (!r?.ok) return r;
    const { exportId, bytes, audioDropped } = r.result;
    const outPath = resolve(path);
    mkdirSync(dirname(outPath), { recursive: true });
    const out = createWriteStream(outPath);
    const CHUNK = 4 * 1024 * 1024;
    try {
      for (let off = 0; off < bytes; off += CHUNK) {
        const c = await this.cdp.evaluate(`window.__ffxAgent.readExport(${JSON.stringify(exportId)}, ${off}, ${CHUNK})`, 120000);
        if (!out.write(Buffer.from(c.base64, 'base64'))) await new Promise((res) => out.once('drain', res));
      }
    } finally {
      await new Promise((res) => out.end(res));
      await this.cdp.evaluate(`window.__ffxAgent.releaseExport(${JSON.stringify(exportId)})`).catch(() => {});
    }
    return { ok: true, actionId: 'agent.exportMp4', result: { path: outPath, bytes, audioDropped } };
  }

  recentLogs(n = 20) { return this.cdp ? this.cdp.logs.slice(-n) : []; }

  /** Close the browser (or detach when attached) but keep the app server for a quick relaunch. */
  async closeBrowser() {
    if (this.cdp) {
      if (!this.config.attachPort && this.chrome) { try { await this.cdp.send('Browser.close', {}, 3000); } catch { /* already gone */ } }
      this.cdp.close();
      this.cdp = null;
    }
    if (this.chrome) { this.chrome.kill(); this.chrome = null; await sleep(300); }
    if (this.tempProfile && this.profileDir) {
      try { rmSync(this.profileDir, { recursive: true, force: true }); } catch { /* Chrome may still hold a lock */ }
      this.profileDir = null;
      this.tempProfile = false;
    }
  }

  async shutdown() {
    await this.closeBrowser();
    if (this.server) { await this.server.stop(); this.server = null; }
  }
}
