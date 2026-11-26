// Diagnostic: is the imported mark's colour shift (amber -> lemon) caused by the glow or by the import?
// Re-opens the logo-reveal .ffx, screenshots frame 110 with the glow on, then off.
//   node mcp/examples/diag-logo-color.mjs <c-logo-reveal.ffx> <outDir>
import { join, resolve } from 'node:path';
import { connectFlashFx } from './lib/mcp-client.mjs';

const ffx = resolve(process.argv[2]);
const outDir = resolve(process.argv[3] ?? '.');
const mcp = await connectFlashFx();
try {
  await mcp.call('import_project', { path: ffx });
  const st = await mcp.call('get_state');
  const logo = st.layers.find((l) => l.name === 'FlashFX mark');
  await mcp.call('seek', { frame: 110 });
  console.log((await mcp.call('screenshot', { path: join(outDir, 'logo-glow-on.png'), region: 'canvas', inline: false })).path);
  await mcp.action('editor.updateLayerProperty', { layerId: logo.id, path: 'glow.enabled', value: false });
  await mcp.call('seek', { frame: 110 });
  console.log((await mcp.call('screenshot', { path: join(outDir, 'logo-glow-off.png'), region: 'canvas', inline: false })).path);
} finally {
  await mcp.close();
}
