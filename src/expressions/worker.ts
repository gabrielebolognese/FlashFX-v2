/// <reference lib="webworker" />

import type { WorkerInbound, WorkerOutbound, ExpressionContext } from './types';
import { interpolateKeyframesAt, loopOffset, inertialBounce, posterizeTimeSeconds } from './motion';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

// --- Security: Strip dangerous globals ---
const BLOCKED_GLOBALS = [
  'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource',
  'importScripts', 'navigator', 'location',
  'indexedDB', 'caches', 'CacheStorage',
  'BroadcastChannel', 'SharedWorker',
  'Worker',
] as const;

for (const name of BLOCKED_GLOBALS) {
  try {
    Object.defineProperty(ctx, name, { value: undefined, writable: false, configurable: false });
  } catch { /* some may already be non-configurable */ }
}

// ---------------------------------------------------------------------------
// Built-in functions for the expression language
// ---------------------------------------------------------------------------

function _clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function _lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// Deterministic hash for stable random per-property
function _hashSeed(index: number, path: string): number {
  let h = index * 2654435761;
  for (let i = 0; i < path.length; i++) {
    h = ((h << 5) - h + path.charCodeAt(i)) | 0;
  }
  return (h >>> 0) / 4294967295;
}

// Smooth hermite noise - interpolated gradient noise
function _noiseImpl(t: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const smooth = f * f * (3 - 2 * f);
  const a = Math.sin(i * 127.1) * 43758.5453;
  const b = Math.sin((i + 1) * 127.1) * 43758.5453;
  const ga = a - Math.floor(a);
  const gb = b - Math.floor(b);
  return (ga + (gb - ga) * smooth) * 2 - 1;
}

// Multi-octave wiggle implementation
function _wiggleImpl(time: number, frequency: number, amplitude: number, seed: number): number {
  let result = 0;
  let amp = amplitude;
  let freq = frequency;
  const t = time + seed * 1000;
  for (let octave = 0; octave < 3; octave++) {
    result += _noiseImpl(t * freq + octave * 17.31) * amp;
    amp *= 0.5;
    freq *= 2;
  }
  return result;
}

// Build the expression builtins for a specific evaluation context
function buildScope(context: ExpressionContext) {
  const { frame, fps, time, value, index, duration, width, height, keyframes, propertyPath } = context;

  const seed = _hashSeed(index, propertyPath);

  function wiggle(frequency: number, amplitude: number): number {
    return _wiggleImpl(time, frequency, amplitude, seed);
  }

  function loopOut(type: string = 'cycle'): number | number[] {
    if (keyframes.length < 2) return typeof value === 'number' ? value : [...value];
    const firstKf = keyframes[0];
    const lastKf = keyframes[keyframes.length - 1];
    const lastFrame = lastKf.frame;

    if (frame <= lastFrame) return typeof value === 'number' ? value : [...value];

    const rangeFrames = lastFrame - firstKf.frame;
    if (rangeFrames <= 0) {
      const v = lastKf.value;
      return typeof v === 'number' ? v : [...v];
    }

    const elapsed = frame - lastFrame;

    // offset: accumulate the segment's total delta each cycle (continuous, motion keeps advancing)
    if (type === 'offset') return loopOffset(keyframes, frame);

    if (type === 'pingpong') {
      const cycles = elapsed / rangeFrames;
      const isReverse = Math.floor(cycles) % 2 === 1;
      const frac = cycles - Math.floor(cycles);
      const mappedFrame = isReverse
        ? lastFrame - frac * rangeFrames
        : firstKf.frame + frac * rangeFrames;
      return interpolateKeyframesAt(keyframes, mappedFrame);
    }

    if (type === 'continue') {
      const kfPrev = keyframes[keyframes.length - 2];
      const velocity = typeof lastKf.value === 'number' && typeof kfPrev.value === 'number'
        ? (lastKf.value - kfPrev.value) / (lastKf.frame - kfPrev.frame)
        : 0;
      const baseVal = lastKf.value;
      if (typeof baseVal === 'number') {
        return baseVal + velocity * elapsed;
      }
      const v0 = baseVal as [number, number];
      const kp = kfPrev.value as [number, number];
      const vx = (v0[0] - kp[0]) / (lastKf.frame - kfPrev.frame);
      const vy = (v0[1] - kp[1]) / (lastKf.frame - kfPrev.frame);
      return [v0[0] + vx * elapsed, v0[1] + vy * elapsed];
    }

    // cycle (default)
    const frac = (elapsed % rangeFrames) / rangeFrames;
    const mappedFrame = firstKf.frame + frac * rangeFrames;
    return interpolateKeyframesAt(keyframes, mappedFrame);
  }

  function loopIn(type: string = 'cycle'): number | number[] {
    if (keyframes.length < 2) return typeof value === 'number' ? value : [...value];
    const firstKf = keyframes[0];
    const lastKf = keyframes[keyframes.length - 1];
    const firstFrame = firstKf.frame;

    if (frame >= firstFrame) return typeof value === 'number' ? value : [...value];

    const rangeFrames = lastKf.frame - firstFrame;
    if (rangeFrames <= 0) {
      const v = firstKf.value;
      return typeof v === 'number' ? v : [...v];
    }

    const elapsed = firstFrame - frame;

    // offset: continuous backward accumulation (mirror of loopOut offset — same periodic extension)
    if (type === 'offset') return loopOffset(keyframes, frame);

    if (type === 'pingpong') {
      const cycles = elapsed / rangeFrames;
      const isReverse = Math.floor(cycles) % 2 === 1;
      const frac = cycles - Math.floor(cycles);
      const mappedFrame = isReverse
        ? firstFrame + frac * rangeFrames
        : lastKf.frame - frac * rangeFrames;
      return interpolateKeyframesAt(keyframes, mappedFrame);
    }

    if (type === 'continue') {
      const kfNext = keyframes[1];
      const velocity = typeof firstKf.value === 'number' && typeof kfNext.value === 'number'
        ? (kfNext.value - firstKf.value) / (kfNext.frame - firstKf.frame)
        : 0;
      const baseVal = firstKf.value;
      if (typeof baseVal === 'number') {
        return baseVal - velocity * elapsed;
      }
      const v0 = baseVal as [number, number];
      const kn = kfNext.value as [number, number];
      const vx = (kn[0] - v0[0]) / (kfNext.frame - firstKf.frame);
      const vy = (kn[1] - v0[1]) / (kfNext.frame - firstKf.frame);
      return [v0[0] - vx * elapsed, v0[1] - vy * elapsed];
    }

    // cycle (default)
    const frac = (elapsed % rangeFrames) / rangeFrames;
    const mappedFrame = lastKf.frame - frac * rangeFrames;
    return interpolateKeyframesAt(keyframes, mappedFrame);
  }

  function linear(t: number, a: number, b: number, c?: number, d?: number): number {
    if (c !== undefined && d !== undefined) {
      const normalized = _clamp((t - a) / (b - a), 0, 1);
      return _lerp(c, d, normalized);
    }
    return _lerp(a, b, _clamp(t, 0, 1));
  }

  function ease(t: number, a: number, b: number, c?: number, d?: number): number {
    let norm: number;
    if (c !== undefined && d !== undefined) {
      norm = _clamp((t - a) / (b - a), 0, 1);
      const eased = norm * norm * (3 - 2 * norm);
      return _lerp(c, d, eased);
    }
    norm = _clamp(t, 0, 1);
    const eased = norm * norm * (3 - 2 * norm);
    return _lerp(a, b, eased);
  }

  function easeIn(t: number, a: number, b: number, c?: number, d?: number): number {
    let norm: number;
    if (c !== undefined && d !== undefined) {
      norm = _clamp((t - a) / (b - a), 0, 1);
      const eased = norm * norm;
      return _lerp(c, d, eased);
    }
    norm = _clamp(t, 0, 1);
    return _lerp(a, b, norm * norm);
  }

  function easeOut(t: number, a: number, b: number, c?: number, d?: number): number {
    let norm: number;
    if (c !== undefined && d !== undefined) {
      norm = _clamp((t - a) / (b - a), 0, 1);
      const eased = 1 - (1 - norm) * (1 - norm);
      return _lerp(c, d, eased);
    }
    norm = _clamp(t, 0, 1);
    return _lerp(a, b, 1 - (1 - norm) * (1 - norm));
  }

  function clamp(v: number, min: number, max: number): number {
    return _clamp(v, min, max);
  }

  function random(min?: number, max?: number): number {
    const base = Math.abs(Math.sin(seed * 9301 + 49297)) % 1;
    if (min === undefined) return base;
    if (max === undefined) return base * min;
    return min + base * (max - min);
  }

  function noise(t: number): number {
    return _noiseImpl(t + seed * 100);
  }

  function degToRad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  function radToDeg(rad: number): number {
    return rad * (180 / Math.PI);
  }

  function smoothstep(edge0: number, edge1: number, x: number): number {
    const t = _clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function remap(v: number, inLow: number, inHigh: number, outLow: number, outHigh: number): number {
    const t = (v - inLow) / (inHigh - inLow);
    return outLow + t * (outHigh - outLow);
  }

  // --- Time-sampling family (B7): read THIS property's own keyframes at any time. ---
  // Foundation for lag/delay/follow (secondary motion), stepped/posterized motion, and echoes.
  function valueAtFrame(f: number): number | number[] {
    if (keyframes.length === 0) return typeof value === 'number' ? value : [...value];
    return interpolateKeyframesAt(keyframes, f);
  }

  function valueAtTime(t: number): number | number[] {
    return valueAtFrame(t * fps);
  }

  // Lag/delay/follow: the property's own value `sec` seconds ago (drives secondary motion when this
  // expression is on a CHILD property/layer reading a parent's animation copied in as keyframes).
  function delay(sec: number): number | number[] {
    return valueAtTime(time - sec);
  }

  // Snap time to a coarser rate for stepped motion; feed to valueAtTime, e.g. valueAtTime(posterizeTime(12)).
  function posterizeTime(rate: number): number {
    return posterizeTimeSeconds(time, rate);
  }

  // Inertial bounce / spring overshoot after the last keyframe (auto follow-through on any keyframes).
  function bounce(freq: number = 2, decay: number = 4, amp: number = 0.1): number | number[] {
    return inertialBounce(keyframes, frame, value, fps, freq, decay, amp);
  }

  return {
    // Context variables (read-only from user perspective)
    time,
    value,
    frame,
    fps,
    index,
    duration,
    width,
    height,

    // AE-style functions
    wiggle,
    loopOut,
    loopIn,
    linear,
    ease,
    easeIn,
    easeOut,
    clamp,
    random,
    noise,

    // Procedural motion (B7): time-sampling + secondary motion + spring
    valueAtFrame,
    valueAtTime,
    delay,
    posterizeTime,
    bounce,

    // Utility functions
    degToRad,
    radToDeg,
    smoothstep,
    remap,
    lerp: _lerp,

    // Math object fully available
    Math,
  };
}

// ---------------------------------------------------------------------------
// Compilation and execution
// ---------------------------------------------------------------------------

const fnCache = new Map<string, { expr: Function | null; body: Function | null }>();

function compileExpression(code: string): Function {
  const cached = fnCache.get(code);
  if (cached) {
    if (cached.expr) return cached.expr;
    if (cached.body) return cached.body;
  }

  const paramNames = ['__scope__'];
  const scopeDestructure = `const {${Object.keys(buildScope({
    frame: 0, fps: 30, time: 0, value: 0, index: 0,
    duration: 0, width: 0, height: 0,
    layerInPoint: 0, layerOutPoint: 0,
    keyframes: [], propertyPath: '',
  })).join(',')}} = __scope__;`;

  // Try as expression first
  try {
    const fn = new Function(
      ...paramNames,
      `"use strict";\n${scopeDestructure}\nreturn (${code});`,
    );
    fnCache.set(code, { expr: fn, body: null });
    return fn;
  } catch {
    // Fall back to function body (multi-line with explicit return)
  }

  const fn = new Function(
    ...paramNames,
    `"use strict";\n${scopeDestructure}\n${code}`,
  );
  fnCache.set(code, { expr: null, body: fn });
  return fn;
}

function executeExpression(code: string, context: ExpressionContext): unknown {
  const scope = buildScope(context);
  const fn = compileExpression(code);
  return fn(Object.freeze(scope));
}

function isValidResult(v: unknown): boolean {
  if (typeof v === 'number') return isFinite(v);
  if (Array.isArray(v) && v.length === 2) {
    return typeof v[0] === 'number' && isFinite(v[0])
        && typeof v[1] === 'number' && isFinite(v[1]);
  }
  return false;
}

function post(msg: WorkerOutbound): void {
  ctx.postMessage(msg);
}

// --- Message handler ---
ctx.addEventListener('message', (event: MessageEvent<WorkerInbound>) => {
  const msg = event.data;

  if (msg.type === 'validate') {
    try {
      compileExpression(msg.code);
      post({ type: 'validate-result', id: msg.id, error: null });
    } catch (e) {
      post({ type: 'validate-result', id: msg.id, error: (e as Error).message });
    }
    return;
  }

  if (msg.type === 'eval') {
    try {
      const result = executeExpression(msg.code, msg.context);
      if (!isValidResult(result)) {
        const got = result === undefined ? 'undefined'
          : result === null ? 'null'
          : typeof result === 'number' ? (isNaN(result) ? 'NaN' : 'Infinity')
          : typeof result;
        post({ type: 'eval-error', id: msg.id, error: `Expression must return a finite number or [x, y]. Got: ${got}` });
        return;
      }
      post({ type: 'eval-result', id: msg.id, value: result as number | [number, number] });
    } catch (e) {
      const err = e as Error;
      let message = err.message || 'Unknown error';
      if (err.stack) {
        const match = err.stack.match(/<anonymous>:(\d+):(\d+)/);
        if (match) {
          const line = parseInt(match[1], 10) - 2;
          message = `Line ${line}: ${message}`;
        }
      }
      post({ type: 'eval-error', id: msg.id, error: message });
    }
    return;
  }
});
