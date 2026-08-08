// Acceptance harness for the animation-templates engine (Phase 1).
//
// No test runner in this repo (see CLAUDE.md), so this mirrors the scripts/*.mjs convention: bundle
// the REAL TypeScript with the installed esbuild and assert with node:assert. It proves each template
// builds a valid parent-linked group, that instantiation rebases keyframes to the playhead (and
// rescales fps), and that every built layer survives the validation whitelist round-trip unchanged
// (the exact failure class that silently stripped cloner/precomp data).
//   node scripts/verify-anim-templates.mjs   (or: npm run verify:anim-templates)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'anim-tpl-verify-'));
const outfile = join(tmp, 'bundle.mjs');

let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

// Walk every AnimatableProperty in a layer (mirror of instantiate.ts's walker).
function walkProps(node, fn) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const x of node) walkProps(x, fn); return; }
  if (Array.isArray(node.keyframes) && typeof node.valueType === 'string') { fn(node); return; }
  for (const k of Object.keys(node)) walkProps(node[k], fn);
}
function allKeyframes(layers) { const out = []; for (const l of layers) walkProps(l, (p) => out.push(...p.keyframes)); return out; }
function countKeyframes(layers) { return allKeyframes(layers).length; }

try {
  await build({
    stdin: {
      contents: `
        export { ANIMATION_TEMPLATES, getTemplate } from './src/animation-templates/catalog';
        export { instantiateTemplate } from './src/animation-templates/instantiate';
        export { validateComposition } from './src/project-system/services/validation';
      `,
      resolveDir: process.cwd(),
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile,
    logLevel: 'silent',
  });
  if (typeof globalThis.Worker === 'undefined') {
    globalThis.Worker = class { postMessage() {} terminate() {} addEventListener() {} removeEventListener() {} };
  }
  const { ANIMATION_TEMPLATES, getTemplate, instantiateTemplate, validateComposition } = await import(pathToFileURL(outfile).href);
  const CENTER = [960, 540];

  console.log('Animation templates — acceptance\n');

  check('catalog is non-empty and every entry is well-formed', () => {
    assert.ok(ANIMATION_TEMPLATES.length >= 5, 'expected several templates');
    for (const t of ANIMATION_TEMPLATES) {
      assert.equal(typeof t.id, 'string');
      assert.equal(typeof t.build, 'function');
      assert.ok(t.durationFrames > 0 && t.authorFps > 0);
      assert.equal(getTemplate(t.id), t, `getTemplate('${t.id}') round-trips`);
    }
    const ids = ANIMATION_TEMPLATES.map((t) => t.id);
    assert.equal(new Set(ids).size, ids.length, 'template ids are unique');
  });

  for (const t of ANIMATION_TEMPLATES) {
    const layers = t.build({ center: CENTER, frameRate: 30 });

    check(`${t.id}: builds a parent-linked group with unique ids`, () => {
      assert.ok(layers.length >= 2, 'group + at least one child');
      const group = layers[0];
      assert.equal(group.type, 'group', 'first layer is the root group');
      const ids = layers.map((l) => l.id);
      assert.equal(new Set(ids).size, ids.length, 'all layer ids unique');
      for (const l of layers.slice(1)) {
        assert.equal(l.parentId, group.id, `${l.name} is parented to the group`);
      }
      assert.deepEqual(group.transform.position.defaultValue, CENTER, 'group sits at ctx.center');
    });

    check(`${t.id}: has real keyframes with valid frames/values`, () => {
      const kfs = allKeyframes(layers);
      assert.ok(kfs.length > 0, 'template is animated');
      for (const k of kfs) {
        assert.ok(Number.isFinite(k.frame), 'keyframe frame is finite');
        assert.notEqual(k.value, null, 'keyframe value is non-null');
        assert.notEqual(k.value, undefined);
      }
    });

    check(`${t.id}: instantiate rebases the earliest keyframe onto the playhead`, () => {
      const inst = instantiateTemplate(t, { playhead: 100, frameRate: 30, center: CENTER });
      const frames = allKeyframes(inst).map((k) => k.frame);
      assert.equal(Math.min(...frames), 100, 'earliest keyframe lands on the playhead');
      for (const l of inst) assert.equal(l.inPoint, 100, 'clip starts at the playhead');
    });

    check(`${t.id}: instantiate rescales keyframes to comp fps`, () => {
      const baseMax = Math.max(...allKeyframes(layers).map((k) => k.frame));
      const inst = instantiateTemplate(t, { playhead: 0, frameRate: 60, center: CENTER });
      const instMax = Math.max(...allKeyframes(inst).map((k) => k.frame));
      assert.equal(instMax, Math.round(baseMax * 2), '30fps→60fps doubles the timing');
    });

    check(`${t.id}: survives the validation whitelist round-trip (no stripped data)`, () => {
      const before = countKeyframes(layers);
      const validated = validateComposition({ layers });
      assert.equal(validated.layers.length, layers.length, 'no layer dropped by validation');
      assert.equal(countKeyframes(validated.layers), before, 'no keyframe stripped by validation');
    });
  }

  check('calendar-month builds the full grid + a highlighted day', () => {
    const cal = getTemplate('calendar-month');
    const layers = cal.build({ center: CENTER, frameRate: 30 });
    const circles = layers.filter((l) => l.type === 'shape' && l.shape.type === 'circle');
    assert.equal(circles.length, 31, 'one circle per day of the month');
    const AMBER = [0.969, 0.71, 0.0, 1];
    const highlighted = circles.filter((c) => JSON.stringify(c.shape.fillColor) === JSON.stringify(AMBER));
    assert.equal(highlighted.length, 1, 'exactly one highlighted day');
  });

  console.log(`\n✅ ${passed} checks passed`);
} catch (err) {
  console.error('\n❌ verification failed:\n', err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
