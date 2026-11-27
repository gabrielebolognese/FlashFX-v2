// Acceptance harness for B89 (second half): cloner copies get their OWN motion blur. Before, each stamp carried the
// source layer's resolved blur, measured at the source's own (usually static) spot, so a spinning photo ring or a
// moving cloner rendered every copy sharp. Now, when the cloner's (or its source's) motion-blur switch is on, each
// stamp's blur comes from that copy's world transform one frame earlier (cloner motion + instance motion).
// Pure node (esbuild bundle of the real TS). Old-behaviour check: the base commit's resolver (CLONER_BLUR_BASE,
// default the task worktree) is bundled too and must resolve blur-off projects byte-identically.
//   node scripts/verify-cloner-blur.mjs   (or: npm run verify:cloner-blur)
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

globalThis.Worker = class { postMessage() {} terminate() {} addEventListener() {} removeEventListener() {} set onmessage(_v) {} set onerror(_v) {} };
globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return { font: '', textBaseline: 'top', measureText: (s) => ({ width: s.length * 10, actualBoundingBoxLeft: 0, actualBoundingBoxRight: s.length * 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }), setTransform() {}, fillText() {}, strokeText() {}, fillRect() {} }; } };

const BASE_DIR = process.env.CLONER_BLUR_BASE ?? 'C:/Users/there/AppData/Local/Foreman/worktrees/project-t_124df7beea';
const tmp = mkdtempSync(join(tmpdir(), 'cloner-blur-verify-'));
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };
const SETTINGS = { width: 1920, height: 1080, frameRate: 30, durationFrames: 100, backgroundColor: [0, 0, 0, 1] };

async function bundle(dir, name) {
  const outfile = join(tmp, `${name}.mjs`);
  await build({
    stdin: {
      contents: `
        export { resolveFrame } from './src/core/interpolation';
        export { createComposition, createRectangleLayer, createTransform, createKeyframe } from './src/core/factory';
      `,
      resolveDir: dir, sourcefile: 'entry.ts', loader: 'ts',
    },
    bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
  });
  return import(pathToFileURL(outfile).href);
}

try {
  const cur = await bundle(process.cwd(), 'cur');
  const { resolveFrame, createComposition, createRectangleLayer, createTransform, createKeyframe } = cur;
  console.log('verify:cloner-blur');
  const R = 300, N = 8, PERIOD = 60;
  // A ring of N copies around (960, 540). spin: the cloner's rotation keyed 0 -> 360 over PERIOD frames (linear);
  // move: the cloner's position keyed +600 px in x over 30 frames; blur: which switch is on.
  const mk = ({ spin = false, move = false, blur = 'cloner', shutter, compShutter } = {}) => {
    const comp = createComposition('c', { ...SETTINGS, ...(compShutter !== undefined ? { shutterAngle: compShutter } : {}) });
    const src = createRectangleLayer('src', 0, 0, 80, 80, [1, 0, 0, 1], 100); src.id = 'src';
    if (blur === 'source') src.motionBlur = true;
    const transform = createTransform(960, 540);
    if (spin) transform.rotation.keyframes = [{ ...createKeyframe(0, 0), interpolation: 'linear' }, { ...createKeyframe(PERIOD, 360), interpolation: 'linear' }];
    if (move) transform.position.keyframes = [{ ...createKeyframe(0, [660, 540]), interpolation: 'linear' }, { ...createKeyframe(30, [1260, 540]), interpolation: 'linear' }];
    const cloner = {
      ...createRectangleLayer('cl', 0, 0, 1, 1, [1, 0, 0, 1], 100),
      id: 'cl', type: 'cloner', name: 'cl', transform,
      sourceRef: { type: 'layer', layerId: 'src' },
      distribution: { type: 'radial', count: N, radius: R, arcDegrees: 360, center: { x: 0, y: 0, z: 0 }, startAngleDegrees: 0, orientToCenter: true },
      effectors: [], stagger: { delaySeconds: 0 }, renderCount: 500,
      ...(blur === 'cloner' ? { motionBlur: true } : {}),
      ...(shutter !== undefined ? { motionBlurShutter: shutter } : {}),
    };
    delete cloner.shape;
    comp.layers = [src, cloner];
    return comp;
  };
  const stamps = (comp, f) => resolveFrame(comp, f).layers.filter((l) => l.id.startsWith('cl#'));
  const json = (x) => JSON.stringify(x);

  check('setup: the spinning ring moves its copies between frames', () => {
    const a = stamps(mk({ spin: true, blur: 'none' }), 10), b = stamps(mk({ spin: true, blur: 'none' }), 11);
    assert.equal(a.length, N);
    assert.ok(Math.hypot(a[0].transform.positionX - b[0].transform.positionX, a[0].transform.positionY - b[0].transform.positionY) > 10);
  });
  check('spinning ring, cloner motion blur on: every copy streaks tangentially at 2*pi*R/period px per frame', () => {
    const st = stamps(mk({ spin: true }), 10);
    const speed = 2 * Math.PI * R / PERIOD;
    for (const s of st) {
      const mb = s.motionBlur;
      assert.ok(mb, `${s.id} has no motion blur`);
      const v = Math.hypot(mb.vx, mb.vy);
      // chord vs arc over a 6 deg step: within 0.1 %
      assert.ok(Math.abs(v - speed) / speed < 0.02, `${s.id} |v| ${v} vs ${speed}`);
      const rx = s.transform.positionX - 960, ry = s.transform.positionY - 540;
      const cos = (rx * mb.vx + ry * mb.vy) / (Math.hypot(rx, ry) * v);
      assert.ok(Math.abs(cos) < 0.06, `${s.id} not tangential, cos ${cos}`);
      assert.ok(Math.abs(mb.omega - (6 * Math.PI / 180)) < 1e-6, `${s.id} omega ${mb.omega}`);
      assert.equal(mb.shutter, 180);
    }
  });
  check('moving cloner (no spin): every copy streaks with the cloner velocity (20 px / frame in x)', () => {
    for (const s of stamps(mk({ move: true }), 10)) {
      assert.ok(s.motionBlur, s.id);
      assert.ok(Math.abs(s.motionBlur.vx - 20) < 1e-6 && Math.abs(s.motionBlur.vy) < 1e-6, json(s.motionBlur));
    }
  });
  check('the source layer switch alone also blurs the copies along their own paths (the r04 photo-ring setup)', () => {
    const st = stamps(mk({ spin: true, blur: 'source' }), 10);
    assert.ok(st.every((s) => s.motionBlur && Math.hypot(s.motionBlur.vx, s.motionBlur.vy) > 25));
  });
  check('static ring with blur on: no copy has a blur descriptor (renderer keeps its fast path)', () => {
    assert.ok(stamps(mk({}), 10).every((s) => s.motionBlur === undefined));
  });
  check('comp frame 0 has no earlier sample: copies are sharp', () => {
    assert.ok(stamps(mk({ spin: true }), 0).every((s) => s.motionBlur === undefined));
  });
  check('closed shutter (layer shutter 0, or comp shutter 0): copies are sharp', () => {
    assert.ok(stamps(mk({ spin: true, shutter: 0 }), 10).every((s) => s.motionBlur === undefined));
    assert.ok(stamps(mk({ spin: true, compShutter: 0 }), 10).every((s) => s.motionBlur === undefined));
  });
  check('comp shutter 90: the copies carry the shorter shutter', () => {
    assert.ok(stamps(mk({ spin: true, compShutter: 90 }), 10).every((s) => s.motionBlur?.shutter === 90));
  });

  const sameDir = resolve(BASE_DIR).toLowerCase() === resolve(process.cwd()).toLowerCase();
  if (existsSync(join(BASE_DIR, 'src/core/interpolation.ts')) && !sameDir) {
    const base = await bundle(BASE_DIR, 'base');
    check(`blur off: frames resolve byte-identically to the base resolver (${BASE_DIR.split('/').pop()}), spin / move / both, 40 frames`, () => {
      for (const opts of [{ spin: true, blur: 'none' }, { move: true, blur: 'none' }, { spin: true, move: true, blur: 'none' }]) {
        const comp = mk(opts); // one comp for both resolvers (createComposition mints a random background id)
        for (let f = 0; f < 40; f++) assert.ok(json(resolveFrame(comp, f)) === json(base.resolveFrame(comp, f)), `${json(opts)} f${f} differs`);
      }
    });
  } else console.log(`  - base comparison skipped (no separate base checkout at ${BASE_DIR})`);

  console.log(`verify:cloner-blur: ${passed} checks passed`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
