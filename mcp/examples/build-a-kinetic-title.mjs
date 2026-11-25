// MCP build (a): a clean kinetic title. Two lines whose words rise out of a mask with a per-word
// stagger and motion blur, an accent word in brand gold, a gold underline that draws on with an
// expo ease, a small caption that types on, then both lines exit upward through the same masks.
// Built ONLY through the FlashFX MCP server tools (create_project, run_actions, get_layer,
// screenshot, export_mp4, export_project).
//
//   node mcp/examples/build-a-kinetic-title.mjs <outDir>
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { connectFlashFx, keyframes, rgba, EASE } from './lib/mcp-client.mjs';

export const NAME = 'a-kinetic-title';

export async function build(mcp, outDir, { exportVideo = true } = {}) {
  const FPS = 30;
  const DUR = 120; // 4 s
  await mcp.call('create_project', { name: 'MCP audit (a) kinetic title', format: 'long', frameRate: FPS, durationFrames: DUR });

  // Background: one solid near-black layer (the comp background stack, not settings.backgroundColor).
  const bg = await mcp.action('editor.addBackgroundLayer', []);
  await mcp.action('editor.updateBackgroundLayer', {
    id: bg.result,
    updates: { type: 'solid', stops: [{ color: [0.035, 0.035, 0.045], position: 0, opacity: 1 }, { color: [0.035, 0.035, 0.045], position: 1, opacity: 1 }] },
  });

  const FONT = 128;
  const LINE_H = Math.round(FONT * 1.2);
  // createQuickText's y is the centre of the line box; all-caps glyphs at 128 px span about
  // y-87 (cap top) .. y+14 (baseline), measured from screenshots (there is no measure-text tool yet).
  const CAP_TOP = -87;
  const BASELINE = 14;
  const lines = [
    { text: 'BUILT BY CLAUDE', y: 430, start: 6 },
    { text: 'RENDERED IN FLASHFX', y: 580, start: 16 },
  ];
  const ids = [];
  for (const line of lines) {
    const r = await mcp.actions([
      { actionId: 'editor.createQuickText', args: { x: 960, y: line.y, text: line.text } },
      { actionId: 'editor.renameLayer', args: { id: '$0.result', name: `Title line ${ids.length + 1}` } },
      { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.result', path: 'animOverrides.fontSize.defaultValue', value: FONT } },
      { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.result', path: 'content.spans.0.style.fontSize', value: FONT } },
      { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.result', path: 'content.spans.0.style.fontWeight', value: 800 } },
      { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.result', path: 'animOverrides.letterSpacing.defaultValue', value: -2 } },
      { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.result', path: 'content.spans.0.style.color', value: rgba('#f4f1ea') } },
      { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.result', path: 'motionBlur', value: true } },
    ]);
    ids.push(r[0].result);
  }

  // Accent word in brand gold (#d9a521), italic serif feel on the word FLASHFX.
  await mcp.action('editor.styleTextWord', { layerId: ids[1], wordIndex: 2, style: { color: rgba('#d9a521'), fontStyle: 'italic' } });

  // Words rise from below: start from the rise-fade-word preset (range selector by word), then make
  // it a pure mask reveal (no fade) with a longer travel and an expo ease on the reveal offset.
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const start = lines[i].start;
    await mcp.actions([
      { actionId: 'agent.applyTextAnimatorPreset', args: { layerId: id, presetId: 'rise-fade-word', startFrame: start, durationFrames: 26, replace: true } },
      { actionId: 'editor.updateLayerProperty', args: { layerId: id, path: 'animators.0.delta', value: { position: [0, LINE_H + 20] } } },
      { actionId: 'editor.updateLayerProperty', args: { layerId: id, path: 'animators.0.selector.easeHigh', value: 1 } },
      { actionId: 'editor.setKeyframeInterpolation', args: [id, [{ propertyPath: 'animators.0.offset', frame: start }, { propertyPath: 'animators.0.offset', frame: start + 26 }], 'bezier', [EASE.quintOut[2], EASE.quintOut[3]], [EASE.quintOut[0], EASE.quintOut[1]]] },
    ]);
  }

  // One rectangle mask per line around the cap box (masks are composition-space), so the words are
  // clipped while they travel. A single mask in mode "add" = show only inside it.
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const top = lines[i].y;
    await mcp.action('editor.addMask', { layerId: id, type: 'rectangle' });
    const layer = (await mcp.call('get_layer', { layerId: id })).result;
    const maskId = layer.masks[layer.masks.length - 1].id;
    const m0 = top + CAP_TOP - 24;
    const m1 = top + BASELINE + 22;
    await mcp.actions([
      { actionId: 'editor.updateMaskProperty', args: { layerId: id, maskId, path: 'position.defaultValue', value: [960, (m0 + m1) / 2] } },
      { actionId: 'editor.updateMaskProperty', args: { layerId: id, maskId, path: 'size.defaultValue', value: [1840, m1 - m0] } },
    ]);
    // Exit: the line slides up through its fixed mask (expo in), staggered.
    const exitStart = 88 + i * 4;
    await mcp.actions(keyframes(id, 'transform.position', [[exitStart, [960, top]], [exitStart + 18, [960, top - LINE_H - 20]]], EASE.quartIn));
  }

  // Gold underline: a 6 px bar that draws on from the left (width + x keyframed with the same expo
  // ease so it grows from its left edge), then retracts to the right before the exit.
  const barY = lines[1].y + 74;
  const barW = 520;
  const bar = await mcp.action('editor.addShapeWithDimensions', { shapeType: 'rectangle', x: 960 - barW / 2, y: barY, width: 2, height: 6 });
  const barId = bar.activeLayerId;
  await mcp.actions([
    { actionId: 'editor.renameLayer', args: { id: barId, name: 'Underline' } },
    { actionId: 'editor.updateLayerProperty', args: { layerId: barId, path: 'shape.fillColor', value: rgba('#d9a521') } },
    { actionId: 'editor.updateLayerProperty', args: { layerId: barId, path: 'shape.strokeWidth.defaultValue', value: 0 } },
    { actionId: 'editor.updateLayerProperty', args: { layerId: barId, path: 'shape.borderRadius.defaultValue', value: 3 } },
    ...keyframes(barId, 'shape.width', [[30, 0], [52, barW], [84, barW], [98, 0]], EASE.expoOut),
    ...keyframes(barId, 'transform.position', [[30, [960 - barW / 2, barY]], [52, [960, barY]], [84, [960, barY]], [98, [960 + barW / 2, barY]]], EASE.expoOut),
  ]);

  // Caption that types on under the bar.
  const cap = await mcp.actions([
    { actionId: 'editor.createQuickText', args: { x: 960, y: barY + 46, text: 'ONE PROMPT. FULLY EDITABLE.' } },
    { actionId: 'editor.renameLayer', args: { id: '$0.result', name: 'Caption' } },
    { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.result', path: 'animOverrides.fontSize.defaultValue', value: 30 } },
    { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.result', path: 'content.spans.0.style.fontSize', value: 30 } },
    { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.result', path: 'content.spans.0.style.fontWeight', value: 500 } },
    { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.result', path: 'animOverrides.letterSpacing.defaultValue', value: 6 } },
    { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.result', path: 'content.spans.0.style.color', value: rgba('#9a978f') } },
    { actionId: 'agent.applyTextAnimatorPreset', args: { layerId: '$0.result', presetId: 'type-on', startFrame: 40, durationFrames: 22, replace: true } },
  ]);
  const capId = cap[0].result;
  // Friction: the type-on preset shows the first glyph before its start frame, so hold the caption
  // invisible until the type-on begins (hold keyframe 0 -> 1 at frame 40), then fade it out.
  await mcp.actions([
    ...keyframes(capId, 'transform.opacity', [[0, 0], [40, 1], [86, 1], [96, 0]]),
    { actionId: 'editor.setKeyframeInterpolation', args: [capId, [{ propertyPath: 'transform.opacity', frame: 0 }], 'hold'] },
    { actionId: 'editor.setKeyframeInterpolation', args: [capId, [{ propertyPath: 'transform.opacity', frame: 86 }], 'bezier', [EASE.cubicInOut[2], EASE.cubicInOut[3]], [EASE.cubicInOut[0], EASE.cubicInOut[1]]] },
  ]);

  // Check frames, then render.
  const shots = {};
  for (const f of [10, 22, 60, 104]) {
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
