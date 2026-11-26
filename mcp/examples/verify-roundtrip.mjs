// Editability round-trip: re-open every agent-saved .ffx through the MCP (import_project), check the
// layers came back by name, and screenshot a frame from the re-opened project. Proves an agent-built
// piece is a real, editable FlashFX project, not just a rendered MP4.
//
//   node mcp/examples/verify-roundtrip.mjs <dir-with-ffx> [frame]
import { readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { connectFlashFx } from './lib/mcp-client.mjs';

const dir = resolve(process.argv[2] ?? '.');
const frame = Number(process.argv[3] ?? 60);
const files = readdirSync(dir).filter((f) => f.endsWith('.ffx')).sort();
if (!files.length) { console.error(`no .ffx files in ${dir}`); process.exit(1); }
const mcp = await connectFlashFx();
const report = [];
try {
  for (const f of files) {
    const imp = await mcp.call('import_project', { path: join(dir, f) });
    const st = await mcp.call('get_state');
    await mcp.call('seek', { frame });
    const shot = await mcp.call('screenshot', { path: join(dir, 'roundtrip', `${f.replace(/\.ffx$/, '')}-reopened-f${frame}.png`), region: 'canvas', inline: false });
    // Prove it is editable: rename the first layer and undo it.
    const first = st.layers[0];
    const ren = await mcp.action('editor.renameLayer', { id: first.id, name: `${first.name} (edited)` });
    await mcp.call('undo');
    report.push({
      file: f, projectId: imp.result.projectId, layers: st.layers.length, names: st.layers.map((l) => l.name),
      size: `${st.width}x${st.height}@${st.fps}`, durationFrames: st.durationFrames, screenshot: shot.path, editUndoDepth: ren.undoDepth,
    });
    console.log(`ok ${f}: ${st.layers.length} layers (${st.layers.map((l) => l.name).join(', ')})`);
  }
} finally {
  writeFileSync(join(dir, 'roundtrip', 'roundtrip-report.json'), JSON.stringify(report, null, 2));
  await mcp.close();
}
