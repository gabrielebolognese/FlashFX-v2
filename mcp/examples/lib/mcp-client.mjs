// Minimal MCP stdio client for the FlashFX MCP server (mcp/flashfx-mcp.mjs), used by the example
// builds in mcp/examples/. It speaks the real MCP protocol (JSON-RPC 2.0, one message per line), so
// everything a build does is exactly what Claude Code would do through the same server.
//
//   const mcp = await connectFlashFx({ server: 'dev' });
//   await mcp.call('create_project', { name: 'Demo', format: 'long' });
//   const r = await mcp.actions([{ actionId: 'editor.addText', args: { content: 'HI' } }]);
//   await mcp.close();
//
// Every call is timed and kept in mcp.calls (name, ms, ok, error) so a build can report its speed
// and any friction it hit.

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

export async function connectFlashFx({ server = process.env.FLASHFX_SERVER ?? 'dev', extraArgs = [], verbose = !!process.env.FLASHFX_VERBOSE } = {}) {
  const proc = spawn(process.execPath, [join(REPO_ROOT, 'mcp/flashfx-mcp.mjs'), '--server', server, ...extraArgs], {
    cwd: REPO_ROOT, stdio: ['pipe', 'pipe', 'pipe'],
  });
  const stderr = [];
  proc.stderr.on('data', (d) => { stderr.push(String(d)); if (verbose) process.stderr.write(d); });
  const pending = new Map();
  let nextId = 1;
  createInterface({ input: proc.stdout }).on('line', (line) => {
    const m = JSON.parse(line);
    if (m.id !== undefined && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  const request = (method, params, timeoutMs = 600000) => new Promise((res, rej) => {
    const id = nextId++;
    const timer = setTimeout(() => rej(new Error(`${method} timed out\n${stderr.slice(-20).join('')}`)), timeoutMs);
    pending.set(id, (m) => { clearTimeout(timer); m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result); });
    proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });

  const init = await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'flashfx-examples', version: '1' } });
  proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);

  const calls = [];
  const parse = (r) => { try { return JSON.parse(r.content[0].text); } catch { return r.content?.[0]?.text; } };

  /** Call a tool. Throws on isError unless { allowError: true } (then returns { error }). */
  async function call(name, args = {}, { allowError = false, timeoutMs } = {}) {
    const t0 = Date.now();
    let r;
    try { r = await request('tools/call', { name, arguments: args }, timeoutMs); }
    catch (e) { calls.push({ name, ms: Date.now() - t0, ok: false, error: e.message }); throw e; }
    const ms = Date.now() - t0;
    const body = parse(r);
    if (r.isError) {
      const error = typeof body === 'string' ? body : JSON.stringify(body).slice(0, 2000);
      calls.push({ name, ms, ok: false, error });
      if (allowError) return { error, body };
      throw new Error(`${name} -> ${error}`);
    }
    calls.push({ name, ms, ok: true });
    return body;
  }

  /** run_actions: returns the per-action results array (throws on the first failure). */
  async function actions(list, opts = {}) {
    const r = await call('run_actions', { actions: list }, opts);
    if (r?.error) return r;
    return r.results;
  }

  /** One action, returns its result object ({ ok, result, activeLayerId, ... }). */
  async function action(actionId, args, opts = {}) {
    return call('run_action', { actionId, args }, opts);
  }

  async function close() {
    proc.stdin.end();
    await new Promise((res) => { proc.once('exit', res); setTimeout(res, 15000); });
  }

  return { init, call, actions, action, close, calls, stderr };
}

// ----- small authoring helpers (pure data, no page access) -----

/** Hex "#rrggbb" -> RGBA 0..1. */
export const rgba = (hex, a = 1) => {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255, a];
};

/** Keyframe a property through [frame, value] pairs with ONE cubic-bezier for every segment.
 *  FlashFX bezier = CSS cubic-bezier(x1, y1, x2, y2): prev.handleOut = [x1, y1], next.handleIn = [x2, y2]. */
export function keyframes(layerId, propertyPath, pairs, bezier) {
  const out = pairs.map(([frame, value]) => ({ actionId: 'editor.addKeyframe', args: [layerId, propertyPath, frame, value] }));
  if (bezier) {
    out.push({
      actionId: 'editor.setKeyframeInterpolation',
      args: [layerId, pairs.map(([frame]) => ({ propertyPath, frame })), 'bezier', [bezier[2], bezier[3]], [bezier[0], bezier[1]]],
    });
  }
  return out;
}

/** Common eases as cubic-bezier control points. */
export const EASE = {
  expoOut: [0.16, 1, 0.3, 1],
  quintOut: [0.22, 1, 0.36, 1],
  cubicInOut: [0.65, 0, 0.35, 1],
  expoInOut: [0.87, 0, 0.13, 1],
  backOut: [0.34, 1.56, 0.64, 1],
  quartIn: [0.5, 0, 0.75, 0],
};
