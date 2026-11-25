// MCP build (c): a logo reveal with the FlashFX mark. The mark (public/flashfx-mark.svg, imported
// through the new import_image tool) spins in on a named back ease with a gold glow, lands on a
// spark burst (particles via the new agent.configureParticles) and a shockwave ring, then slides
// left while the wordmark is revealed from behind it through a mask, and the tagline blurs in.
// Built ONLY through the FlashFX MCP server tools.
//
//   node mcp/examples/build-c-logo-reveal.mjs <outDir>
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { connectFlashFx, keyframes, rgba, EASE, REPO_ROOT } from './lib/mcp-client.mjs';

export const NAME = 'c-logo-reveal';

export async function build(mcp, outDir, { exportVideo = true } = {}) {
  const FPS = 30;
  const DUR = 120; // 4 s
  const CX = 960;
  const CY = 500;
  await mcp.call('create_project', { name: 'MCP audit (c) logo reveal', format: 'long', frameRate: FPS, durationFrames: DUR });

  // Background: a soft radial vignette, lighter behind the mark.
  const bg = await mcp.action('editor.addBackgroundLayer', []);
  await mcp.action('editor.updateBackgroundLayer', {
    id: bg.result,
    updates: { type: 'radial', centerX: 0.5, centerY: 0.46, radius: 0.75, stops: [{ color: [0.09, 0.1, 0.13], position: 0, opacity: 1 }, { color: [0.015, 0.016, 0.02], position: 1, opacity: 1 }] },
  });

  // Wordmark first (measured, so the logo + wordmark group can be centred), created early so it
  // stacks BELOW the mark and slides out from behind it.
  const WORD_SIZE = 150;
  const word = await mcp.actions([
    { actionId: 'editor.createQuickText', args: { x: CX, y: CY + 6, text: 'FlashFX' } },
    { actionId: 'editor.renameLayer', args: { id: '$0.result', name: 'Wordmark' } },
    { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.result', path: 'animOverrides.fontSize.defaultValue', value: WORD_SIZE } },
    { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.result', path: 'content.spans.0.style.fontSize', value: WORD_SIZE } },
    { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.result', path: 'content.spans.0.style.fontWeight', value: 800 } },
    { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.result', path: 'animOverrides.letterSpacing.defaultValue', value: -4 } },
    { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.result', path: 'content.spans.0.style.color', value: rgba('#f4f1ea') } },
    { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.result', path: 'motionBlur', value: true } },
  ]);
  const wordId = word[0].result;
  // "FX" in brand gold (characters 5..7).
  await mcp.action('editor.styleTextRange', { layerId: wordId, start: 5, end: 7, style: { color: rgba('#d9a521') } });
  const wm = (await mcp.call('measure_text', { layerId: wordId, frame: 0 })).result;

  const LOGO = 260; // on-screen size of the mark (px)
  const GAP = 44;
  const groupW = LOGO + GAP + wm.ink.width;
  const logoEndX = CX - groupW / 2 + LOGO / 2;
  const wordEndX = logoEndX + LOGO / 2 + GAP + wm.ink.width / 2;
  const maskLeft = logoEndX + LOGO / 2 + 6;
  const wordStartX = maskLeft - wm.ink.width / 2 - 12; // starts fully left of the mask edge (hidden)
  await mcp.actions([
    ...keyframes(wordId, 'transform.position', [[44, [wordStartX, CY + 6]], [66, [wordEndX, CY + 6]]], EASE.expoOut),
  ]);
  // The mask is the area right of the mark's final right edge, so the word appears to come out of it.
  await mcp.action('editor.addMask', { layerId: wordId, type: 'rectangle' });
  const wl = (await mcp.call('get_layer', { layerId: wordId })).result;
  const wMask = wl.masks[wl.masks.length - 1].id;
  await mcp.actions([
    { actionId: 'editor.updateMaskProperty', args: { layerId: wordId, maskId: wMask, path: 'position.defaultValue', value: [(maskLeft + 1900) / 2, CY] } },
    { actionId: 'editor.updateMaskProperty', args: { layerId: wordId, maskId: wMask, path: 'size.defaultValue', value: [1900 - maskLeft, 300] } },
  ]);

  // Shockwave ring: an unfilled gold circle that expands and thins out on the landing.
  const ring = await mcp.action('editor.addShapeWithDimensions', { shapeType: 'circle', x: CX, y: CY, width: 200, height: 200 });
  const ringId = ring.activeLayerId;
  await mcp.actions([
    { actionId: 'editor.renameLayer', args: { id: ringId, name: 'Shockwave' } },
    { actionId: 'editor.updateLayerProperty', args: { layerId: ringId, path: 'shape.fillColor', value: [0, 0, 0, 0] } },
    { actionId: 'editor.updateLayerProperty', args: { layerId: ringId, path: 'shape.strokeColor', value: rgba('#ffc83d') } },
    ...keyframes(ringId, 'shape.radius', [[18, 120], [44, 520]], EASE.expoOut),
    ...keyframes(ringId, 'shape.strokeWidth', [[18, 10], [44, 0]], EASE.expoOut),
    ...keyframes(ringId, 'transform.opacity', [[0, 0], [18, 1], [44, 0]]),
    { actionId: 'editor.setKeyframeInterpolation', args: [ringId, [{ propertyPath: 'transform.opacity', frame: 0 }], 'hold'] },
  ]);

  // Spark burst on the landing: a particle layer that starts at frame 18 (bursts fire at the
  // layer's first frame), sparks preset reshaped into one radial gold burst.
  const p = await mcp.action('editor.addParticleLayer', []);
  const partId = p.activeLayerId;
  await mcp.actions([
    { actionId: 'editor.renameLayer', args: { id: partId, name: 'Spark burst' } },
    { actionId: 'editor.updateLayerProperty', args: { layerId: partId, path: 'transform.position.defaultValue', value: [CX, CY] } },
    { actionId: 'agent.configureParticles', args: { layerId: partId, presetId: 'sparks', seed: 7, overrides: {
      spawnRate: 0, burstCount: 140, burstRepeat: false, emitterShape: 'circle', emitterRadius: 110,
      initialSpeed: { min: 260, max: 780 }, initialAngle: { min: 0, max: 360 }, initialSize: { min: 3, max: 8 },
      lifetime: { min: 0.35, max: 0.9 }, gravity: [0, 120], drag: 2.2,
      colorOverLife: [{ t: 0, color: [1, 0.95, 0.75, 1] }, { t: 0.35, color: [1, 0.78, 0.24, 1] }, { t: 1, color: [0.85, 0.45, 0.05, 0] }],
    } } },
    { actionId: 'editor.moveClipInTime', args: { layerId: partId, newInPoint: 18 } },
  ]);

  // The mark: import the SVG once (rasterized at 1024 px). Two layers share the asset: a glow-only copy
  // BEHIND and the clean mark on top. (A glow on the mark itself adds light onto the artwork and shifts
  // the amber to lemon; measured in docs/MCP-AUDIT.md.) Both spin + scale in on the same eases.
  const imp = await mcp.call('import_image', { path: join(REPO_ROOT, 'public/flashfx-mark.svg'), rasterSize: 1024, x: CX, y: CY });
  const glowId = imp.activeLayerId;
  const placed = await mcp.action('editor.addImageFromAsset', { assetId: imp.result.assetId, x: CX, y: CY });
  const logoId = placed.activeLayerId;
  const S = LOGO / imp.result.width;
  const motion = (id) => [
    { actionId: 'editor.updateLayerProperty', args: { layerId: id, path: 'motionBlur', value: true } },
    ...keyframes(id, 'transform.scale', [[4, [0, 0]], [18, [S * 1.12, S * 1.12]], [28, [S, S]]]),
    { actionId: 'editor.setKeyframeEasing', args: [id, [{ propertyPath: 'transform.scale', frame: 4 }], 'expoOut'] },
    { actionId: 'editor.setKeyframeEasing', args: [id, [{ propertyPath: 'transform.scale', frame: 18 }], 'quadInOut'] },
    ...keyframes(id, 'transform.rotation', [[4, -120], [22, 0]], EASE.expoOut),
    ...keyframes(id, 'transform.position', [[40, [CX, CY]], [62, [logoEndX, CY]]], EASE.expoInOut),
  ];
  await mcp.actions([
    { actionId: 'editor.renameLayer', args: { id: glowId, name: 'FlashFX mark glow' } },
    ...motion(glowId),
    { actionId: 'editor.enableLayerEffect', args: { layerId: glowId, kind: 'glow' } },
    { actionId: 'editor.updateLayerProperty', args: { layerId: glowId, path: 'glow.onlyGlow', value: true } },
    { actionId: 'editor.updateLayerProperty', args: { layerId: glowId, path: 'glow.color', value: rgba('#ffb300') } },
    { actionId: 'editor.updateLayerProperty', args: { layerId: glowId, path: 'glow.radius', value: 56 } },
    { actionId: 'editor.updateLayerProperty', args: { layerId: glowId, path: 'glow.intensity', value: 1.1 } },
    { actionId: 'editor.updateLayerProperty', args: { layerId: glowId, path: 'glow.threshold', value: 0.1 } },
    { actionId: 'editor.renameLayer', args: { id: logoId, name: 'FlashFX mark' } },
    ...motion(logoId),
  ]);

  // Tagline: blurs in by character under the lock-up.
  const tag = await mcp.actions([
    { actionId: 'editor.createQuickText', args: { x: CX, y: CY + 190, text: 'The AI After Effects of the browser' } },
    { actionId: 'editor.renameLayer', args: { id: '$0.result', name: 'Tagline' } },
    { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.result', path: 'animOverrides.fontSize.defaultValue', value: 40 } },
    { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.result', path: 'content.spans.0.style.fontSize', value: 40 } },
    { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.result', path: 'content.spans.0.style.fontWeight', value: 400 } },
    { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.result', path: 'animOverrides.letterSpacing.defaultValue', value: 1 } },
    { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.result', path: 'content.spans.0.style.color', value: rgba('#a7a39a') } },
    { actionId: 'agent.applyTextAnimatorPreset', args: { layerId: '$0.result', presetId: 'blur-in', startFrame: 64, durationFrames: 30, replace: true } },
  ]);
  // Friction: range-selector reveal presets (type-on, blur-in) show the first glyph before their start
  // frame. Hold the tagline invisible until the reveal starts.
  await mcp.actions([
    ...keyframes(tag[0].result, 'transform.opacity', [[0, 0], [64, 1]]),
    { actionId: 'editor.setKeyframeInterpolation', args: [tag[0].result, [{ propertyPath: 'transform.opacity', frame: 0 }], 'hold'] },
  ]);

  // Every layer lives for the whole comp (new layers default to 4 s; this comp is 4 s, but be explicit).
  const st = await mcp.call('get_state');
  await mcp.actions(st.layers.filter((l) => l.id !== partId).map((l) => ({ actionId: 'editor.updateLayerProperty', args: { layerId: l.id, path: 'outPoint', value: DUR } })));
  await mcp.action('editor.updateLayerProperty', { layerId: partId, path: 'outPoint', value: DUR });

  const shots = {};
  for (const f of [8, 18, 24, 34, 52, 70, 110]) {
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
