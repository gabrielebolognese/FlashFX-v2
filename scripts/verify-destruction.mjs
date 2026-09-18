// Acceptance harness for the B23 destruction engines (pure). Bundles core/destruction/{fracture,
// cardDance}.ts and asserts with node:assert: Voronoi shards partition the rect (sites in their own
// cells, areas sum to the rect), a frame-pure explosion trajectory, and the card-dance tile grid +
// map-driven stagger (settled 'in' = identity, so the layer reassembles exactly). The rendered pieces
// are B23-render.
//   node scripts/verify-destruction.mjs   (or: npm run verify:destruction)

import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'destruction-verify-'));
let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const near = (a, b, tol) => Math.abs(a - b) <= tol;

async function bundle(entry, name) {
  const outfile = join(tmp, name);
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  return import(pathToFileURL(outfile).href);
}

// point-in-polygon (ray cast) for the harness
function inPoly(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

try {
  const F = await bundle('src/core/destruction/fracture.ts', 'fracture.mjs');
  const C = await bundle('src/core/destruction/cardDance.ts', 'cardDance.mjs');
  const { fractureVoronoi, polygonArea, shardExplode } = F;
  const { tileGrid, tileMapValue, cardDanceTransform } = C;

  const W = 400, H = 300;

  check('Voronoi shards: each site lies inside its own cell; areas sum to the rect', () => {
    const shards = fractureVoronoi(W, H, 24, 123);
    assert.ok(shards.length >= 20 && shards.length <= 24, `shard count ${shards.length}`);
    for (const s of shards) {
      assert.ok(s.polygon.length >= 3);
      assert.ok(inPoly(s.site, s.polygon), 'site inside its cell');
    }
    const total = shards.reduce((sum, s) => sum + polygonArea(s.polygon), 0);
    assert.ok(near(total, W * H, W * H * 0.02), `cells tile the rect (sum ${total} ~ ${W * H})`);
  });

  check('fracture is deterministic per seed; different seed differs', () => {
    const a = fractureVoronoi(W, H, 16, 7);
    const b = fractureVoronoi(W, H, 16, 7);
    assert.deepEqual(a.map((s) => s.site), b.map((s) => s.site));
    const c = fractureVoronoi(W, H, 16, 8);
    assert.notDeepEqual(a.map((s) => s.site), c.map((s) => s.site));
  });

  check('shardExplode: rest before startFrame; flies outward; frame-pure; fades out', () => {
    const shards = fractureVoronoi(W, H, 12, 3);
    const origin = [0, 0];
    const p = { startFrame: 10, duration: 60, strength: 400, gravity: 500, spin: 180, fps: 30 };
    // a shard whose centroid is to the right of origin flies +x
    const rightShard = shards.reduce((best, s) => (s.centroid[0] > best.centroid[0] ? s : best), shards[0]);
    const idx = shards.indexOf(rightShard);
    assert.deepEqual(shardExplode(rightShard, idx, origin, 5, p), { dx: 0, dy: 0, rotation: 0, opacity: 1 });
    const t = shardExplode(rightShard, idx, origin, 40, p);
    assert.ok(t.dx > 0, `flies +x (dx=${t.dx})`);
    assert.ok(t.opacity < 1 && t.opacity >= 0, 'fading');
    assert.deepEqual(shardExplode(rightShard, idx, origin, 40, p), t, 'frame-pure');
  });

  check('tileGrid covers the layer with cols*rows tiles + full UV coverage', () => {
    const tiles = tileGrid(W, H, 4, 3);
    assert.equal(tiles.length, 12);
    const area = tiles.reduce((s, t) => s + t.width * t.height, 0);
    assert.ok(near(area, W * H, 1e-6), 'tiles cover the layer');
    // UV spans 0..1
    assert.ok(Math.min(...tiles.map((t) => t.u0)) === 0 && Math.max(...tiles.map((t) => t.u1)) === 1);
  });

  check('card map orders tiles (leftToRight increases with column)', () => {
    const tiles = tileGrid(W, H, 4, 1);
    const vals = tiles.map((t) => tileMapValue(t, 4, 1, 'leftToRight'));
    for (let i = 1; i < vals.length; i++) assert.ok(vals[i] > vals[i - 1], 'monotonic L->R');
    assert.ok(tileMapValue(tiles[0], 4, 1, 'random') >= 0 && tileMapValue(tiles[0], 4, 1, 'random') <= 1);
  });

  check("card-dance 'in': settled frame = identity (layer reassembles); before start = displaced", () => {
    const tiles = tileGrid(W, H, 3, 3);
    const p = { cols: 3, rows: 3, map: 'leftToRight', startFrame: 0, tileDuration: 20, stagger: 30, direction: 'in', distance: 200, fps: 30 };
    // long after everything settles -> identity for every tile
    for (const t of tiles) {
      const tr = cardDanceTransform(t, 500, p);
      assert.ok(near(tr.dx, 0, 1e-6) && near(tr.dy, 0, 1e-6) && near(tr.rotation, 0, 1e-6), 'settled = no offset');
      assert.ok(near(tr.opacity, 1, 1e-6) && near(tr.scale, 1, 1e-6), 'settled = full opacity/scale');
    }
    // before its start a tile is displaced/faded
    const last = tiles[tiles.length - 1];
    const early = cardDanceTransform(last, -5, p);
    assert.ok(Math.hypot(early.dx, early.dy) > 1 && early.opacity < 0.5, 'not yet assembled');
    // frame-pure
    assert.deepEqual(cardDanceTransform(last, 12, p), cardDanceTransform(last, 12, p));
  });

  console.log(`\n✓ all ${passed} checks passed`);
} catch (err) {
  console.error('\n✖ destruction harness failed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
