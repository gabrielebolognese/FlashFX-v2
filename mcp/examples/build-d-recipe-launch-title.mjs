// MCP build (d): an 8 s square launch title built ONLY from recipes, following the flashfx-motion skill
// (mcp/skill/flashfx-motion/SKILL.md): create_project, list_recipes, apply_recipe (no hand keyframes),
// render_strip checks, export_project + export_mp4, then a reload check. Logged to <outDir>/build-log.json.
//
//   node mcp/examples/build-d-recipe-launch-title.mjs <outDir> [round]   (round = build + strips only)
// Brief: "8 s launch title 'FlashFX MCP early access', in the references' style".
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { connectFlashFx } from './lib/mcp-client.mjs';

const HERE = resolve(process.argv[2] ?? 'recipe-launch-title-out');
mkdirSync(HERE, { recursive: true });
const ROUND = process.argv[3] === 'round';
const STRIPS = join(HERE, 'strips');
mkdirSync(STRIPS, { recursive: true });

const W = 1080, H = 1080, FPS = 60, DUR = 480;
const ACCENT = '#2f6bff', INK = '#0b0b0d', GROUND = '#e4e6e3', QUIET = '#5c5f66';

const mcp = await connectFlashFx({ server: process.env.FLASHFX_SERVER ?? 'auto' });
const log = [];
const recipe = async (id, params, startFrame, endFrame, parentId) => {
  const args = { id, params, startFrame, ...(endFrame !== undefined ? { endFrame } : {}), ...(parentId ? { parentId } : {}) };
  const r = await mcp.call('apply_recipe', args);
  log.push({ call: 'apply_recipe', args, start: r.start, end: r.end, layers: r.layers.map((l) => l.name ?? l.id), returns: r.returns, checkFrames: r.checkFrames });
  console.log(`${id} ${r.start}-${r.end}`, JSON.stringify(r.returns));
  return r;
};
const strip = async (name, frames, cols = 5) => {
  const r = await mcp.call('render_strip', { frames, path: join(STRIPS, `${name}.png`), inline: false, tileWidth: 300, columns: cols });
  log.push({ call: 'render_strip', name, frames, path: r.path });
  return r.path;
};

try {
  // 1. Rules and menu
  const menu = await mcp.call('list_recipes', {});
  log.push({ call: 'list_recipes', count: menu.count, ids: menu.recipes.map((r) => r.id) });

  // 3. Build (plan: SKILL.md worked example)
  await mcp.call('create_project', { name: 'FlashFX MCP early access (taste proof)', format: 'short', frameRate: FPS, durationFrames: DUR, clipLength: 'comp' });
  await mcp.call('run_action', { actionId: 'editor.setCompositionSize', args: { width: W, height: H } });
  log.push({ call: 'create_project + setCompositionSize', comp: `${W}x${H}@${FPS} ${DUR}f` });

  // Shot 1 (0-166): Claude is asked for the piece
  await recipe('background', { style: 'solid', color: GROUND }, 0);
  const cam = await recipe('scene-camera', { mode: 'push', to: 1.05, name: 'Shot 1 camera' }, 0, 166);
  const bar = await recipe('prompt-bar', { query: 'a launch title for FlashFX MCP', placeholder: 'Ask FlashFX anything', accent: ACCENT, cps: 28, press: 10, name: 'Prompt bar' }, 0, 166, cam.returns.cameraId);
  // the bar rides a 1.05 push: aim the cursor at where the send button is at the press frame
  const k = 1 + 0.05 * (bar.returns.pressFrame / 166);
  const sx = Math.round(540 + (bar.returns.sendX - 540) * k), sy = Math.round(540 + (bar.returns.sendY - 540) * k);
  await recipe('cursor-click', { x: sx, y: sy, clickAt: bar.returns.pressFrame, name: 'Cursor' }, bar.returns.pressFrame - 34, 166);
  if (ROUND) await strip('shot1', [4, 16, 30, 50, 75, 100, 125, 140, 146, 160]);

  // Shot 2 (166-330): the title answers. Exits cascade (pop 318, subtitle 322, bar 326, title 330).
  const cam2 = await recipe('scene-camera', { mode: 'push', to: 1.04, name: 'Shot 2 camera' }, 166, 330);
  const C2 = cam2.returns.cameraId;
  const title = await recipe('kinetic-title', { text: 'FlashFX MCP', accentWord: 1, accentColor: ACCENT, color: INK, size: 132, y: 440, delay: 2, name: 'Title' }, 168, 330, C2);
  const S = 132;
  await recipe('underline-draw', { y: Math.round(title.returns.inkBottom + S * 0.08), width: Math.round(title.returns.inkWidth * 0.36), color: ACCENT, delay: 6, name: 'Title underline' }, 186, 326, C2);
  await recipe('blur-in-text', { text: 'Claude builds it. FlashFX renders it.', y: 602, color: QUIET, size: 38, name: 'Subtitle' }, 202, 322, C2);
  await recipe('pop-in', { label: 'EARLY ACCESS', y: 704, fill: INK, labelColor: '#ffffff', labelSize: 26, tracking: 120, name: 'Early access badge' }, 228, 318, C2);

  // Shot 3 (330-480): sign-off
  await recipe('end-card', { wordmark: 'FlashFX', tagline: 'editor.flashfx.app', color: INK, glowPeak: 0.35, name: 'End card' }, 330, DUR);

  // Transition last (on top): wipe up, cut at 166
  const tr = await recipe('transition', { style: 'wipe-up', color: INK, color2: ACCENT, frames: 16 }, 150);
  log.push({ note: `cut frame ${tr.returns.cutFrame}` });

  // 4. Check the frames
  await strip('shot1', [4, 16, 30, 50, 75, 100, 125, 140, 146, 160]);
  await strip('shot2', [168, 176, 184, 196, 214, 240, 262, 300, 316, 326]);
  await strip('shot3', [330, 334, 340, 348, 360, 372, 392, 420, 450, 479]);
  await strip('overview', [10, 60, 120, 150, 158, 166, 190, 240, 300, 324, 340, 360, 400, 440, 479], 5);

  if (!ROUND) {
    // 5. Export and save
    const ffx = await mcp.call('export_project', { path: join(HERE, 'project.ffx') });
    const mp4 = await mcp.call('export_mp4', { path: join(HERE, 'fresh-prompt.mp4'), width: W, height: H, frameRate: FPS, bitrate: 12000000, includeAudio: false }, { timeoutMs: 1800000 });
    await mcp.call('save_project', {});
    const before = await mcp.call('get_state');
    log.push({ call: 'export', ffx: ffx.result ?? ffx, mp4: mp4.result ?? mp4 });
    // Reload proof: open the .ffx as a new project and compare layer names + one rendered frame.
    await mcp.call('render_frame', { frame: 240, path: join(STRIPS, 'f240-before-reload.png'), inline: false });
    await mcp.call('import_project', { path: join(HERE, 'project.ffx') });
    const after = await mcp.call('get_state');
    await mcp.call('render_frame', { frame: 240, path: join(STRIPS, 'f240-after-reload.png'), inline: false });
    const { readFileSync } = await import('node:fs');
    const same = readFileSync(join(STRIPS, 'f240-before-reload.png')).equals(readFileSync(join(STRIPS, 'f240-after-reload.png')));
    log.push({ reload: { layersBefore: before.layers.length, layersAfter: after.layers.length, names: after.layers.map((l) => l.name), renderIdentical: same } });
    console.log('reload', before.layers.length, after.layers.length, 'identical render', same);
  }
} catch (e) {
  console.error('BUILD FAILED', e.message);
  process.exitCode = 1;
} finally {
  const tools = {};
  for (const c of mcp.calls) tools[c.name] = (tools[c.name] ?? 0) + 1;
  writeFileSync(join(HERE, 'build-log.json'), JSON.stringify({ toolCounts: tools, failed: mcp.calls.filter((c) => !c.ok), log }, null, 1));
  console.log('tool calls', JSON.stringify(tools));
  await mcp.close();
}
