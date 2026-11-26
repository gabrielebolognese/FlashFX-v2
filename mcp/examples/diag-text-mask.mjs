// Diagnostic: does a layer mask clip a text layer, with and without a text animator / motion blur?
// Three identical texts, each with a rectangle mask covering only its LEFT half.
//   node mcp/examples/diag-text-mask.mjs <outDir>
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { connectFlashFx } from './lib/mcp-client.mjs';

const outDir = resolve(process.argv[2] ?? 'diag-out');
mkdirSync(outDir, { recursive: true });
const mcp = await connectFlashFx();
try {
  await mcp.call('create_project', { name: 'diag text mask', format: 'long', durationFrames: 60 });
  const rows = [
    { y: 250, label: 'PLAIN TEXT MASK', anim: false, mb: false },
    { y: 540, label: 'ANIMATOR TEXT MASK', anim: true, mb: false },
    { y: 830, label: 'ANIMATOR MB TEXT MASK', anim: true, mb: true },
  ];
  for (const r of rows) {
    const res = await mcp.actions([
      { actionId: 'editor.createQuickText', args: { x: 960, y: r.y, text: r.label } },
      { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.result', path: 'animOverrides.fontSize.defaultValue', value: 110 } },
      { actionId: 'editor.updateLayerProperty', args: { layerId: '$0.result', path: 'content.spans.0.style.fontSize', value: 110 } },
      { actionId: 'editor.addMask', args: { layerId: '$0.result', type: 'rectangle' } },
    ]);
    const id = res[0].result;
    if (r.anim) await mcp.action('agent.applyTextAnimatorPreset', { layerId: id, presetId: 'rise-fade-word', startFrame: 0, durationFrames: 10 });
    if (r.mb) await mcp.action('editor.updateLayerProperty', { layerId: id, path: 'motionBlur', value: true });
    const layer = (await mcp.call('get_layer', { layerId: id })).result;
    const maskId = layer.masks[0].id;
    // Left half of the frame only, the row's band.
    await mcp.actions([
      { actionId: 'editor.updateMaskProperty', args: { layerId: id, maskId, path: 'position.defaultValue', value: [480, r.y] } },
      { actionId: 'editor.updateMaskProperty', args: { layerId: id, maskId, path: 'size.defaultValue', value: [960, 400] } },
    ]);
  }
  await mcp.action('editor.deselectAll', []);
  // The first frames after create_project can be black while the preview warms up: retry.
  for (let i = 0; i < 5; i++) {
    const t0 = Date.now();
    await mcp.call('seek', { frame: 30 + i });
    const s = await mcp.call('screenshot', { path: join(outDir, `diag-text-mask-${i}.png`), region: 'canvas', inline: false });
    console.log(i, Date.now() - t0, 'ms', s.path);
  }
} finally {
  await mcp.close();
}
