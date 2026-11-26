// Probe: what do the add* actions actually create? Dumps the full layer JSON (via the get_layer
// tool) of each layer type a build is likely to use, so an author can see real property paths and
// defaults instead of guessing.   node mcp/examples/probe-defaults.mjs [out.json]
import { writeFileSync } from 'node:fs';
import { connectFlashFx } from './lib/mcp-client.mjs';

const out = process.argv[2] ?? 'probe-defaults.json';
const mcp = await connectFlashFx();
const dump = {};
try {
  await mcp.call('create_project', { name: 'Probe', format: 'long', durationFrames: 90 });
  const add = async (key, actionId, args) => {
    const r = await mcp.action(actionId, args);
    const id = r.activeLayerId;
    dump[key] = { action: actionId, result: r.result, layer: (await mcp.call('get_layer', { layerId: id })).result };
    return id;
  };
  const text = await add('text', 'editor.addText', { content: 'Probe' });
  await add('quickText', 'editor.createQuickText', { x: 300, y: 200, text: 'Quick' });
  const rect = await add('rect', 'editor.addShapeWithDimensions', { shapeType: 'rectangle', x: 960, y: 540, width: 400, height: 200 });
  await add('polygon', 'editor.addShapeWithDimensions', { shapeType: 'polygon', x: 960, y: 540, width: 200, height: 200 });
  await add('particles', 'editor.addParticleLayer', []);
  await mcp.action('editor.addMask', { layerId: text, type: 'rectangle' });
  await mcp.action('editor.enableLayerEffect', { layerId: rect, kind: 'glow' });
  await mcp.action('editor.updateLayerProperty', { layerId: text, path: 'motionBlur', value: true });
  dump.textAfterMaskAndMotionBlur = (await mcp.call('get_layer', { layerId: text })).result;
  dump.rectAfterGlow = (await mcp.call('get_layer', { layerId: rect })).result;
  dump.state = await mcp.call('get_state');
  dump.compactManifestAreas = (await mcp.call('list_features', { compact: true })).areas;
} finally {
  writeFileSync(out, JSON.stringify(dump, null, 2));
  console.log(JSON.stringify(mcp.calls.map((c) => `${c.name} ${c.ms}ms ${c.ok ? 'ok' : `ERR ${c.error}`}`), null, 1));
  await mcp.close();
}
