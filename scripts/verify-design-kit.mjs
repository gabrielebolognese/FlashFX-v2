// Acceptance harness for B76: the design-tool UI kit (animation-templates/designKit.ts) - the selection box
// tracks the target's oriented bounds on every frame, anchor squares ride the path vertices, the readout text
// equals the measured delta, guide labels follow their point, the design-app cursor icons join the agent rig,
// and the counter samples table + rigRole survive save / load. Pure node (esbuild bundle of the real TS).
// GPU proof through the MCP: gpu:design-kit.
//   node scripts/verify-design-kit.mjs   (or: npm run verify:design-kit)
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

globalThis.Worker = class { postMessage() {} terminate() {} addEventListener() {} removeEventListener() {} set onmessage(_v) {} set onerror(_v) {} };
globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return { font: '', textBaseline: 'top', measureText: (s) => ({ width: s.length * 10, actualBoundingBoxLeft: 0, actualBoundingBoxRight: s.length * 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }), setTransform() {}, fillText() {}, strokeText() {}, fillRect() {} }; } };

const tmp = mkdtempSync(join(tmpdir(), 'design-kit-verify-'));
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };
const close = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`);

try {
  const outfile = join(tmp, 'bundle.mjs');
  await build({
    stdin: {
      contents: `
        export * from './src/animation-templates/designKit';
        export { buildAgentCursor, findCursorRig, planCursorIcon, cursorIconAt, buildMissingCursorIcon, cursorIconKindByGeometry, AGENT_CURSOR_ICONS, DESIGN_CURSOR_ICONS } from './src/animation-templates/cursorRig';
        export { resolveFrame, evaluateVec2, evaluateNumber } from './src/core/interpolation';
        export { counterTextAt, withTextCounter, normalizeTextCounter } from './src/core/textCounter';
        export { createComposition, createRectangleLayer, createPolygonLayer } from './src/core/factory';
        export { buildKeyframesFromSpecs } from './src/core/keyframeSpecs';
        export { localToComp, resolveXform } from './src/store/pathTransform';
        export { evalPathKeyframes, evalPathAnchors, morphPaths } from './src/core/shapeModifiers';
        export { validateComposition } from './src/project-system/services/validation';
      `,
      resolveDir: process.cwd(), sourcefile: 'entry.ts', loader: 'ts',
    },
    bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
  });
  const m = await import(pathToFileURL(outfile).href);
  const {
    sampleFromResolved, sparseLinearKeys, planSelectionBox, planAnchorSquares, planReadout, planGuideLabel, readoutValue, READOUT_PRESETS, localToCompPoint,
    buildAgentCursor, findCursorRig, planCursorIcon, cursorIconAt, buildMissingCursorIcon, cursorIconKindByGeometry, AGENT_CURSOR_ICONS, DESIGN_CURSOR_ICONS,
    resolveFrame, evaluateVec2, evaluateNumber, counterTextAt, withTextCounter, createComposition, createRectangleLayer, createPolygonLayer,
    buildKeyframesFromSpecs, localToComp, resolveXform, validateComposition, evalPathKeyframes, evalPathAnchors, morphPaths,
  } = m;

  console.log('verify:design-kit');
  const comp = createComposition('c', { width: 1920, height: 1080, frameRate: 30, durationFrames: 60, backgroundColor: [0.9, 0.9, 0.9, 1] });
  // Target 1: a 120 x 60 rectangle that slides, rotates 0 -> 90 and grows (easeInOutCubic: r11's drags).
  const rect = createRectangleLayer('glyph', 600, 500, 120, 60, [0.2, 0.2, 0.2, 1], 60);
  rect.transform.position.keyframes = buildKeyframesFromSpecs([{ frame: 10, value: [600, 500], ease: 'cubicInOut' }, { frame: 20, value: [442.3, 498] }]);
  rect.transform.rotation.keyframes = buildKeyframesFromSpecs([{ frame: 10, value: 0, ease: 'cubicInOut' }, { frame: 20, value: 90 }]);
  rect.transform.scale.keyframes = buildKeyframesFromSpecs([{ frame: 10, value: [1, 1], ease: 'cubicInOut' }, { frame: 20, value: [1.5, 0.5] }]);
  // Target 2: a triangle path (an outlined "V") whose vertex 0 is dragged (via a parent group? no: own position) + rotated.
  const tri = createPolygonLayer('V', 1200, 400, [[0, 0], [80, 0], [40, 120]].map((p) => ({ position: p, handleIn: [0, 0], handleOut: [0, 0], vertexType: 'corner' })), true, [0.2, 0.2, 0.2, 1], 60);
  tri.transform.rotation.keyframes = buildKeyframesFromSpecs([{ frame: 0, value: -10, ease: 'linear' }, { frame: 30, value: 25 }]);
  tri.transform.anchorPoint.defaultValue = [40, 60];
  comp.layers = [rect, tri];

  const sampleRange = (layer, a, b) => {
    const out = [];
    for (let f = a; f < b; f++) out.push(sampleFromResolved(resolveFrame(comp, f).layers.find((l) => l.id === layer.id), f));
    return out;
  };
  const rs = sampleRange(rect, 0, 30);
  const ts = sampleRange(tri, 0, 30);

  check('sampleFromResolved: oriented corners = the renderer mapping (localToComp of the resolved transform) incl. anchor / scale / rotation', () => {
    for (const f of [0, 13, 15, 20, 29]) {
      const s = rs[f];
      const x = resolveXform(rect, f);
      const want = [[-60, -30], [60, -30], [60, 30], [-60, 30]].map((p) => localToComp(x, p));
      s.corners.forEach((c, i) => { close(c[0], want[i][0], 1e-6, `f${f} c${i}x`); close(c[1], want[i][1], 1e-6, `f${f} c${i}y`); });
      close(s.width, 120 * evaluateVec2(rect.transform.scale, f)[0], 1e-6, 'width');
      close(s.rotation, evaluateNumber(rect.transform.rotation, f), 1e-9, 'rotation');
    }
    const t0 = ts[7], x = resolveXform(tri, 7);
    t0.points.forEach((p, i) => { const w = localToComp(x, tri.shape.vertices[i].position); close(p[0], w[0], 1e-6, 'pt x'); close(p[1], w[1], 1e-6, 'pt y'); });
    assert.equal(localToCompPoint(x, [3, 4])[0], localToComp(x, [3, 4])[0]);
  });

  check('sparseLinearKeys: constant -> no keys, a straight ramp -> 2 keys, an eased move keeps what a line cannot predict', () => {
    const fr = [0, 1, 2, 3, 4, 5];
    assert.deepEqual(sparseLinearKeys(fr, fr.map(() => [5, 5])), []);
    assert.deepEqual(sparseLinearKeys(fr, fr.map((f) => [f * 2])).map((k) => k.frame), [0, 5]);
    const eased = fr.map((f) => [Math.pow(f / 5, 3) * 100]);
    const ks = sparseLinearKeys(fr, eased);
    assert.ok(ks.length > 2 && ks[0].frame === 0 && ks[ks.length - 1].frame === 5);
  });

  // World position of a child of a (rotated) group: group pos + R(group rot) * child local.
  const childWorld = (group, child, f) => {
    const gp = evaluateVec2(group.transform.position, f), a = (evaluateNumber(group.transform.rotation, f) * Math.PI) / 180;
    const cp = evaluateVec2(child.transform.position, f);
    return [gp[0] + cp[0] * Math.cos(a) - cp[1] * Math.sin(a), gp[1] + cp[0] * Math.sin(a) + cp[1] * Math.cos(a)];
  };

  const box = planSelectionBox(rs, { endFrame: 30 });
  const [g, outline, ...handles] = box.layers;
  check('selection box: on EVERY frame the outline centre / size / rotation and all 8 handles sit on the target (0.02 px)', () => {
    assert.equal(handles.length, 8);
    assert.equal(g.type, 'group');
    for (const s of rs) {
      const f = s.frame;
      const c = evaluateVec2(g.transform.position, f);
      close(c[0], s.center[0], 0.02, `f${f} cx`); close(c[1], s.center[1], 0.02, `f${f} cy`);
      close(evaluateNumber(g.transform.rotation, f), s.rotation, 0.02, `f${f} rot`);
      close(evaluateNumber(outline.shape.width, f), s.width, 0.02, `f${f} w`);
      close(evaluateNumber(outline.shape.height, f), s.height, 0.02, `f${f} h`);
      for (let i = 0; i < 4; i++) {
        const w = childWorld(g, handles[i], f);
        close(w[0], s.corners[i][0], 0.03, `f${f} handle${i} x`); close(w[1], s.corners[i][1], 0.03, `f${f} handle${i} y`);
      }
      const top = childWorld(g, handles[4], f);
      close(top[0], (s.corners[0][0] + s.corners[1][0]) / 2, 0.03, 'T handle x');
    }
  });
  check('selection box: sparse keys (static stretches carry none), outline stroke-only, clip = range, parts tagged', () => {
    const k = g.transform.position.keyframes;
    assert.ok(k.length >= 4 && k.length <= 15, `position keys ${k.length}`);
    const inner = k.slice(1, -1).map((x) => x.frame);
    assert.ok(k[0].frame === 0 && k[k.length - 1].frame === 29 && inner.every((f) => f >= 10 && f <= 20), `keys only at the ends and around the move: ${k.map((x) => x.frame)}`);
    assert.equal(outline.shape.fillColor[3], 0);
    assert.equal(outline.shape.strokeWidth.defaultValue, 1);
    assert.ok(box.layers.every((l) => l.inPoint === 0 && l.outPoint === 30));
    assert.equal(g.rigRole, 'design.selection');
    assert.equal(handles[0].rigRole, 'design.selection.handle.TL');
    assert.equal(planSelectionBox(rs, { handles: 'corners' }).handleIds.length, 4);
    assert.equal(planSelectionBox(rs, { handles: 'none' }).handleIds.length, 0);
    const padded = planSelectionBox(rs, { padding: 5 });
    close(evaluateNumber(padded.layers[1].shape.width, 0), 130, 1e-9, 'padding');
  });

  check('anchor squares: each square = its vertex in comp px on every frame; highlight fills; bad index refused', () => {
    const plan = planAnchorSquares(ts, { highlight: [0], endFrame: 30 });
    assert.deepEqual(plan.points, [0, 1, 2]);
    const sq = plan.layers.slice(1);
    for (const s of ts) sq.forEach((l, i) => { const p = evaluateVec2(l.transform.position, s.frame); close(p[0], s.points[i][0], 0.02, 'sq x'); close(p[1], s.points[i][1], 0.02, 'sq y'); });
    assert.equal(sq[0].shape.fillColor[2], 1); // blue fill
    assert.deepEqual(sq[1].shape.fillColor, [1, 1, 1, 1]);
    assert.throws(() => planAnchorSquares(ts, { points: [3] }), /out of range/);
    assert.throws(() => planAnchorSquares(rs), /no path points/);
  });

  check('readout: the text on every frame = label + the MEASURED value (dX of the move, 2 decimals, comma) + unit', () => {
    const lines = READOUT_PRESETS.move;
    const anchors = rs.map((s) => [s.center[0] + 80, s.center[1] + 40]);
    const plan = planReadout(rs, { lines, anchors, lineWidths: [140, 140], endFrame: 30 });
    const [rg, bg, dxL, dyL] = plan.layers;
    assert.equal(rg.rigRole, 'design.readout');
    for (const s of rs) {
      const dx = s.center[0] - rs[0].center[0], dy = s.center[1] - rs[0].center[1];
      const fmt = (v) => (Math.abs(v) < 0.005 ? '0,00' : v.toFixed(2).replace('.', ','));
      const at = withTextCounter(dxL, s.frame).content.spans.map((sp) => sp.text).join('');
      assert.equal(at, `dX: ${fmt(dx)} px`, `f${s.frame}`);
      assert.equal(withTextCounter(dyL, s.frame).content.spans.map((sp) => sp.text).join(''), `dY: ${fmt(dy)} px`);
      const p = evaluateVec2(rg.transform.position, s.frame);
      close(p[0], anchors[s.frame][0], 0.02, 'tooltip follows');
    }
    assert.equal(withTextCounter(dxL, 25).content.spans[1].text, '-157,70');
    assert.equal(bg.shape.width.defaultValue, 140 + 2 * 8);
    // the angle preset reads the rotation delta, the size preset the scaled box
    const ang = rs.map((s) => readoutValue(READOUT_PRESETS.angle[0], s, rs[0]));
    close(ang[20], 90, 1e-9, 'angle'); close(ang[15], 45, 1e-9, 'angle mid (easeInOutCubic)');
    close(readoutValue(READOUT_PRESETS.size[0], rs[25], rs[0]), 180, 1e-9, 'W');
    // a vertex readout measures that point
    const vx = readoutValue({ label: '', quantity: 'dx', point: 2 }, ts[20], ts[0]);
    close(vx, ts[20].points[2][0] - ts[0].points[2][0], 1e-9, 'vertex dx');
  });

  check('readout in resolveFrame: the rendered text quad reads the per-frame value; scrubbing is identical', () => {
    const plan = planReadout(rs, { lines: READOUT_PRESETS.angle, anchors: rs.map(() => [100, 100]), lineWidths: [120], endFrame: 30 });
    const c2 = { ...comp, layers: [...comp.layers, ...plan.layers] };
    const txt = (f) => resolveFrame(c2, f).layers.filter((l) => l.text && l.id.startsWith(plan.textIds[0])).map((l) => l.text.content).join('');
    assert.equal(txt(15), 'Angle: 45,00°');
    assert.equal(txt(20), 'Angle: 90,00°');
    assert.equal(txt(5), 'Angle: 0,00°');
    const a = txt(13); txt(2); txt(27);
    assert.equal(txt(13), a);
  });

  check('guide label: follows its point, pin line spans label -> point', () => {
    const pts = ts.map((s) => s.points[0]);
    const pos = pts.map((p) => [p[0], p[1] - 16]);
    const plan = planGuideLabel({ text: 'anchor', positions: pos, frames: ts.map((s) => s.frame), line: { from: pos.map((p) => [p[0], p[1] + 9]), to: pts }, endFrame: 30 });
    const [ln, label] = plan.layers;
    assert.equal(label.content.spans[0].text, 'anchor');
    for (const s of ts) {
      const p = evaluateVec2(label.transform.position, s.frame);
      close(p[0], pos[s.frame][0], 0.02, 'label x');
      close(evaluateNumber(ln.shape.height, s.frame), 7, 0.02, 'line length');
    }
    assert.throws(() => planGuideLabel({ text: '', positions: [[0, 0]], frames: [0] }));
  });

  check('cursor rig: the base rig is unchanged (3 icons); a design start icon adds just that one; recognised by geometry when renamed', () => {
    const base = buildAgentCursor({ x: 10, y: 10, frame: 0, endFrame: 60 });
    assert.deepEqual(base.slice(1).map((l) => l.name).sort(), [...AGENT_CURSOR_ICONS].sort());
    for (const icon of DESIGN_CURSOR_ICONS) {
      const r = buildAgentCursor({ icon, x: 10, y: 10, frame: 0, endFrame: 60 });
      assert.equal(r.length, 5);
      const ic = r.find((l) => l.name === icon);
      assert.equal(ic.transform.opacity.defaultValue, 1);
      assert.equal(cursorIconKindByGeometry({ ...ic, name: 'renamed' }), icon);
      const rig = findCursorRig(r.map((l) => (l.id === ic.id ? { ...l, name: 'x' } : l)), r[0].id);
      assert.equal(cursorIconAt(rig, 5), icon);
    }
  });

  check('cursor rig: a design icon missing on an old rig is built hidden, then shown by the icon swap (others hide)', () => {
    const layers = buildAgentCursor({ x: 10, y: 10, frame: 0, endFrame: 60 });
    const rig = findCursorRig(layers, layers[0].id);
    const pen = buildMissingCursorIcon(rig, 'pen');
    assert.equal(pen.parentId, layers[0].id);
    assert.equal(pen.transform.opacity.defaultValue, 0);
    assert.equal(buildMissingCursorIcon(rig, 'arrow'), null);
    const withPen = { ...rig, icons: { ...rig.icons, pen } };
    const upd = planCursorIcon(withPen, 12, 'pen');
    const byName = Object.fromEntries(upd.map((l) => [l.name, l]));
    assert.equal(evaluateNumber(byName.pen.transform.opacity, 11), 0);
    assert.equal(evaluateNumber(byName.pen.transform.opacity, 12), 1);
    assert.equal(evaluateNumber(byName.arrow.transform.opacity, 12), 0);
    assert.equal(evaluateNumber(byName.arrow.transform.opacity, 11), 1);
  });

  check('save / load keeps rigRole and the counter samples table; junk samples are dropped', () => {
    const plan = planReadout(rs, { lines: READOUT_PRESETS.move, anchors: rs.map(() => [0, 0]), lineWidths: [100, 100], endFrame: 30 });
    const c3 = { ...comp, layers: [...comp.layers, ...box.layers, ...plan.layers] };
    const back = validateComposition(JSON.parse(JSON.stringify(c3)));
    const t = back.layers.find((l) => l.id === plan.textIds[0]);
    assert.deepEqual(t.counter.samples, plan.layers.find((l) => l.id === plan.textIds[0]).counter.samples);
    assert.equal(t.counter.samples.length, 30);
    assert.equal(back.layers.find((l) => l.id === box.groupId).rigRole, 'design.selection');
    const junk = JSON.parse(JSON.stringify(c3));
    junk.layers.find((l) => l.id === plan.textIds[0]).counter.samples = 'x';
    assert.equal('samples' in validateComposition(junk).layers.find((l) => l.id === plan.textIds[0]).counter, false);
    assert.equal(counterTextAt(t.counter, 25), '-157,70');
  });

  check('guide line: both ends ride their points on every frame (pen rubber band / Line Extension), sparse keys', () => {
    const { planGuideLine } = m;
    const from = ts.map((s) => s.points[0]);
    const to = rs.map((s) => s.center);
    const plan = planGuideLine({ from, to, frames: ts.map((s) => s.frame), endFrame: 30 });
    const ln = plan.layers[0];
    for (const s of ts) {
      const f = s.frame, c = evaluateVec2(ln.transform.position, f), a = (evaluateNumber(ln.transform.rotation, f) * Math.PI) / 180, h = evaluateNumber(ln.shape.height, f);
      const endA = [c[0] + Math.sin(a) * h / 2, c[1] - Math.cos(a) * h / 2], endB = [c[0] - Math.sin(a) * h / 2, c[1] + Math.cos(a) * h / 2];
      close(endA[0], from[f][0], 0.03, 'from x'); close(endA[1], from[f][1], 0.03, 'from y');
      close(endB[0], to[f][0], 0.03, 'to x'); close(endB[1], to[f][1], 0.03, 'to y');
    }
    assert.equal(ln.shape.width.defaultValue, 1);
    assert.equal(ln.rigRole, 'design.guide.line');
  });

  check('cursor rig: resize icon centred on the hotspot; rim colour (white rim on a black arrow) applies to every icon', () => {
    const r = buildAgentCursor({ icon: 'resize', x: 0, y: 0, frame: 0, endFrame: 30, color: [0, 0, 0, 1], rim: [1, 1, 1, 1] });
    const rz = r.find((l) => l.name === 'resize');
    const xs = rz.shape.vertices.map((v) => v.position[0] + rz.transform.position.defaultValue[0]);
    const ys = rz.shape.vertices.map((v) => v.position[1] + rz.transform.position.defaultValue[1]);
    close((Math.min(...xs) + Math.max(...xs)) / 2, 0, 1e-9, 'resize cx'); close((Math.min(...ys) + Math.max(...ys)) / 2, 0, 1e-9, 'resize cy');
    assert.ok(r.slice(1).every((l) => l.shape.strokeColor.join() === '1,1,1,1' && l.shape.fillColor.join() === '0,0,0,1'));
    const old = buildAgentCursor({ x: 0, y: 0, frame: 0, endFrame: 30, color: [0, 0, 0, 1], rim: [1, 1, 1, 1] });
    const added = buildMissingCursorIcon(findCursorRig(old, old[0].id), 'pen');
    assert.deepEqual([added.shape.fillColor, added.shape.strokeColor], [[0, 0, 0, 1], [1, 1, 1, 1]]);
    const hand = old.find((l) => l.name === 'hand');
    assert.deepEqual(hand.transform.position.defaultValue, [-4.5, 0]);
  });

  const V = (pts) => pts.map((p) => ({ position: p, handleIn: [0, 0], handleOut: [0, 0], vertexType: 'corner' }));
  const poseA = V([[-80, -120], [-30, -120], [0, 40], [30, -120], [80, -120], [20, 120], [-20, 120]]);
  const poseB = V([[-150, -60], [-100, -60], [0, 40], [30, -120], [80, -120], [20, 120], [-20, 120]]);
  const kf = (align) => [{ frame: 10, vertices: poseA, closed: true, ...(align ? { align } : {}) }, { frame: 20, vertices: poseB, closed: true }];

  check('setShapeMorph align "vertices": mid-morph keeps the 7 anchors and moves each one straight (an anchor drag), handles too', () => {
    const mid = evalPathKeyframes(kf('vertices'), 15);
    assert.equal(mid.vertices.length, 7);
    assert.deepEqual(mid.vertices[0].position, [-115, -90]);
    assert.deepEqual(mid.vertices[2].position, [0, 40]);
    const curved = [{ frame: 0, vertices: [{ position: [0, 0], handleIn: [-10, 0], handleOut: [10, 0], vertexType: 'smooth' }, { position: [50, 0], handleIn: [0, 0], handleOut: [0, 0], vertexType: 'corner' }], closed: false, align: 'vertices' },
      { frame: 10, vertices: [{ position: [0, 20], handleIn: [-30, 0], handleOut: [30, 0], vertexType: 'smooth' }, { position: [50, 0], handleIn: [0, 0], handleOut: [0, 0], vertexType: 'corner' }], closed: false }];
    const c5 = evalPathKeyframes(curved, 5).vertices[0];
    assert.deepEqual([c5.position, c5.handleOut, c5.vertexType], [[0, 10], [20, 0], 'smooth']);
  });
  check('old morphs are unchanged: no align / "auto" still resample by arc length (byte-identical to morphPaths); "vertices" with different counts falls back', () => {
    assert.deepEqual(evalPathKeyframes(kf(undefined), 15), morphPaths(poseA, true, poseB, true, 0.5, false));
    assert.deepEqual(evalPathKeyframes(kf('auto'), 15), morphPaths(poseA, true, poseB, true, 0.5, true));
    assert.equal(evalPathKeyframes(kf(undefined), 15).vertices.length, 56);
    const odd = [{ frame: 0, vertices: poseA, closed: true, align: 'vertices' }, { frame: 10, vertices: poseA.slice(0, 5), closed: true }];
    assert.deepEqual(evalPathKeyframes(odd, 5), morphPaths(poseA, true, poseA.slice(0, 5), true, 0.5, true));
  });
  check('evalPathAnchors: the logical anchors between poses (eased), so squares stay on anchors even over a resampled morph', () => {
    const k = kf(undefined); k[0].ease = 'cubicInOut';
    const a = evalPathAnchors(k, 12);
    const e = 4 * 0.2 ** 3;
    close(a[0][0], -80 + (-70) * e, 1e-9, 'anchor x'); close(a[0][1], -120 + 60 * e, 1e-9, 'anchor y');
    assert.equal(a.length, 7);
    assert.deepEqual(evalPathAnchors(k, 0)[1], [-30, -120]);
    assert.equal(evalPathAnchors([{ frame: 0, vertices: poseA, closed: true }, { frame: 10, vertices: poseA.slice(0, 3), closed: true }], 5), null);
  });
  check('save / load keeps align "vertices" on the poses', () => {
    const shape = createPolygonLayer('m', 0, 0, poseA, true, [1, 1, 1, 1], 30);
    shape.shape.pathKeyframes = kf('vertices');
    const back = validateComposition(JSON.parse(JSON.stringify({ ...comp, layers: [shape] })));
    assert.equal(back.layers[0].shape.pathKeyframes[0].align, 'vertices');
  });

  console.log(`\ndesign-kit: all ${passed} checks passed`);
} catch (e) {
  console.error('\n✗ design-kit FAILED:', e && e.stack ? e.stack : e);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
