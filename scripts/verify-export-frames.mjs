// B68 acceptance harness for the exporter's exclusive video-frame planning (src/engine/video/exportFrames.ts):
// which frames the export holds per composition frame, and how a forward decode cursor reaches each source
// frame (reuse / advance / reopen), plus a simulated linear export over several clips that checks every
// source frame is decoded once and the open-frame count stays at the per-frame need.
// GPU-free; bundles the real TS with esbuild. Run: npm run verify:export-frames

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'export-frames-verify-'));
const outfile = join(tmp, 'exportFrames.mjs');
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

try {
  await build({ entryPoints: ['src/engine/video/exportFrames.ts'], outfile, bundle: true, format: 'esm', platform: 'neutral', logLevel: 'silent' });
  const { planExportFrames, exportFrameKey, exportCursorStep, pickExportCursor, EXPORT_FORWARD_WINDOW, EXPORT_CURSORS_PER_ASSET } = await import(pathToFileURL(outfile).href);
  const K = exportFrameKey;

  check('planExportFrames: closes frames the next comp frame does not need, decodes only the missing ones', () => {
    const plan = planExportFrames([K('a', 4), K('b', 9)], [{ assetId: 'a', frame: 5 }, { assetId: 'b', frame: 9 }]);
    assert.deepEqual(plan.close, [K('a', 4)]);
    assert.deepEqual(plan.decode, [{ assetId: 'a', frame: 5 }]);
  });

  check('planExportFrames: dedupes the request, keeps a held frame needed again, empty need closes everything', () => {
    const plan = planExportFrames([K('a', 1)], [{ assetId: 'a', frame: 1 }, { assetId: 'a', frame: 1 }, { assetId: 'a', frame: 2 }, { assetId: 'a', frame: 2 }]);
    assert.deepEqual(plan.close, []);
    assert.deepEqual(plan.decode, [{ assetId: 'a', frame: 2 }]);
    assert.deepEqual(planExportFrames([K('a', 1), K('b', 2)], []).close.sort(), [K('a', 1), K('b', 2)].sort());
  });

  check('exportCursorStep: unopened / backwards / too far = reopen, same index = reuse, short forward = advance', () => {
    assert.equal(exportCursorStep({ index: -1, peekIndex: null }, 0), 'reopen');
    assert.equal(exportCursorStep({ index: 10, peekIndex: null }, 10), 'reuse');
    assert.equal(exportCursorStep({ index: 10, peekIndex: null }, 9), 'reopen');
    assert.equal(exportCursorStep({ index: 10, peekIndex: null }, 11), 'advance');
    assert.equal(exportCursorStep({ index: 10, peekIndex: null }, 10 + EXPORT_FORWARD_WINDOW), 'advance');
    assert.equal(exportCursorStep({ index: 10, peekIndex: null }, 11 + EXPORT_FORWARD_WINDOW), 'reopen');
  });

  check('exportCursorStep: a pulled-ahead sample past the target means the held sample covers it (reuse, like getSample)', () => {
    // 30 fps clip in a 60 fps comp: requests 0,0,1,1,... ; a variable-rate clip may skip an index.
    assert.equal(exportCursorStep({ index: 4, peekIndex: 6 }, 5), 'reuse');
    assert.equal(exportCursorStep({ index: 4, peekIndex: 6 }, 6), 'advance');
  });

  check('pickExportCursor: reuse first, else the nearest cursor behind the target, else -1', () => {
    const cs = [{ index: 100, peekIndex: null }, { index: 20, peekIndex: null }, { index: 30, peekIndex: null }];
    assert.equal(pickExportCursor(cs, 20), 1);
    assert.equal(pickExportCursor(cs, 35), 2);
    assert.equal(pickExportCursor(cs, 101), 0);
    assert.equal(pickExportCursor(cs, 5), -1);
    assert.ok(EXPORT_CURSORS_PER_ASSET >= 2);
  });

  // Simulated decode session (the mediabunny reader's control flow over the pure planner) and a linear
  // export of 3 clips: a 60 fps clip, a 30 fps clip in the 60 fps comp, and the same asset used twice
  // at different offsets. Counts decodes per source frame and the frames held per comp frame.
  check('simulated linear export: each clip frame decoded once, one open per cursor, held = need', () => {
    const cursors = new Map();
    const decodes = new Map();
    let reopens = 0;
    const decode = (asset, i) => {
      const list = cursors.get(asset) ?? [];
      cursors.set(asset, list);
      let k = pickExportCursor(list, i);
      if (k < 0) { list.push({ index: -1, peekIndex: null }); k = list.length - 1; }
      const c = list[k];
      const step = exportCursorStep(c, i);
      if (step === 'reopen') { reopens++; c.index = i - 1; c.peekIndex = null; }
      if (step !== 'reuse') while (c.index < i) { c.index++; const key = `${asset}#${c.index}`; decodes.set(key, (decodes.get(key) ?? 0) + 1); }
      return c.index;
    };
    let held = [];
    let maxHeld = 0;
    for (let f = 0; f < 600; f++) {
      const need = [
        { assetId: 'flowers', frame: f },
        { assetId: 'webcam30', frame: Math.floor(f / 2) },
        { assetId: 'shared', frame: f },
        { assetId: 'shared', frame: f + 300 },
      ];
      const plan = planExportFrames(held, need);
      held = held.filter((k) => !plan.close.includes(k));
      for (const r of plan.decode) { assert.equal(decode(r.assetId, r.frame), r.frame); held.push(K(r.assetId, r.frame)); }
      maxHeld = Math.max(maxHeld, held.length);
    }
    // One stream per clip decodes each frame once; the asset shown twice (offset 300) decodes its overlap
    // once per layer stream (frames are not kept 300 comp frames for the second layer: held = need).
    for (const [key, n] of decodes) assert.ok(key.startsWith('shared#') ? n <= 2 : n === 1, `${key} decoded ${n} times`);
    assert.equal(reopens, 4, `expected one open per cursor (flowers, webcam30, shared x2), got ${reopens}`);
    assert.equal(maxHeld, 4, `held frames must equal the per-frame need (4), got ${maxHeld}`);
  });

  console.log(`\nexport-frames: all ${passed} checks passed`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
