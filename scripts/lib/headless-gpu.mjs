// Headless-Chrome WebGPU runner for GPU harnesses (`gpu:*` scripts). Bundles a browser entry with the
// installed esbuild (the `@/` alias and Vite's import.meta.env stubbed), serves it from localhost (a
// secure context, which navigator.gpu requires), launches headless Chrome with WebGPU enabled, and
// evaluates an async expression over the Chrome DevTools Protocol (Node's built-in WebSocket + fetch -
// no new dependency). Used to compile and pixel-test real WGSL / the real WebGPURenderer on a machine
// with a GPU. Deliberately NOT part of `npm test` (CI runners have no GPU): run it locally.

import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** A Chrome/Chromium/Edge binary, or null. `CHROME_PATH` wins. */
export function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p)) ?? null;
}

/** Bundle `entryCode` (JS source; may import repo files by absolute path) to `<dir>/bundle.js`. */
export async function bundleEntry(entryCode, dir) {
  await build({
    stdin: { contents: entryCode, resolveDir: ROOT, loader: 'js' },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    outfile: join(dir, 'bundle.js'),
    alias: { '@': join(ROOT, 'src') },
    jsx: 'automatic', // the app's React components use the automatic runtime (Vite plugin-react)
    define: { 'import.meta.env': '{"DEV":false,"PROD":true,"MODE":"production"}' },
    logLevel: 'error',
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Serve `dir`, open it in headless Chrome, and run `fn(page)` where `page` is
 * `{ evaluate(expression), send(method, params), logs }` - `evaluate` awaits the expression and returns
 * its value (throwing on a page exception), `send` is a raw CDP command (e.g. Input.dispatchMouseEvent
 * for real pointer events). Resolves to fn's result; always tears Chrome + the server down.
 */
export async function withHeadlessPage({ dir, chrome = findChrome(), timeoutMs = 120000 }, fn) {
  if (!chrome) throw new Error('no Chrome/Chromium/Edge found (set CHROME_PATH)');
  const server = createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
    if (url === '/') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<!doctype html><title>gpu harness</title>');
      return;
    }
    const p = join(dir, url);
    if (!p.startsWith(dir) || !existsSync(p)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': extname(p) === '.js' ? 'text/javascript' : 'application/octet-stream' });
    res.end(readFileSync(p));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const httpPort = server.address().port;
  const devPort = 9300 + Math.floor(Math.random() * 600);
  const userDir = mkdtempSync(join(tmpdir(), 'gpu-chrome-'));
  const proc = spawn(chrome, [
    '--headless=new', '--enable-unsafe-webgpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${devPort}`, `--user-data-dir=${userDir}`, `http://127.0.0.1:${httpPort}/`,
  ], { stdio: 'ignore' });
  let ws = null;
  const logs = [];
  try {
    let target = null;
    for (let i = 0; i < 100 && !target; i++) {
      try {
        const targets = await (await fetch(`http://127.0.0.1:${devPort}/json`)).json();
        target = targets.find((t) => t.type === 'page' && t.url.startsWith('http')) ?? null;
      } catch { /* not up yet */ }
      if (!target) await sleep(150);
    }
    if (!target) throw new Error('headless Chrome did not open the harness page');
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
    let id = 0;
    const pending = new Map();
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.method === 'Runtime.consoleAPICalled') logs.push(`${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`);
      if (m.method === 'Runtime.exceptionThrown') logs.push(`exception: ${m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text}`);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    });
    const send = async (method, params) => {
      const res = await Promise.race([
        new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); }),
        sleep(timeoutMs).then(() => null),
      ]);
      if (!res) throw new Error(`${method} timed out after ${timeoutMs}ms`);
      if (res.error) throw new Error(`${method}: ${res.error.message}`);
      return res.result;
    };
    const evaluate = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(`page exception: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
      return r.result?.value;
    };
    await send('Runtime.enable', {});
    // The target can be listed before its document has committed: wait for the served page.
    for (let i = 0; i < 100; i++) {
      if ((await evaluate('location.protocol + document.readyState')) === 'http:complete') break;
      await sleep(100);
    }
    return await fn({ evaluate, send, logs });
  } finally {
    try { ws?.close(); } catch { /* closed */ }
    proc.kill();
    server.close();
    await sleep(200);
    try { rmSync(userDir, { recursive: true, force: true }); } catch { /* Chrome may still hold a lock */ }
  }
}

/** Serve `dir`, evaluate one async `expression` in headless Chrome. Resolves { value, logs }. */
export async function runInHeadlessChrome({ dir, expression, chrome, timeoutMs }) {
  return withHeadlessPage({ dir, chrome, timeoutMs }, async (page) => ({ value: await page.evaluate(expression), logs: page.logs }));
}

/** A temp dir for a bundle; caller removes it. */
export function makeTempDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

export { ROOT };
