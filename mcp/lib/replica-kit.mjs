// Replica kit: generic helpers for rebuilding a reference video frame by frame through the FlashFX MCP.
// Everything goes through the real MCP server over stdio (mcp/flashfx-mcp.mjs -> window.__ffxAgent), so a
// build script that uses this kit is exactly what Claude would do with the same tools.
//
//   import { openReplica } from '<repo>/mcp/lib/replica-kit.mjs';
//   const k = await openReplica({ name: 'r04 replica', width: 1080, height: 1080, fps: 60, frames: 600, bg: '#e4e6e3' });
//   const pill = await k.shape({ name: 'Search pill', type: 'rectangle', x: 540, y: 545, w: 497, h: 90, fill: '#fefefe', radius: 45 });
//   await k.keys(pill, 'transform.position', [[1, [675, 545], [0, 0.731, 0.205, 0.969]], [45, [539, 545]]]);
//   await k.finish(outDir);  // project.ffx + replica.mp4 + reload proof (editability.json)
//
// Frame numbers given to k.keys / k.span are REFERENCE frames (1-based, the convention of refs/rNN/timeline.json);
// the kit converts them to FlashFX frames (0-based): FlashFX frame = reference frame - 1.

import { writeFileSync, mkdirSync, existsSync, statSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
import { connectFlashFx } from '../examples/lib/mcp-client.mjs';

/** "#rrggbb" or "#rrggbbaa" -> RGBA 0..1 (optional alpha override). */
export const rgba = (hex, a) => {
  const h = hex.replace('#', '');
  const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const alpha = a ?? (h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1);
  return [...c, alpha];
};
const col = (c) => (typeof c === 'string' ? rgba(c) : c);

/** Reference frame (1-based) -> FlashFX frame (0-based). */
export const F = (refFrame) => refFrame - 1;

/** Walk any layer JSON and count keyframes (arrays named "keyframes" with entries). */
export function countKeyframes(obj, acc = { total: 0, paths: {} }, path = '') {
  if (Array.isArray(obj)) { obj.forEach((v, i) => countKeyframes(v, acc, `${path}.${i}`)); return acc; }
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      const p = path ? `${path}.${k}` : k;
      if (k === 'keyframes' && Array.isArray(v) && v.length) { acc.total += v.length; acc.paths[path || '(root)'] = v.length; }
      else countKeyframes(v, acc, p);
    }
  }
  return acc;
}

export async function openReplica({ name, width, height, fps, frames, bg = '#000000', server = process.env.FLASHFX_SERVER ?? 'auto', verbose } = {}) {
  const mcp = await connectFlashFx({ server, verbose });
  const log = [];
  const t0 = Date.now();
  const note = (m) => { log.push(`${((Date.now() - t0) / 1000).toFixed(1)}s ${m}`); if (process.env.FLASHFX_VERBOSE) console.error(m); };

  const fmt = width >= height ? 'long' : 'short';
  await mcp.call('create_project', { name, format: fmt, frameRate: fps, durationFrames: frames, clipLength: 'comp' });
  await mcp.actions([
    { actionId: 'editor.setCompositionSize', args: { width, height } },
    { actionId: 'editor.setCompositionSetting', args: { key: 'frameRate', value: fps } },
    { actionId: 'editor.setCompositionSetting', args: { key: 'durationFrames', value: frames } },
  ]);
  // The comp background stack: one solid layer (a 2-stop linear gradient of one colour).
  const st0 = await mcp.call('get_state');
  let bgId = st0.background?.layers?.[0]?.id;
  if (!bgId) bgId = (await mcp.action('editor.addBackgroundLayer', [])).result;
  const bgc = rgba(bg);
  await mcp.action('editor.updateBackgroundLayer', { id: bgId, updates: { type: 'solid', opacity: 1, enabled: true, stops: [
    { color: bgc.slice(0, 3), position: 0, opacity: 1 }, { color: bgc.slice(0, 3), position: 1, opacity: 1 }] } });
  note(`project ${width}x${height}@${fps} ${frames}f`);

  const act = (actionId, args) => mcp.action(actionId, args);
  const set = (layerId, path, value) => act('editor.updateLayerProperty', { layerId, path, value });
  const sets = (layerId, obj) => mcp.actions(Object.entries(obj).map(([path, value]) => ({ actionId: 'editor.updateLayerProperty', args: { layerId, path, value } })));

  /** Keyframes in REFERENCE frames: [[refFrame, value, ease?], ...]; ease shapes the segment to the next key. */
  const keys = (layerId, propertyPath, list, { merge = false, offset = 0 } = {}) => act('editor.setKeyframes', {
    layerId, propertyPath, merge,
    keyframes: list.map(([f, value, ease]) => ({ frame: F(f) + offset, value: Array.isArray(value) && typeof value[0] === 'string' ? col(value[0]) : (typeof value === 'string' ? col(value) : value), ...(ease !== undefined ? { ease } : {}) })),
  });

  /** Clip range in REFERENCE frames (inclusive): the layer exists only from refIn to refOut. */
  const span = (layerId, refIn, refOut) => mcp.actions([
    { actionId: 'editor.updateLayerProperty', args: { layerId, path: 'inPoint', value: F(refIn) } },
    { actionId: 'editor.updateLayerProperty', args: { layerId, path: 'outPoint', value: F(refOut) + 1 } },
  ]);

  async function shape({ name: n, type = 'rectangle', x, y, w, h, fill = '#ffffff', radius, stroke, strokeWidth, points, innerRatio }) {
    const opts = { type, x, y, width: w, height: h, fill: col(fill), name: n };
    if (radius !== undefined) opts.radius = radius;
    if (stroke !== undefined) { opts.stroke = col(stroke); opts.strokeWidth = strokeWidth ?? 2; }
    if (points !== undefined) opts.points = points;
    if (innerRatio !== undefined) opts.innerRatio = innerRatio;
    const r = await act('editor.addShapeLayer', { opts });
    return r.result;
  }

  async function text({ name: n, text: str, x, y, size = 48, weight = 400, family = 'Inter', color = '#000000', spacing, italic, lineHeight, box, align }) {
    const r = await mcp.actions([
      { actionId: 'editor.createQuickText', args: { x, y, text: str } },
      { actionId: 'editor.renameLayer', args: { id: '$0.result', name: n } },
      { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.result', path: 'animOverrides.fontSize.defaultValue', value: size } },
      { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.result', path: 'content.spans.0.style.fontSize', value: size } },
      { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.result', path: 'content.spans.0.style.fontWeight', value: weight } },
      { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.result', path: 'content.spans.0.style.fontFamily', value: family } },
      { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.result', path: 'content.spans.0.style.color', value: col(color) } },
    ]);
    const id = r[0].result;
    const extra = {};
    if (spacing !== undefined) extra['animOverrides.letterSpacing.defaultValue'] = spacing;
    if (italic) extra['content.spans.0.style.fontStyle'] = 'italic';
    if (lineHeight !== undefined) extra['content.spans.0.style.lineHeight'] = lineHeight;
    if (box) extra['layoutConfig.boundingBox'] = box;
    if (align) extra['layoutConfig.horizontalAlign'] = align;
    if (Object.keys(extra).length) await sets(id, extra);
    return id;
  }

  /** Measure a string without creating a layer (same layout code as the renderer). */
  const measure = async (opts) => (await act('agent.measureString', opts)).result;

  /** Rectangle mask in COMP px (static; key it with editor.addMaskKeyframe). Returns the mask id. */
  async function mask(layerId, { x, y, w, h, feather, mode, invert, type = 'rectangle' } = {}) {
    await act('editor.addMask', { layerId, type });
    const layer = (await mcp.call('get_layer', { layerId })).result;
    const maskId = layer.masks[layer.masks.length - 1].id;
    const steps = [
      { actionId: 'editor.updateMaskProperty', args: { layerId, maskId, path: 'position.defaultValue', value: [x, y] } },
      { actionId: 'editor.updateMaskProperty', args: { layerId, maskId, path: 'size.defaultValue', value: [w, h] } },
    ];
    if (feather !== undefined) steps.push({ actionId: 'editor.updateMaskProperty', args: { layerId, maskId, path: 'feather.defaultValue', value: feather } });
    if (mode !== undefined) steps.push({ actionId: 'editor.updateMaskProperty', args: { layerId, maskId, path: 'mode', value: mode } });
    if (invert !== undefined) steps.push({ actionId: 'editor.updateMaskProperty', args: { layerId, maskId, path: 'inverted', value: invert } });
    await mcp.actions(steps);
    return maskId;
  }

  /** Parent a layer and put it at a LOCAL offset from the parent (FlashFX keeps the local position). */
  async function parent(childId, parentId, local) {
    await act('editor.setLayerParent', { childId, parentId });
    if (local) await set(childId, 'transform.position.defaultValue', local);
  }

  const renderStrip = (frames, path, opts = {}) => mcp.call('render_strip', { frames: frames.map(F), path, inline: false, ...opts });
  const renderFrame = (frame, path, opts = {}) => mcp.call('render_frame', { frame: F(frame), path, inline: false, ...opts });

  /** Iteration check without a full export: render the given REFERENCE frames with render_frame and write a grid of
   *  reference | replica pairs (with SSIM) to outPng. Needs python + OpenCV (mcp/lib/pair_grid.py). */
  async function compareFrames(refVideo, refFrames, outPng) {
    const dir = join(tmpdir(), `ffx-pairs-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    const items = [];
    for (const f of refFrames) {
      const p = join(dir, `f${f}.png`);
      await mcp.call('render_frame', { frame: F(f), path: p, inline: false });
      items.push(`${f}=${p}`);
    }
    execFileSync('python', ['-I', join(HERE, 'pair_grid.py'), refVideo, resolve(outPng), ...items], { stdio: 'inherit' });
    return resolve(outPng);
  }

  /** Export the editable project + the MP4 through the real exporter, then prove editability by reloading the
   *  .ffx (import_project -> editor.loadDocument) and inspecting every layer. Writes editability.json. */
  async function finish(outDir, { probeFrames = [], skipVideo = false } = {}) {
    outDir = resolve(outDir);
    mkdirSync(outDir, { recursive: true });
    const before = await mcp.call('get_state');
    if (probeFrames.length) await renderStrip(probeFrames, join(outDir, 'check-before-reload.png'), { tileWidth: 360 });
    const ffx = join(outDir, 'project.ffx');
    await mcp.call('export_project', { path: ffx });
    note('project.ffx written');
    if (!skipVideo) {
      await mcp.call('export_mp4', { path: join(outDir, 'replica.mp4'), width, height, frameRate: fps, bitrate: 16000000, includeAudio: false }, { timeoutMs: 3600000 });
      note('replica.mp4 exported');
    }
    const proof = await verifyEditable(mcp, ffx, outDir, { probeFrames, expectLayers: before.layers.length });
    const a = join(outDir, 'check-before-reload.png'), b = join(outDir, 'check-after-reload.png');
    proof.beforeReload = { layers: before.layers.length, strip: probeFrames.length ? a : null };
    // Same frames rendered from the live build and from the reloaded .ffx must be byte-identical PNGs.
    proof.reloadRenderIdentical = probeFrames.length && existsSync(a) && existsSync(b) ? readFileSync(a).equals(readFileSync(b)) : null;
    proof.buildLog = log;
    proof.calls = { total: mcp.calls.length, failed: mcp.calls.filter((c) => !c.ok).length, ms: mcp.calls.reduce((a, c) => a + c.ms, 0) };
    writeFileSync(join(outDir, 'editability.json'), JSON.stringify(proof, null, 1));
    return proof;
  }

  return { mcp, act, set, sets, keys, span, shape, text, measure, mask, parent, renderStrip, renderFrame, compareFrames, finish, note, log, F, rgba, width, height, fps, frames };
}

/** Reload a .ffx through the MCP (import_project = the app's File > Import Project, which installs the document with
 *  editor.loadDocument) and prove the result is an editable FlashFX project: named layers, live keyframes, animators
 *  and masks (not baked frames), and an edit + undo that round-trips. */
export async function verifyEditable(mcp, ffxPath, outDir, { probeFrames = [], expectLayers } = {}) {
  const size = existsSync(ffxPath) ? statSync(ffxPath).size : 0;
  const imp = await mcp.call('import_project', { path: ffxPath });
  const st = await mcp.call('get_state');
  const layers = [];
  for (const l of st.layers) {
    const full = (await mcp.call('get_layer', { layerId: l.id })).result;
    const kf = countKeyframes(full);
    layers.push({
      id: l.id, name: full.name, type: full.type, keyframes: kf.total, keyedPaths: Object.keys(kf.paths).length,
      animators: full.animators?.length ?? 0, masks: full.masks?.length ?? 0, parentId: full.parentId ?? null,
      inPoint: full.inPoint, outPoint: full.outPoint,
      text: full.content?.spans ? full.content.spans.map((s) => s.text).join('') : undefined,
    });
  }
  const defaultNamed = layers.filter((l) => /^(Text|Rectangle|Circle|Ellipse|Shape|Star|Polygon|Layer|Image)( \d+)?$/.test(l.name ?? ''));
  // An edit on the reloaded project: move the first keyed layer's first key, read it back, undo it.
  let editCheck = null;
  const keyed = layers.find((l) => l.keyframes > 0);
  if (keyed) {
    const target = st.layers.find((l) => l.id === keyed.id);
    const ren = await mcp.action('editor.renameLayer', { id: target.id, name: `${keyed.name} (edited)` });
    const after = (await mcp.call('get_layer', { layerId: target.id })).result.name;
    await mcp.call('undo');
    const restored = (await mcp.call('get_layer', { layerId: target.id })).result.name;
    editCheck = { layer: keyed.name, renamedTo: after, afterUndo: restored, undoDepth: ren.undoDepth, ok: after.endsWith('(edited)') && restored === keyed.name };
  }
  let strip = null;
  if (probeFrames.length) {
    strip = (await mcp.call('render_strip', { frames: probeFrames.map(F), path: join(outDir, 'check-after-reload.png'), inline: false, tileWidth: 360 })).result?.path ?? null;
  }
  const totals = {
    layers: layers.length, keyframes: layers.reduce((a, l) => a + l.keyframes, 0), keyedLayers: layers.filter((l) => l.keyframes > 0).length,
    animators: layers.reduce((a, l) => a + l.animators, 0), masks: layers.reduce((a, l) => a + l.masks, 0),
    imageLayers: layers.filter((l) => l.type === 'image' || l.type === 'video').length,
  };
  return {
    ffx: ffxPath, ffxBytes: size, reopenedProjectId: imp.result?.projectId, comp: `${st.width}x${st.height}@${st.fps} ${st.durationFrames}f`,
    expectLayers, layersMatch: expectLayers === undefined ? null : expectLayers === layers.length,
    totals, defaultNamedLayers: defaultNamed.map((l) => l.name), editCheck, stripAfterReload: strip, layers,
    verdict: (expectLayers === undefined || expectLayers === layers.length) && defaultNamed.length === 0 && totals.keyframes > 0 && (editCheck?.ok ?? false)
      ? 'editable: every layer named, keyframes live after reload, edit + undo round-trips' : 'CHECK: see fields',
  };
}
