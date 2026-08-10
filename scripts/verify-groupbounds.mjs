// Acceptance harness for computeGroupBounds' leaf-size handling (core/sceneGraph.ts).
//
// Regression guard for the "cannot read property 'spans'" canvas crash: templates like Blackjack
// parent a CAMERA layer into the scene group. computeGroupBounds walks every non-group descendant
// through getLeafWorldSize, whose old catch-all `else` cast ANY unknown layer type to TextLayer and
// read `.content.spans` — so a camera (no `content`) crashed the whole overlay/bounds pass the moment
// the group was selected or hovered. getLeafWorldSize must now return null for camera/audio/etc.
//
// The camera path returns before touching measureText, so this harness needs no DOM. We stub
// OffscreenCanvas defensively anyway in case a future module-load path needs it. Run:
//   node scripts/verify-groupbounds.mjs

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// core/factory transitively loads the expression engine, which spawns a Worker at construction, and
// the text path lazily uses OffscreenCanvas. Neither is reached by this harness — stub both so the
// module graph loads under node.
if (!globalThis.Worker) {
  globalThis.Worker = class { postMessage() {} addEventListener() {} removeEventListener() {} terminate() {} };
}
if (!globalThis.OffscreenCanvas) {
  globalThis.OffscreenCanvas = class { getContext() { return { measureText: () => ({ width: 0 }), font: '' }; } };
}

const tmp = mkdtempSync(join(tmpdir(), 'groupbounds-verify-'));
const outfile = join(tmp, 'gb.mjs');
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

try {
  await build({
    stdin: {
      contents: `
        export { computeGroupBounds } from './src/core/sceneGraph';
        export { createGroupLayer, createRectangleLayer, createCameraLayer } from './src/core/factory';
      `,
      resolveDir: process.cwd(),
      loader: 'ts',
      sourcefile: 'entry.ts',
    },
    bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
  });
  const { computeGroupBounds, createGroupLayer, createRectangleLayer, createCameraLayer } =
    await import(pathToFileURL(outfile).href);

  const DUR = 390;

  // A Blackjack-shaped group: a shape child AND a camera child parented to one group.
  const g = createGroupLayer('Blackjack', 960, 540, DUR);
  const rect = createRectangleLayer('Card', 0, 0, 150, 210, [1, 1, 1, 1], DUR);
  rect.parentId = g.id;
  const cam = createCameraLayer('Camera', 1920, 1080, DUR);
  cam.parentId = g.id; // <-- exactly what `assemble` does in the template
  const layers = [g, rect, cam];

  check('computeGroupBounds does not throw with a camera descendant (the crash repro)', () => {
    assert.doesNotThrow(() => computeGroupBounds(g.id, layers, 0));
  });

  check('bounds come from the shape; the camera is skipped, not cast to text', () => {
    const b = computeGroupBounds(g.id, layers, 0);
    assert.ok(Number.isFinite(b.minX) && Number.isFinite(b.maxX), 'bounds are finite');
    // The rect is 150×210 centred on the group origin (960,540) → a real, non-degenerate box.
    assert.ok(Math.abs((b.maxX - b.minX) - 150) < 1e-6, `width ${b.maxX - b.minX} should be ~150`);
    assert.ok(Math.abs((b.maxY - b.minY) - 210) < 1e-6, `height ${b.maxY - b.minY} should be ~210`);
  });

  check('a group whose ONLY child is a camera degrades gracefully (no throw, group-pos fallback)', () => {
    const g2 = createGroupLayer('CamOnly', 100, 200, DUR);
    const cam2 = createCameraLayer('Camera', 1920, 1080, DUR);
    cam2.parentId = g2.id;
    let b;
    assert.doesNotThrow(() => { b = computeGroupBounds(g2.id, [g2, cam2], 0); });
    assert.ok(Number.isFinite(b.centerX) && Number.isFinite(b.centerY), 'finite center');
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error(`\n✗ FAILED after ${passed} checks:\n`, err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
