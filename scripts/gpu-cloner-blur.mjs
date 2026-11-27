// gpu:cloner-blur (B89, second half): cloner copies streak along their own paths on real WebGPU pixels, through the MCP.
// Scene: a 1920x1080 @ 30 fps project; a 70 px white square is the source of a radial cloner (8 copies, radius 300)
// centred on the comp, the cloner's rotation keyed 0 -> 360 deg over f0-60 (static after f60).
//   1  blur off: the copies are sharp (only anti-aliased edges are partial pixels).
//   2  the cloner's motion-blur switch on: at f30 every copy smears (many partial pixels), the light is conserved
//      (total ink mass within 6 %) and the smear runs along the ring (the ink spreads tangentially, not radially).
//   3  the source's switch alone (the r04 photo-ring setup) renders the same smear.
//   4  f75 (ring at rest): blur on renders byte-identical to blur off.
//   5  export_mp4 (the real exporter, 960x540): the exported f30 carries the smear too.
// Local only (Chrome + a GPU + ffmpeg on PATH), like every gpu:* script:  npm run gpu:cloner-blur
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { diff, idOf, makeRenderer, startMcp } from './lib/mcp-pixels.mjs';

const OUT = process.env.FLASHFX_GPU_OUT ?? 'C:/Users/there/AppData/Local/Foreman/tasks/t_124df7beea/artifacts/engine/session-2026-11-27/cloner-blur';
mkdirSync(OUT, { recursive: true });
const results = [];
let passed = 0;
const check = (name, fn) => { const info = fn(); passed++; results.push({ name, ok: true, info }); console.log(`  ✓ ${name}${info ? `  ${JSON.stringify(info)}` : ''}`); };

// Ink statistics over a frame: luminance above the background. partial = pixels between 12 % and 88 % of white over
// the background; mass = summed (lum - bg); tangential / radial spread = second moments of each copy's ink around its
// own centroid, projected on the ring tangent and on the radius (copies found as 8 angular sectors around the centre).
function stats(img, cx, cy, scale = 1) {
  const bg = 0.299 * img.px[0] + 0.587 * img.px[1] + 0.114 * img.px[2];
  const span = 255 - bg;
  let partial = 0, mass = 0;
  const sec = Array.from({ length: 8 }, () => ({ m: 0, x: 0, y: 0, pts: [] }));
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    const o = (y * img.width + x) * 4;
    const v = (0.299 * img.px[o] + 0.587 * img.px[o + 1] + 0.114 * img.px[o + 2] - bg) / span;
    if (v <= 0.03) continue;
    if (v > 0.12 && v < 0.88) partial++;
    mass += v;
    // copies sit at 22.5 + 45 k deg at f30 and f75 (start angle 22.5, rotation 180 / 360): bins centred on them
    const a = Math.atan2(y - cy, x - cx) - Math.PI / 8;
    const k = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
    const s = sec[k]; s.m += v; s.x += v * x; s.y += v * y; s.pts.push([x, y, v]);
  }
  let tan = 0, rad = 0;
  for (const s of sec) {
    if (s.m < 50 * scale * scale) continue;
    const mx = s.x / s.m, my = s.y / s.m;
    const r = Math.hypot(mx - cx, my - cy); const ux = (mx - cx) / r, uy = (my - cy) / r;
    let t2 = 0, r2 = 0;
    for (const [x, y, v] of s.pts) { const dx = x - mx, dy = y - my; const pr = dx * ux + dy * uy; const pt = -dx * uy + dy * ux; r2 += v * pr * pr; t2 += v * pt * pt; }
    tan += Math.sqrt(t2 / s.m); rad += Math.sqrt(r2 / s.m);
  }
  return { partial, mass: Math.round(mass), tangentialSpread: +(tan / 8).toFixed(2), radialSpread: +(rad / 8).toFixed(2) };
}

console.log('gpu:cloner-blur');
const mcp = await startMcp('gpu-cloner-blur');
try {
  await mcp.call('create_project', { name: 'B89 cloner blur', format: 'long', frameRate: 30, durationFrames: 90, clipLength: 'comp', uiMode: 'pro' }, 400000);
  const set = (layerId, path, value) => mcp.action('editor.updateLayerProperty', { layerId, path, value });
  const src = idOf(await mcp.action('editor.addShapeLayer', { opts: { type: 'rectangle', x: 0, y: 0, width: 70, height: 70, fill: [1, 1, 1, 1], name: 'tile' } }));
  await mcp.actions([{ actionId: 'editor.selectLayer', args: [src] }, { actionId: 'editor.addCloner', args: [] }]);
  const cl = (await mcp.call('get_state')).layers.find((l) => l.type === 'cloner');
  assert.ok(cl, 'no cloner created');
  await set(cl.id, 'distribution', { type: 'radial', count: 8, radius: 300, arcDegrees: 360, center: { x: 0, y: 0, z: 0 }, startAngleDegrees: 22.5, orientToCenter: true });
  await set(cl.id, 'transform.position.defaultValue', [960, 540]);
  const k = await mcp.action('editor.setKeyframes', { layerId: cl.id, propertyPath: 'transform.rotation', keyframes: [{ frame: 0, value: 0, ease: 'linear' }, { frame: 60, value: 360, ease: 'linear' }] });
  assert.equal(k.ok, true, JSON.stringify(k));
  const render = makeRenderer(mcp, OUT);

  const sharp = await render('f30-blur-off', 30);
  const sharpRest = await render('f75-blur-off', 75);
  const s0 = stats(sharp, 960, 540);
  check('1. blur off: the copies are sharp (few partial pixels)', () => {
    assert.ok(s0.mass > 30000, `ink mass ${s0.mass} (8 copies of 70 x 70 = 39200)`);
    assert.ok(s0.partial < 3000, `partial ${s0.partial}`);
    return s0;
  });

  await set(cl.id, 'motionBlur', true);
  const blurred = await render('f30-cloner-blur-on', 30);
  const s1 = stats(blurred, 960, 540);
  check('2. cloner switch on: every copy smears along the ring, light conserved', () => {
    assert.ok(s1.partial > 4 * Math.max(500, s0.partial), `partial ${s1.partial} vs sharp ${s0.partial}`);
    assert.ok(Math.abs(s1.mass - s0.mass) / s0.mass < 0.06, `mass ${s1.mass} vs ${s0.mass}`);
    // 6 deg / frame at r = 300 -> 31.4 px / frame; a 180 deg shutter = a 15.7 px box streak along the tangent, so the
    // tangential sigma becomes sqrt(sharp^2 + 15.7^2 / 12) and the radial sigma stays (it grows far less).
    const expected = Math.sqrt(s0.tangentialSpread ** 2 + (Math.PI * 2 * 300 / 60 / 2) ** 2 / 12);
    assert.ok(Math.abs(s1.tangentialSpread - expected) < 0.25, `tangential ${s1.tangentialSpread}, expected ${expected.toFixed(2)} (sharp ${s0.tangentialSpread})`);
    assert.ok(s1.tangentialSpread - s0.tangentialSpread > 2.5 * Math.abs(s1.radialSpread - s0.radialSpread), `tangential growth vs radial growth`);
    return { ...s1, expectedTangential: +expected.toFixed(2) };
  });
  const blurredRest = await render('f75-cloner-blur-on', 75);

  await set(cl.id, 'motionBlur', false);
  await set(src, 'motionBlur', true);
  const viaSource = await render('f30-source-blur-on', 30);
  check('3. the source switch alone renders the same smear', () => {
    const d = diff(viaSource, blurred, null, 2);
    assert.ok(d.n < 50, `differs from the cloner-switch render in ${d.n} px (max ${d.max})`);
    return { differingPx: d.n, maxDelta: d.max };
  });
  check('4. ring at rest (f75): blur on renders byte-identical to blur off', () => {
    const d = diff(blurredRest, sharpRest, null, 0);
    assert.equal(d.n, 0, `differs in ${d.n} px`);
  });

  const mp4 = join(OUT, 'cloner-blur-export.mp4');
  await mcp.call('export_mp4', { path: mp4, width: 960, height: 540, frameRate: 30, bitrate: 12000000, includeAudio: false }, 1800000);
  const grab = (n) => ({ width: 960, height: 540, px: execFileSync('ffmpeg', ['-loglevel', 'error', '-i', mp4, '-vf', `select=eq(n\\,${n}),scale=960:540:in_color_matrix=bt709:in_range=tv`, '-vframes', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 64 << 20 }) });
  const e30 = stats(grab(30), 480, 270, 0.5), e75 = stats(grab(75), 480, 270, 0.5);
  check('5. export_mp4: the exported f30 smears along the ring, the resting f75 does not', () => {
    // half size: sigma 10.0 -> about 10.3 (the 7.85 px streak); compare with the same build at rest
    assert.ok(e30.tangentialSpread > e75.tangentialSpread + 0.15, `exported tangential ${e30.tangentialSpread} vs rest ${e75.tangentialSpread}`);
    assert.ok(e30.partial > 3 * Math.max(200, e75.partial), `exported partial ${e30.partial} vs rest ${e75.partial}`);
    return { f30: e30, f75: e75 };
  });

  writeFileSync(join(OUT, 'results.json'), JSON.stringify({ passed, results }, null, 2));
  console.log(`\n✓ gpu:cloner-blur - ${passed}/${results.length} checks passed. Frames: ${OUT}`);
} catch (e) {
  console.error(`\nFAILED after ${passed} checks: ${e.stack ?? e.message}\n--- server stderr ---\n${mcp.stderr().slice(-3000)}`);
  process.exitCode = 1;
} finally {
  await mcp.close();
}
