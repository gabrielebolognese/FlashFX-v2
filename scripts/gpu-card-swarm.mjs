// gpu:card-swarm (B81): the 3D card swarm renders where it claims, through the real MCP path (agent.addCardSwarm ->
// render_frame on the WebGPU renderer, headless Chrome):
//   A. an r10 S10 swarm (1920 x 1080, 16 placeholder UI cards + 12 labelled prompt pills, cluster yaw -20 -> 15 deg
//      f0-31 easeInOut, camera dolly f26-53 with the measured r10 ease then a tilt down): light / dark cards and violet
//      pills on screen, the yaw and the dolly move them, export_project + import_project renders byte-identically,
//      a labelled contact sheet;
//   B. a controlled 3-card swarm (two shape sources + one imported image asset) with known local positions: every card
//      lands on its TRUE 3D projection while the cluster yaws (near and far cards slide in opposite directions, the
//      measured box within 1.5 px of the pinhole projection), depth shows as size, the near card occludes the far one
//      even though the far one is higher in the layer stack, and when the orbit swings the far card to the front the
//      overlap flips to it (painter order follows the orbit);
//   C. a placeholder card + pill under a static 35 deg yaw: the printed decals (accent chip, content block) stay on top
//      of their card (sortWithParent) and the pill label sits centred inside its pill.
// Local only (Chrome + a GPU), like every gpu:* script:  npm run gpu:card-swarm
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startMcp, makeRenderer, diff } from './lib/mcp-pixels.mjs';

const OUT = process.env.FLASHFX_GPU_OUT ?? 'C:/Users/there/AppData/Local/Foreman/tasks/t_124df7beea/artifacts/engine/wave2/swarm';
mkdirSync(OUT, { recursive: true });
const work = mkdtempSync(join(tmpdir(), 'gpu-card-swarm-'));
const ffx = join(work, 'card-swarm.ffx');
const W = 1920, H = 1080;
// SWARM_PHASES=C runs one phase while iterating; the full proof (default) is ABC.
const PHASES = process.env.SWARM_PHASES ?? 'ABC';
let passed = 0;
const results = { harness: 'gpu:card-swarm', checks: [], numbers: {} };
const check = (name, fn) => { fn(); passed++; results.checks.push(name); console.log(`  ✓ ${name}`); };

const px = (img, x, y) => { const o = (Math.round(y) * img.width + Math.round(x)) * 4; return [img.px[o], img.px[o + 1], img.px[o + 2]]; };
const near = (a, b, tol) => Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol && Math.abs(a[2] - b[2]) <= tol;
const to255 = (c) => [Math.round(c[0] * 255), Math.round(c[1] * 255), Math.round(c[2] * 255)];
function bbox(img, pred, rect = { x: 0, y: 0, width: img.width, height: img.height }) {
  let n = 0, left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (let y = rect.y; y < rect.y + rect.height; y++) for (let x = rect.x; x < rect.x + rect.width; x++) {
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
    if (pred(px(img, x, y))) { n++; left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); }
  }
  // Pixel-index box -> continuous edges (a pixel x covers [x, x + 1]).
  return { n, left, right: right + 1, top, bottom: bottom + 1, cx: (left + right + 1) / 2, cy: (top + bottom + 1) / 2, w: right + 1 - left, h: bottom + 1 - top };
}
const count = (img, pred) => bbox(img, pred).n;

// ---- true 3D projection (default camera when the comp has no camera layer: eye (W/2, H/2, -H), zoom H) ----
const rad = (d) => (d * Math.PI) / 180;
function orbit(center, local, yawDeg) {
  const c = Math.cos(rad(yawDeg)), s = Math.sin(rad(yawDeg));
  return [center[0] + c * local[0] + s * local[2], center[1] + local[1], center[2] - s * local[0] + c * local[2]];
}
const project = (P) => { const d = P[2] + H; return [W / 2 + (H * (P[0] - W / 2)) / d, H / 2 + (H * (P[1] - H / 2)) / d]; };
/** Projected corners [TL, TR, BR, BL] of a camera-facing card (no own tilt) of size w x h at a cluster-local point. */
function quad(center, local, w, h, yaw, off = [0, 0]) {
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => project(orbit(center, [local[0] + off[0] + x, local[1] + off[1] + y, local[2]], yaw)));
}
const qbox = (q) => { const xs = q.map((p) => p[0]), ys = q.map((p) => p[1]); return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys), cx: (Math.min(...xs) + Math.max(...xs)) / 2, cy: (Math.min(...ys) + Math.max(...ys)) / 2, w: Math.max(...xs) - Math.min(...xs) }; };
/** Signed distance (px, + inside) of a point to a convex quad. */
function insideDist(q, x, y) {
  let area = 0;
  for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4]; area += a[0] * b[1] - b[0] * a[1]; }
  const sgn = Math.sign(area);
  let d = Infinity;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], ex = b[0] - a[0], ey = b[1] - a[1], len = Math.hypot(ex, ey);
    d = Math.min(d, (sgn * (ex * (y - a[1]) - ey * (x - a[0]))) / len);
  }
  return d;
}
const boxErr = (m, e) => Math.max(Math.abs(m.left - e.left), Math.abs(m.right - e.right), Math.abs(m.top - e.top), Math.abs(m.bottom - e.bottom));

const isRed = ([r, g, b]) => r > 200 && g < 60 && b < 60;
const isBlue = ([r, g, b]) => b > 200 && r < 60 && g < 60;
const isLime = ([r, g, b]) => r > 170 && g > 210 && b < 110;
const isLightCard = ([r, g, b]) => r >= 236 && g >= 234 && b >= 234 && Math.max(r, g, b) - Math.min(r, g, b) < 10;
const isDarkCard = ([r, g, b]) => Math.abs(r - 28) <= 5 && Math.abs(g - 28) <= 5 && Math.abs(b - 30) <= 5;
const isPillStroke = ([r, g, b]) => b > 150 && b - g > 35 && r > 100 && r < 170;
const isLabel = ([r, g, b]) => r > 185 && g > 180 && b - g >= 6; // label #f0edfa (bluish white), not the neutral light cards

console.log('gpu:card-swarm');
const mcp = await startMcp('gpu-card-swarm');
const render = makeRenderer(mcp, OUT);
try {
  // ======================================================================================== A. r10 S10 swarm
  if (PHASES.includes('A')) {
  await mcp.call('create_project', { name: 'B81 card swarm (r10 S10)', format: 'long', durationFrames: 87, clipLength: 'comp', uiMode: 'pro' }, 400000);
  const bgA = await mcp.action('editor.addShapeLayer', { opts: { type: 'rectangle', x: W / 2, y: H / 2, width: W, height: H, fill: [0.039, 0.039, 0.047, 1], name: 'S10 background #0a0a0c' } });
  assert.equal(bgA.ok, true, JSON.stringify(bgA).slice(0, 300));
  const sw = await mcp.action('agent.addCardSwarm', {
    count: 16, seed: 10, cluster: { yawFrom: -20, yawTo: 15, startFrame: 0, endFrame: 31, ease: [0.42, 0, 0.58, 1] }, options: { pills: 12 }, name: 'S10 swarm',
  });
  assert.equal(sw.ok, true, JSON.stringify(sw).slice(0, 800));
  const cam = await mcp.action('editor.addCameraLayer', {});
  assert.equal(cam.ok, true);
  const camId = cam.activeLayerId;
  // Dolly in f26-53 (r10 f365-392, measured easeOut [0.61, 0.076, 0, 0.809]), then tilt down + push f53-86 (easeInCubic).
  const m1 = await mcp.action('editor.cameraMove', { cameraLayerId: camId, frame: 26, to: { position: [960, 540, -1750] }, durationFrames: 27, ease: [0.61, 0.076, 0, 0.809] });
  const m2 = await mcp.action('editor.cameraMove', { cameraLayerId: camId, frame: 53, to: { position: [960, 360, -1250], pointOfInterest: [960, 780, 600] }, durationFrames: 33, ease: [0.32, 0, 0.67, 0] });
  assert.equal(m1.ok && m2.ok, true, JSON.stringify([m1, m2]).slice(0, 400));
  results.numbers.r10 = { layerCount: sw.result.layerCount, layout: sw.result.layout, cluster: sw.result.cluster };
  check(`agent.addCardSwarm (r10 S10): ${sw.result.cardIds.length} items (16 cards + 12 pills, ${sw.result.layerCount} layers with decals) under cluster ${sw.result.clusterId}, min spacing ${sw.result.layout.minSpacing} px (closest ${sw.result.layout.minDistance}, relaxed ${sw.result.layout.relaxed}), yaw ${sw.result.cluster.yawAtStart} -> ${sw.result.cluster.yawAtEnd} deg`, () => {
    assert.equal(sw.result.cardIds.length, 28);
    assert.equal(sw.result.layerCount, 89);
    assert.equal(sw.result.layout.relaxed, 0);
    assert.deepEqual([sw.result.cluster.yawAtStart, sw.result.cluster.yawAtEnd], [-20, 15]);
  });
  const framesA = [0, 15, 31, 45, 60, 86];
  const A = {};
  for (const f of framesA) A[f] = await render(`swarm-A-f${String(f).padStart(2, '0')}`, f);
  const stats = framesA.map((f) => ({ f, light: count(A[f], isLightCard), dark: count(A[f], isDarkCard), pill: count(A[f], isPillStroke), label: count(A[f], isLabel) }));
  results.numbers.r10Pixels = stats;
  check(`r10 swarm on screen in every frame: light cards / dark cards / violet pill rims / pill labels px = ${stats.map((s) => `f${s.f} ${s.light}/${s.dark}/${s.pill}/${s.label}`).join(', ')}`, () => {
    for (const s of stats) { assert.ok(s.light > 15000, `light ${s.light}`); assert.ok(s.dark > 8000, `dark ${s.dark}`); assert.ok(s.pill > 600, `pill ${s.pill}`); assert.ok(s.label > 400, `label ${s.label}`); }
  });
  const dYaw = diff(A[0], A[31], undefined, 24), dDolly = diff(A[31], A[45], undefined, 24), dTilt = diff(A[60], A[86], undefined, 24);
  check(`the cluster yaw (f0 -> f31), the dolly (f31 -> f45) and the tilt (f60 -> f86) all move the swarm (${dYaw.n} / ${dDolly.n} / ${dTilt.n} px change)`, () => {
    assert.ok(dYaw.n > 150000 && dDolly.n > 150000 && dTilt.n > 150000);
  });
  await mcp.call('render_strip', { frames: framesA, path: join(OUT, 'swarm-A-contact-sheet.png'), columns: 3, tileWidth: 640, inline: false });
  await mcp.call('render_strip', { frames: [0, 31, 86], path: join(OUT, 'swarm-A-f0-mid-end.png'), columns: 3, tileWidth: 640, inline: false });
  // Save / load.
  await mcp.call('export_project', { path: ffx });
  await mcp.call('import_project', { path: ffx }, 300000);
  const reloaded45 = await render('swarm-A-f45-reloaded', 45), reloaded0 = await render('swarm-A-f00-reloaded', 0);
  check(`export_project + import_project: the swarm (cluster flags, 3D cards, decals, camera) reloads and renders byte-identically (f0 max delta ${diff(reloaded0, A[0]).max}, f45 ${diff(reloaded45, A[45]).max})`, () => {
    assert.equal(diff(reloaded0, A[0]).max, 0);
    assert.equal(diff(reloaded45, A[45]).max, 0);
  });

  }
  // ======================================================================================== B. controlled orbit proof
  if (PHASES.includes('B')) {
  await mcp.call('create_project', { name: 'B81 orbit proof', format: 'long', durationFrames: 40, clipLength: 'comp', uiMode: 'pro' }, 400000);
  const svg = join(work, 'dashboard-standin.svg');
  writeFileSync(svg, '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="260" viewBox="0 0 400 260"><rect width="400" height="260" fill="#c6ed45"/></svg>');
  const img = await mcp.call('import_image', { path: svg, place: false, rasterSize: 400 });
  const assetId = img.result?.assetId ?? img.assetId;
  assert.ok(assetId, JSON.stringify(img).slice(0, 300));
  const B0 = await mcp.actions([
    { actionId: 'editor.addShapeLayer', args: { opts: { type: 'rectangle', x: W / 2, y: H / 2, width: W, height: H, fill: [0, 0, 0, 1], name: 'black' } } },
    { actionId: 'editor.addShapeLayer', args: { opts: { type: 'rectangle', x: 200, y: 200, width: 300, height: 200, fill: [1, 0, 0, 1], name: 'red source' } } },
    { actionId: 'editor.addShapeLayer', args: { opts: { type: 'rectangle', x: 600, y: 200, width: 300, height: 200, fill: [0, 0, 1, 1], name: 'blue source' } } },
  ]);
  assert.equal(B0.ok, true, JSON.stringify(B0).slice(0, 400));
  const redSrc = B0.results[1].activeLayerId, blueSrc = B0.results[2].activeLayerId;
  const center = [960, 540, 400];
  const yawKeys = [{ frame: 0, value: -20, ease: [0.42, 0, 0.58, 1] }, { frame: 30, value: 15, ease: 'linear' }, { frame: 39, value: 165 }];
  const sb = await mcp.action('agent.addCardSwarm', { count: 3, seed: 5, sources: [redSrc, blueSrc, assetId], volume: { center, size: [1400, 800, 800] }, cluster: { yawKeys }, options: { cardWidth: [300, 300], tilt: 0, detail: 'plain' }, name: 'proof' });
  assert.equal(sb.ok, true, JSON.stringify(sb).slice(0, 600));
  const [R, Bl, G] = sb.result.items;
  check(`sources cycle: card 1 = the red shape, card 2 = the blue shape, card 3 = the imported image asset (${G.source}), sources hidden (${sb.result.hiddenSourceIds.length}); image card sized 300 x ${G.height}`, () => {
    assert.deepEqual([R.source, Bl.source, G.source], [redSrc, blueSrc, assetId]);
    assert.equal(sb.result.hiddenSourceIds.length, 2);
    assert.equal(G.height, 195);
  });
  // Known local positions: R near, B far and overlapping R on screen (B is ABOVE R in the layer stack), G far and alone.
  const place = { [R.id]: [-150, 0, -300], [Bl.id]: [0, 60, 300], [G.id]: [480, -230, 330] };
  const edits = [];
  for (const [id, p] of Object.entries(place)) {
    edits.push({ actionId: 'editor.updateLayerProperty', args: { layerId: id, path: 'transform.position.defaultValue', value: [p[0], p[1]] } });
    edits.push({ actionId: 'editor.updateLayerProperty', args: { layerId: id, path: 'transform.positionZ.defaultValue', value: p[2] } });
  }
  const pe = await mcp.actions(edits);
  assert.equal(pe.ok, true, JSON.stringify(pe).slice(0, 400));
  const yawAt = { 0: -20, 15: -2.5, 30: 15, 39: 165 }; // f15 = the symmetric easeInOut midpoint
  const Bimg = {};
  for (const f of [0, 15, 30, 39]) Bimg[f] = await render(`swarm-B-orbit-f${String(f).padStart(2, '0')}`, f);
  const mR = {}, mG = {}, eR = {}, eG = {};
  for (const f of [0, 30]) {
    eR[f] = qbox(quad(center, place[R.id], 300, 200, yawAt[f]));
    eG[f] = qbox(quad(center, place[G.id], 300, 195, yawAt[f]));
    mR[f] = bbox(Bimg[f], isRed);
    mG[f] = bbox(Bimg[f], isLime);
    check(`f${f} (yaw ${yawAt[f]} deg): the near red card and the far image card land on their true 3D projection (box error ${boxErr(mR[f], eR[f]).toFixed(2)} / ${boxErr(mG[f], eG[f]).toFixed(2)} px; red ${mR[f].w} px wide at x ${mR[f].cx.toFixed(1)}, image ${mG[f].w} px at x ${mG[f].cx.toFixed(1)})`, () => {
      assert.ok(boxErr(mR[f], eR[f]) <= 1.5, JSON.stringify({ m: mR[f], e: eR[f] }));
      assert.ok(boxErr(mG[f], eG[f]) <= 1.5, JSON.stringify({ m: mG[f], e: eG[f] }));
    });
  }
  const dR = mR[30].cx - mR[0].cx, dG = mG[30].cx - mG[0].cx;
  results.numbers.parallax = { nearDx: dR, farDx: dG, expectedNearDx: eR[30].cx - eR[0].cx, expectedFarDx: eG[30].cx - eG[0].cx };
  check(`parallax = a rotation: over the yaw -20 -> 15 the near card slides ${dR.toFixed(1)} px and the far card ${dG.toFixed(1)} px (opposite directions; expected ${(eR[30].cx - eR[0].cx).toFixed(1)} / ${(eG[30].cx - eG[0].cx).toFixed(1)})`, () => {
    assert.ok(dR < -60 && dG > 60, `${dR} ${dG}`);
    assert.ok(Math.abs(dR - (eR[30].cx - eR[0].cx)) <= 1.5 && Math.abs(dG - (eG[30].cx - eG[0].cx)) <= 1.5);
  });
  check(`depth shows as size: the same 300 px card is ${mR[0].w} px wide near and ${mG[0].w} px far (ratio ${(mR[0].w / mG[0].w).toFixed(3)}, expected ${(eR[0].w / eG[0].w).toFixed(3)})`, () => {
    assert.ok(mR[0].w / mG[0].w > 1.3);
    assert.ok(Math.abs(mR[0].w / mG[0].w - eR[0].w / eG[0].w) < 0.02);
  });
  // Occlusion: every pixel inside both the red and the blue quad (2 px margin) shows the NEAR card's colour.
  const overlap = (f) => {
    const qr = quad(center, place[R.id], 300, 200, yawAt[f]), qb = quad(center, place[Bl.id], 300, 200, yawAt[f]);
    const bb = qbox(qb);
    let n = 0, red = 0, blue = 0;
    for (let y = Math.floor(bb.top); y <= Math.ceil(bb.bottom); y++) for (let x = Math.floor(bb.left); x <= Math.ceil(bb.right); x++) {
      if (insideDist(qr, x + 0.5, y + 0.5) < 2 || insideDist(qb, x + 0.5, y + 0.5) < 2) continue;
      n++;
      const c = px(Bimg[f], x, y);
      if (isRed(c)) red++; else if (isBlue(c)) blue++;
    }
    return { n, red, blue };
  };
  const o0 = overlap(0), o15 = overlap(15), o39 = overlap(39);
  results.numbers.occlusion = { f0: o0, f15: o15, f39: o39 };
  check(`depth sort: where the near red card overlaps the far blue card (blue is higher in the layer stack) every pixel is red (f0 ${o0.red}/${o0.n}, f15 ${o15.red}/${o15.n}, blue ${o0.blue}/${o15.blue})`, () => {
    assert.ok(o0.n > 2000 && o15.n > 2000);
    assert.equal(o0.red, o0.n); assert.equal(o15.red, o15.n);
  });
  check(`the painter order follows the orbit: at yaw 165 deg (f39) the blue card has swung to the front and the overlap is blue (${o39.blue}/${o39.n} px, red ${o39.red})`, () => {
    assert.ok(o39.n > 2000);
    assert.equal(o39.blue, o39.n);
  });
  await mcp.call('render_strip', { frames: [0, 15, 30, 39], path: join(OUT, 'swarm-B-orbit-contact-sheet.png'), columns: 4, tileWidth: 480, inline: false });

  }
  // ======================================================================================== C. decals + labels
  if (PHASES.includes('C')) {
  await mcp.call('create_project', { name: 'B81 decals', format: 'long', durationFrames: 20, clipLength: 'comp', uiMode: 'pro' }, 400000);
  const bgC = await mcp.action('editor.addShapeLayer', { opts: { type: 'rectangle', x: W / 2, y: H / 2, width: W, height: H, fill: [0, 0, 0, 1], name: 'black' } });
  assert.equal(bgC.ok, true);
  const cC = [960, 540, 300];
  const sc = await mcp.action('agent.addCardSwarm', { count: 1, seed: 2, volume: { center: cC, size: [10, 10, 10] }, cluster: { yaw: 35 }, options: { pills: 1, tilt: 0, labels: ['Build a finance dashboard'], lightShare: 1, cardWidth: [420, 420], cardAspect: [0.7, 0.7] }, name: 'decals' });
  assert.equal(sc.ok, true, JSON.stringify(sc).slice(0, 600));
  const [card, pill] = sc.result.items;
  const placeC = { [card.id]: [-330, -80, 0], [pill.id]: [300, 160, -100] };
  const ec = [];
  for (const [id, p] of Object.entries(placeC)) {
    ec.push({ actionId: 'editor.updateLayerProperty', args: { layerId: id, path: 'transform.position.defaultValue', value: [p[0], p[1]] } });
    ec.push({ actionId: 'editor.updateLayerProperty', args: { layerId: id, path: 'transform.positionZ.defaultValue', value: p[2] } });
  }
  assert.equal((await mcp.actions(ec)).ok, true);
  const C0 = await render('swarm-C-decals-yaw35', 0);
  const part = async (id) => { const r = await mcp.action('agent.getLayer', { layerId: id }); return r.result?.layer ?? r.result; };
  const [chip, , block] = await Promise.all(card.partIds.map(part));
  const decalCheck = (l) => {
    const off = l.transform.position.defaultValue;
    const q = quad(cC, placeC[card.id], l.shape.width.defaultValue, l.shape.height.defaultValue, 35, off);
    const b = qbox(q);
    // Sample the decal's inner area (3 px margin): it must show the decal colour, not the card body under it.
    let n = 0, hit = 0;
    for (let y = Math.floor(b.top); y <= Math.ceil(b.bottom); y++) for (let x = Math.floor(b.left); x <= Math.ceil(b.right); x++) {
      if (insideDist(q, x + 0.5, y + 0.5) < 3) continue;
      n++;
      if (near(px(C0, x, y), to255(l.shape.fillColor), 6)) hit++;
    }
    return { n, hit };
  };
  const dChip = decalCheck(chip), dBlock = decalCheck(block);
  results.numbers.decals = { chip: dChip, block: dBlock };
  check(`card decals stay printed on their card under a 35 deg yaw (the chip lies ~60 px BEHIND the card centre in depth): accent chip ${dChip.hit}/${dChip.n} px, content block ${dBlock.hit}/${dBlock.n} px show their own colour`, () => {
    assert.ok(dChip.n > 300 && dBlock.n > 5000);
    assert.ok(dChip.hit / dChip.n > 0.98 && dBlock.hit / dBlock.n > 0.98, JSON.stringify({ dChip, dBlock }));
  });
  // Control: the same chip without sortWithParent sorts by its own (farther) depth and disappears behind its card,
  // so the check above is sensitive to the flag. Then undo the edit.
  const ctl = await mcp.action('editor.updateLayerProperty', { layerId: chip.id, path: 'sortWithParent', value: false });
  assert.equal(ctl.ok, true, JSON.stringify(ctl).slice(0, 300));
  const C1 = await render('swarm-C-control-no-sortWithParent', 0);
  const dCtl = (() => {
    const q = quad(cC, placeC[card.id], chip.shape.width.defaultValue, chip.shape.height.defaultValue, 35, chip.transform.position.defaultValue);
    const b = qbox(q);
    let n = 0, hit = 0;
    for (let y = Math.floor(b.top); y <= Math.ceil(b.bottom); y++) for (let x = Math.floor(b.left); x <= Math.ceil(b.right); x++) {
      if (insideDist(q, x + 0.5, y + 0.5) < 3) continue;
      n++;
      if (near(px(C1, x, y), to255(chip.shape.fillColor), 6)) hit++;
    }
    return { n, hit };
  })();
  await mcp.call('undo');
  results.numbers.decalControl = dCtl;
  check(`control: with sortWithParent turned off the same chip sorts by its own depth and vanishes behind its card (${dCtl.hit}/${dCtl.n} px), so the flag is what keeps decals printed`, () => {
    assert.ok(dCtl.n > 300 && dCtl.hit / dCtl.n < 0.05, JSON.stringify(dCtl));
  });
  const pq = quad(cC, placeC[pill.id], pill.width, pill.height, 35);
  const pb = qbox(pq);
  const pc = project(orbit(cC, placeC[pill.id], 35)); // the pill centre point, projected
  const lab = bbox(C0, isLabel, { x: Math.floor(pb.left) - 20, y: Math.floor(pb.top) - 20, width: Math.ceil(pb.w) + 40, height: Math.ceil(pb.bottom - pb.top) + 40 });
  // Where the label ink must land: the glyph ink box the renderer's own layout measures (agent.measureText, relative to
  // the text origin) printed on the pill plane at the label's local offset, then orbited + projected.
  const labelLayer = await part(pill.partIds[0]);
  const mt = (await mcp.action('agent.measureText', { layerId: labelLayer.id, frame: 0 })).result;
  const inkOff = [labelLayer.transform.position.defaultValue[0] + mt.glyphInk.centerX - mt.center[0], labelLayer.transform.position.defaultValue[1] + mt.glyphInk.centerY - mt.center[1]];
  const eLab = qbox(quad(cC, placeC[pill.id], mt.glyphInk.width, mt.glyphInk.height, 35, inkOff));
  results.numbers.label = { label: lab, expected: eLab, pill: pb, pillCentre: pc, inkOffset: inkOff };
  check(`the pill label renders on its pill plane: label ink box within ${boxErr(lab, eLab).toFixed(2)} px of the measured glyph ink orbited + projected (ink ${lab.n} px, centre (${lab.cx.toFixed(1)}, ${lab.cy.toFixed(1)}), pill centre (${pc[0].toFixed(1)}, ${pc[1].toFixed(1)})), inside the pill box`, () => {
    assert.ok(lab.n > 300, `${lab.n}`);
    assert.ok(boxErr(lab, eLab) <= 2, JSON.stringify(eLab));
    assert.ok(Math.abs(lab.cy - pc[1]) <= 2.5, 'optically centred in the pill height');
    assert.ok(lab.left >= pb.left && lab.right <= pb.right && lab.top >= pb.top && lab.bottom <= pb.bottom);
  });

  }
  results.passed = passed;
  results.ok = true;
  console.log(`\n${passed} checks passed. Frames: ${OUT}`);
} catch (e) {
  results.ok = false;
  results.error = String(e.stack ?? e.message);
  console.error(`\nFAILED after ${passed} checks: ${e.stack ?? e.message}\n--- server stderr ---\n${mcp.stderr().slice(-3000)}`);
  process.exitCode = 1;
} finally {
  writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  await mcp.close();
}
