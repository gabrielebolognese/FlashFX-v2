// MCP build (b): a UI card / lower-third transition. A gold accent bar shoots up, a rounded dark card
// grows out of it to the right on a CUSTOM cubic-bezier (not a preset), an avatar pops with a
// named back ease, name + role reveal per word / per character, a thin progress line runs along
// the card, then everything exits on a hard ease-in. Shapes, text and custom easing only, built
// ONLY through the FlashFX MCP server tools.
//
//   node mcp/examples/build-b-lower-third.mjs <outDir>
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { connectFlashFx, keyframes, rgba, EASE } from './lib/mcp-client.mjs';

export const NAME = 'b-lower-third';

// The house "UI card" ease: fast start, very long settle. cubic-bezier(0.2, 0.9, 0.1, 1).
const CARD_IN = [0.2, 0.9, 0.1, 1];
// Exit: slow start, hard finish. cubic-bezier(0.7, 0, 0.84, 0).
const CARD_OUT = [0.7, 0, 0.84, 0];

export async function build(mcp, outDir, { exportVideo = true } = {}) {
  const FPS = 30;
  const DUR = 150; // 5 s
  await mcp.call('create_project', { name: 'MCP audit (b) lower third', format: 'long', frameRate: FPS, durationFrames: DUR });

  // Backdrop standing in for footage: a cool diagonal gradient.
  const bg = await mcp.action('editor.addBackgroundLayer', []);
  await mcp.action('editor.updateBackgroundLayer', {
    id: bg.result,
    updates: { type: 'linear', angle: 135, stops: [{ color: [0.16, 0.2, 0.27], position: 0, opacity: 1 }, { color: [0.07, 0.08, 0.11], position: 1, opacity: 1 }] },
  });

  // Geometry (comp px). The card's LEFT edge is fixed at x = L; it grows to width W.
  const L = 150;
  const H = 136;
  const CY = 850;
  const R = 22;

  const shape = async (name, x, y, w, h, color) => {
    const r = await mcp.action('editor.addShapeWithDimensions', { shapeType: 'rectangle', x, y, width: w, height: h });
    const id = r.activeLayerId;
    await mcp.actions([
      { actionId: 'editor.renameLayer', args: { id, name } },
      { actionId: 'editor.updateLayerProperty', args: { layerId: id, path: 'shape.fillColor', value: color } },
      // Friction: every new shape has a 1 px grey stroke; clean UI work wants none.
      { actionId: 'editor.updateLayerProperty', args: { layerId: id, path: 'shape.strokeWidth.defaultValue', value: 0 } },
    ]);
    return id;
  };

  // 1. Name + role (created first so they can be measured and the card sized to fit), left-aligned after the avatar. Friction: an auto-size text box is exactly as wide
  // as the text, so horizontalAlign "left" changes nothing (x stays the CENTRE), and a fixed-width box
  // misplaces per-glyph animated text. So: measure the text (measure_text) and put its centre at
  // TX + width / 2.
  const TX = L + 136;
  const text = async (name, y, str, size, weight, color, spacing) => {
    const r = await mcp.actions([
      { actionId: 'editor.createQuickText', args: { x: TX, y, text: str } },
      { actionId: 'editor.renameLayer', args: { id: '$0.result', name } },
      { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.result', path: 'animOverrides.fontSize.defaultValue', value: size } },
      { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.result', path: 'content.spans.0.style.fontSize', value: size } },
      { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.result', path: 'content.spans.0.style.fontWeight', value: weight } },
      { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.result', path: 'content.spans.0.style.color', value: color } },
      { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.result', path: 'animOverrides.letterSpacing.defaultValue', value: spacing } },
      { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.result', path: 'motionBlur', value: true } },
    ]);
    const id = r[0].result;
    const m = (await mcp.call('measure_text', { layerId: id, frame: 60 })).result;
    await mcp.action('editor.updateLayerProperty', { layerId: id, path: 'transform.position.defaultValue', value: [TX + m.ink.width / 2, y] });
    return { id, width: m.ink.width };
  };
  // Measure first with throwaway copies: the stack order follows creation (track) order and
  // reorderLayers does not change what draws on top (see docs/MCP-AUDIT.md), so the card must be
  // created BEFORE the real texts, but its width depends on them.
  const probeName = await text('probe', CY - 20, 'Alex Rivera', 46, 700, rgba('#f4f1ea'), -0.5);
  const probeRole = await text('probe', CY + 28, 'MOTION DESIGNER  /  FLASHFX', 20, 600, rgba('#9aa3b2'), 3);
  await mcp.action('editor.removeLayers', { ids: [probeName.id, probeRole.id] });
  const W = Math.round(TX - L + Math.max(probeName.width, probeRole.width) + 56);
  const makeTexts = async () => {
  const nameT = await text('Name', CY - 20, 'Alex Rivera', 46, 700, rgba('#f4f1ea'), -0.5);
  const roleT = await text('Role', CY + 28, 'MOTION DESIGNER  /  FLASHFX', 20, 600, rgba('#9aa3b2'), 3);
  const nameId = nameT.id;
  const roleId = roleT.id;
  await mcp.actions([
    { actionId: 'agent.applyTextAnimatorPreset', args: { layerId: nameId, presetId: 'rise-fade-word', startFrame: 24, durationFrames: 18, replace: true } },
    { actionId: 'agent.applyTextAnimatorPreset', args: { layerId: roleId, presetId: 'fade-in', startFrame: 32, durationFrames: 20, replace: true } },
  ]);
  return { nameId, roleId };
  };
  // 2. Card: width + x keyframed together on the custom bezier, so it grows from its left edge.
  const card = await shape('Card', L, CY, 0, H, rgba('#0e1016', 0.94));
  await mcp.actions([
    { actionId: 'editor.updateLayerProperty', args: { layerId: card, path: 'shape.borderRadius.defaultValue', value: R } },
    ...keyframes(card, 'shape.width', [[8, 0], [34, W], [116, W], [136, 0]], CARD_IN),
    ...keyframes(card, 'transform.position', [[8, [L, CY]], [34, [L + W / 2, CY]], [116, [L + W / 2, CY]], [136, [L, CY]]], CARD_IN),
    // The exit segment gets its own ease-in (setKeyframeInterpolation targets keyframes by frame).
    { actionId: 'editor.setKeyframeInterpolation', args: [card, [{ propertyPath: 'shape.width', frame: 116 }, { propertyPath: 'shape.width', frame: 136 }, { propertyPath: 'transform.position', frame: 116 }, { propertyPath: 'transform.position', frame: 136 }], 'bezier', [CARD_OUT[2], CARD_OUT[3]], [CARD_OUT[0], CARD_OUT[1]]] },
  ]);

  // 3. Gold accent bar on the card's left edge: shoots up first, collapses last.
  const bar = await shape('Accent bar', L - 14, CY, 8, 0, rgba('#d9a521'));
  await mcp.actions([
    { actionId: 'editor.updateLayerProperty', args: { layerId: bar, path: 'shape.borderRadius.defaultValue', value: 4 } },
    ...keyframes(bar, 'shape.height', [[0, 0], [14, H], [126, H], [142, 0]], EASE.expoOut),
    { actionId: 'editor.setKeyframeInterpolation', args: [bar, [{ propertyPath: 'shape.height', frame: 126 }, { propertyPath: 'shape.height', frame: 142 }], 'bezier', [CARD_OUT[2], CARD_OUT[3]], [CARD_OUT[0], CARD_OUT[1]]] },
  ]);

  // 4. Avatar: a gold circle that pops with a named back-out ease (true overshoot), initials on top.
  const AX = L + 74;
  const av = await mcp.action('editor.addShapeWithDimensions', { shapeType: 'circle', x: AX, y: CY, width: 84, height: 84 });
  const avatar = av.activeLayerId;
  await mcp.actions([
    { actionId: 'editor.renameLayer', args: { id: avatar, name: 'Avatar' } },
    { actionId: 'editor.updateLayerProperty', args: { layerId: avatar, path: 'shape.fillColor', value: rgba('#d9a521') } },
    { actionId: 'editor.updateLayerProperty', args: { layerId: avatar, path: 'shape.strokeWidth.defaultValue', value: 0 } },
    ...keyframes(avatar, 'transform.scale', [[18, [0, 0]], [34, [1, 1]], [112, [1, 1]], [124, [0, 0]]]),
    { actionId: 'editor.setKeyframeEasing', args: [avatar, [{ propertyPath: 'transform.scale', frame: 18 }], 'backOut'] },
    { actionId: 'editor.setKeyframeEasing', args: [avatar, [{ propertyPath: 'transform.scale', frame: 112 }], 'backIn'] },
  ]);
  const initials = await mcp.actions([
    { actionId: 'editor.createQuickText', args: { x: AX, y: CY + 4, text: 'AR' } },
    { actionId: 'editor.renameLayer', args: { id: '$0.result', name: 'Initials' } },
    { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.result', path: 'animOverrides.fontSize.defaultValue', value: 34 } },
    { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.result', path: 'content.spans.0.style.fontSize', value: 34 } },
    { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.result', path: 'content.spans.0.style.fontWeight', value: 800 } },
    { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.result', path: 'content.spans.0.style.color', value: rgba('#0e1016') } },
  ]);
  // Parent the initials to the avatar so they pop with it (one transform drives both).
  await mcp.action('editor.setLayerParent', { childId: initials[0].result, parentId: avatar });
  // Friction: setLayerParent keeps the child's LOCAL position (After Effects keeps the world position),
  // so the child's position now reads as an offset from the parent. Re-centre it on the avatar.
  await mcp.action('editor.updateLayerProperty', { layerId: initials[0].result, path: 'transform.position.defaultValue', value: [0, 4] });

  // The texts sit inside the card: clip them to the card's final box so nothing spills during the exit.
  const { nameId, roleId } = await makeTexts();
  for (const id of [nameId, roleId]) {
    await mcp.action('editor.addMask', { layerId: id, type: 'rectangle' });
    const layer = (await mcp.call('get_layer', { layerId: id })).result;
    const maskId = layer.masks[layer.masks.length - 1].id;
    await mcp.actions([
      { actionId: 'editor.updateMaskProperty', args: { layerId: id, maskId, path: 'position.defaultValue', value: [L + W / 2, CY] } },
      { actionId: 'editor.updateMaskProperty', args: { layerId: id, maskId, path: 'size.defaultValue', value: [W, H] } },
      // Exit: slide left and fade with the card.
      ...keyframes(id, 'transform.opacity', [[110, 1], [124, 0]], EASE.cubicInOut),
    ]);
  }

  // 5. Progress line along the bottom of the card (linear, a "time remaining" detail).
  const line = await shape('Progress', L + 24, CY + H / 2 - 10, 0, 3, rgba('#d9a521', 0.7));
  await mcp.actions([
    ...keyframes(line, 'shape.width', [[34, 0], [112, W - 48]]),
    ...keyframes(line, 'transform.position', [[34, [L + 24, CY + H / 2 - 10]], [112, [L + 24 + (W - 48) / 2, CY + H / 2 - 10]]]),
    ...keyframes(line, 'transform.opacity', [[112, 1], [118, 0]]),
  ]);

  // Friction: new layers default to a 4 s clip (outPoint 120 at 30 fps) whatever the comp length, so
  // in a 5 s comp everything would vanish at frame 120. Stretch every layer to the full comp.
  const st = await mcp.call('get_state');
  await mcp.actions(st.layers.map((l) => ({ actionId: 'editor.updateLayerProperty', args: { layerId: l.id, path: 'outPoint', value: DUR } })));

  const shots = {};
  for (const f of [12, 26, 40, 80, 120, 132]) {
    await mcp.call('seek', { frame: f });
    shots[f] = (await mcp.call('screenshot', { path: join(outDir, `${NAME}-f${f}.png`), region: 'canvas', inline: false })).path;
  }
  const project = await mcp.call('export_project', { path: join(outDir, `${NAME}.ffx`) });
  const video = exportVideo ? await mcp.call('export_mp4', { path: join(outDir, `${NAME}.mp4`), width: 1920, height: 1080 }, { timeoutMs: 1800000 }) : null;
  return { shots, project: project.result, video: video?.result, layers: (await mcp.call('get_state')).layers.length };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const outDir = resolve(process.argv[2] ?? 'mcp-audit-out');
  mkdirSync(outDir, { recursive: true });
  const mcp = await connectFlashFx();
  const t0 = Date.now();
  try {
    const r = await build(mcp, outDir, { exportVideo: process.env.NO_EXPORT !== '1' });
    console.log(JSON.stringify({ ok: true, ms: Date.now() - t0, ...r }, null, 2));
  } catch (e) {
    console.error('BUILD FAILED:', e.message);
    process.exitCode = 1;
  } finally {
    console.log(JSON.stringify(mcp.calls.filter((c) => !c.ok || c.ms > 2000), null, 1));
    await mcp.close();
  }
}
