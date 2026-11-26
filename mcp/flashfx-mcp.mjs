#!/usr/bin/env node
// FlashFX MCP server (stdio). Lets an MCP client (Claude Code, Claude Desktop, any MCP host) drive a
// real FlashFX editor: it starts the app (Vite dev server, the built dist/, or any URL), opens it in
// Chrome with WebGPU (headless, or a headed window for screen recording, or an existing Chrome over
// its debugging port) and maps every tool onto the in-app agent runtime `window.__ffxAgent`
// (src/agent/runtime.ts), i.e. the whitelisted store actions listed in /agent/features.json.
//
// The MCP wire protocol (JSON-RPC 2.0, newline-delimited on stdin/stdout) is implemented here by
// hand so the repo needs no new dependency. stdout carries ONLY protocol messages; logs go to stderr.
//
//   node mcp/flashfx-mcp.mjs [--server dev|dist] [--url URL] [--headed] [--attach PORT]
//                            [--window 1920x1080] [--profile DIR] [--chrome PATH]
// See mcp/README.md.

import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlashFxSession, readConfig } from './lib/session.mjs';
import { loadRecipes, describeRecipe, runRecipe } from './lib/recipes.mjs';

const MCP_DIR = dirname(fileURLToPath(import.meta.url));
const readDoc = (name) => readFileSync(join(MCP_DIR, name), 'utf8');

const SERVER_INFO = { name: 'flashfx', title: 'FlashFX Studio', version: '1.0.0' };
const SUPPORTED_PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const INSTRUCTIONS = [
  'Drives a live FlashFX editor (WebGPU motion-graphics app) through its agent runtime.',
  'Start with list_features to see what exists and the exact action ids + params, then create_project.',
  'Mutate the project with run_action / run_actions (only whitelisted action ids are accepted; undoable ones are one undo step each).',
  'New layers: read activeLayerId from the result of editor.add*. Time is in frames, positions in comp pixels (origin top-left).',
  'In run_actions, a string argument "$N.path" (or "$last.path") is replaced by that value from the Nth earlier result, e.g. "$0.activeLayerId".',
  'Check your work with screenshot (it returns the image) and get_state; export_mp4 renders through the real exporter.',
  'Save the editable project with export_project {path} (a .ffx file the owner can open in FlashFX); import_project {path} re-opens one; import_image {path} brings a PNG/JPEG/WebP/SVG into the project; import_media {path} imports video, audio or images.',
  'For clean, tasteful motion use the recipes: list_recipes, then apply_recipe {id, params, startFrame, endFrame?} (each recipe is a measured house move: kinetic title, prompt bar, pop, wipe, end card...).',
  'Read the taste rules (resource flashfx://taste, or the prompt "taste") before planning a piece: easing, timing, stagger, type scale and colour numbers measured on reference videos.',
  'Authoring guide: resource flashfx://authoring (mcp/AUTHORING.md). Brief-to-video workflow: the prompt "motion-brief".',
].join(' ');

const config = readConfig();
const session = new FlashFxSession(config);

// ---------------------------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------------------------

const text = (value) => ({ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) });
const ok = (value, extra = []) => ({ content: [text(value), ...extra], structuredContent: typeof value === 'object' && value !== null && !Array.isArray(value) ? value : { value } });
const fail = (message) => ({ content: [text(message)], isError: true });

/** An agent run result -> tool result (ok:false becomes an MCP tool error the model can read). */
/** An MCP image block for a written PNG (when asked and under 3 MB). */
function inlinePng(result, inline) {
  if (!inline || !result?.path || result.bytes > 3 * 1024 * 1024) return [];
  return [{ type: 'image', data: readFileSync(result.path).toString('base64'), mimeType: 'image/png' }];
}

function fromRun(r) {
  if (!r) return fail('no result from the page');
  if (r.ok === false) return fail(`${r.actionId}: ${r.error}`);
  return ok(r);
}

const resolveRef = (value, results) => {
  if (typeof value === 'string') {
    const m = /^\$(\d+|last)\.(.+)$/.exec(value);
    if (!m) return value;
    const src = m[1] === 'last' ? results[results.length - 1] : results[Number(m[1])];
    if (!src) throw new Error(`reference ${value} points at a result that does not exist yet`);
    let cur = src;
    for (const k of m[2].split('.')) cur = cur?.[k];
    if (cur === undefined) throw new Error(`reference ${value} resolved to nothing`);
    return cur;
  }
  if (Array.isArray(value)) return value.map((v) => resolveRef(v, results));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveRef(v, results)]));
  return value;
};

function compactManifest(m, area) {
  const features = m.features.filter((f) => !area || f.area === area);
  const wanted = new Set(features.flatMap((f) => f.actions));
  return {
    version: m.version,
    gitCommit: m.gitCommit,
    conventions: m.conventions,
    areas: [...new Set(m.features.map((f) => f.area))],
    features: features.map((f) => ({ id: f.id, area: f.area, name: f.name, status: f.status, ui: f.ui, actions: f.actions, ...(f.notes ? { notes: f.notes } : {}) })),
    actions: m.actions.filter((a) => !area || wanted.has(a.id)).map((a) => ({
      id: a.id,
      description: a.description,
      undoable: a.undoable,
      params: a.params.map((p) => `${p.name}${p.optional ? '?' : ''}: ${p.values ? p.values.map((v) => JSON.stringify(v)).join(' | ') : p.type}${p.catalog ? ` (catalog ${p.catalog})` : ''}`),
      ...(a.returns ? { returns: a.returns } : {}),
    })),
    catalogs: Object.fromEntries(Object.entries(m.catalogs ?? {}).map(([k, v]) => [k, v.map((e) => e.id)])),
  };
}

const TOOLS = [
  {
    name: 'list_features',
    description: 'What FlashFX can do: features (with UI path + status), the whitelisted action ids with their params, and live preset catalogs (from /agent/features.json). compact=false returns the raw manifest.',
    inputSchema: { type: 'object', properties: { area: { type: 'string', description: 'Only this feature area, e.g. "text", "keyframes", "effects".' }, compact: { type: 'boolean', default: true } } },
    annotations: { readOnlyHint: true },
    handler: async ({ area, compact = true }) => {
      const m = await session.manifest();
      return ok(compact ? compactManifest(m, area) : m);
    },
  },
  {
    name: 'get_state',
    description: 'Compact summary of the open composition: size, fps, duration, playhead, selection, layers (id, name, type, text...), undo/redo availability.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    handler: async () => ok(await session.state()),
  },
  {
    name: 'get_layer',
    description: 'Full JSON of one layer (agent.getLayer): transform, text content / shape geometry, animators, masks, effects and every keyframe. Use it to find the exact dot-paths for updateLayerProperty / addKeyframe and to verify an edit.',
    inputSchema: { type: 'object', required: ['layerId'], properties: { layerId: { type: 'string' } } },
    annotations: { readOnlyHint: true },
    handler: async ({ layerId }) => fromRun(await session.run('agent.getLayer', { layerId })),
  },
  {
    name: 'measure_text',
    description: 'Measure a text layer as the renderer lays it out (agent.measureText): centre, ink box (left/right/top/bottom of the lines), per-line widths, line height. Use it to align shapes, size masks and cards, or left-align text by computing its centre.',
    inputSchema: { type: 'object', required: ['layerId'], properties: { layerId: { type: 'string' }, frame: { type: 'number', description: 'Default: the playhead.' } } },
    annotations: { readOnlyHint: true },
    handler: async ({ layerId, frame }) => fromRun(await session.run('agent.measureText', frame === undefined ? { layerId } : { layerId, frame })),
  },
  {
    name: 'create_project',
    description: 'Create a new local FlashFX project and open it in the editor. format long = 1920x1080, short = 1080x1920.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        format: { type: 'string', enum: ['long', 'short'], default: 'long' },
        frameRate: { type: 'number', default: 30 },
        durationFrames: { type: 'number', default: 150 },
        uiMode: { type: 'string', enum: ['starter', 'pro'], description: 'Editor layout (pro = Full editor). Omit to keep the current one.' },
        clipLength: { type: 'string', enum: ['comp', 'default'], description: 'comp = every new layer spans the whole composition (recommended for agent builds); default = 4 s clips like the UI. Kept for the session.' },
      },
    },
    handler: async (a) => fromRun(await session.run('agent.createProject', {
      name: a.name, format: a.format ?? 'long', frameRate: a.frameRate, durationFrames: a.durationFrames, uiMode: a.uiMode, clipLength: a.clipLength,
    }, 120000, { retryOnReload: true })),
  },
  {
    name: 'run_action',
    description: 'Run ONE whitelisted FlashFX action (see list_features for ids and params). args = object keyed by param name, or a positional array.',
    inputSchema: {
      type: 'object',
      required: ['actionId'],
      properties: {
        actionId: { type: 'string', description: 'e.g. "editor.addText", "agent.applyTextAnimatorPreset", "editor.addKeyframe".' },
        args: { description: 'Object keyed by param name, or positional array.', oneOf: [{ type: 'object' }, { type: 'array' }] },
      },
    },
    handler: async ({ actionId, args }) => fromRun(await session.run(actionId, args)),
  },
  {
    name: 'run_actions',
    description: 'Run several whitelisted actions in order. A string arg "$N.path" / "$last.path" is replaced by that value from an earlier result in this batch (e.g. "$0.activeLayerId" = the layer created by the first action). Stops at the first error unless stopOnError=false.',
    inputSchema: {
      type: 'object',
      required: ['actions'],
      properties: {
        actions: {
          type: 'array',
          items: { type: 'object', required: ['actionId'], properties: { actionId: { type: 'string' }, args: { oneOf: [{ type: 'object' }, { type: 'array' }] } } },
        },
        stopOnError: { type: 'boolean', default: true },
      },
    },
    handler: async ({ actions, stopOnError = true }) => {
      if (!Array.isArray(actions)) return fail('"actions" must be an array');
      const results = [];
      let failed = false;
      for (const step of actions) {
        let r;
        try { r = await session.run(step.actionId, resolveRef(step.args, results)); }
        catch (e) { r = { ok: false, actionId: step.actionId, error: e.message }; }
        results.push(r);
        if (!r?.ok) { failed = true; if (stopOnError) break; }
      }
      const summary = { ok: !failed, ran: results.length, of: actions.length, results };
      return failed ? { ...ok(summary), isError: true } : ok(summary);
    },
  },
  {
    name: 'seek',
    description: 'Move the playhead to a frame and render it (agent.seek).',
    inputSchema: { type: 'object', required: ['frame'], properties: { frame: { type: 'number' } } },
    handler: async ({ frame }) => fromRun(await session.run('agent.seek', { frame })),
  },
  {
    name: 'play',
    description: 'Start preview playback (agent.play).',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => fromRun(await session.run('agent.play')),
  },
  {
    name: 'pause',
    description: 'Pause preview playback (agent.pause).',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => fromRun(await session.run('agent.pause')),
  },
  {
    name: 'screenshot',
    description: 'Save a PNG of the editor window (region "window") or only the preview canvas (region "canvas") and return a preview image.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Where to write the PNG (default: a temp file).' },
        region: { type: 'string', enum: ['window', 'canvas'], default: 'window' },
        inline: { type: 'boolean', default: true, description: 'Also return a downscaled JPEG in the result.' },
        clean: { type: 'boolean', description: 'Hide DOM overlays (selection handles, the Flash character, toasts) during the capture. Default: true for region "canvas", false for "window".' },
      },
    },
    annotations: { readOnlyHint: true },
    handler: async ({ path, region, inline = true, clean }) => {
      const s = await session.screenshot({ path, region, inline, clean });
      const { inlineJpeg, ...info } = s;
      return ok(info, inlineJpeg ? [{ type: 'image', data: inlineJpeg, mimeType: 'image/jpeg' }] : []);
    },
  },
  {
    name: 'render_frame',
    description: 'Render ONE frame of the active composition at full resolution to a PNG through an offscreen WebGPU renderer, exactly like export (export motion blur, full-res video, no UI overlays, not the scaled preview). Use it for pixel-true checks and side-by-sides with reference frames. Returns the image inline when it is small enough.',
    inputSchema: {
      type: 'object',
      properties: {
        frame: { type: 'number', description: 'Default: the playhead.' },
        path: { type: 'string', description: 'Where to write the PNG (default: a temp file).' },
        width: { type: 'number', description: 'Default: the composition width (height alone keeps the aspect).' },
        height: { type: 'number' },
        inline: { type: 'boolean', default: true, description: 'Also return the PNG in the result (skipped above 3 MB).' },
      },
    },
    annotations: { readOnlyHint: true },
    handler: async ({ path, inline = true, ...opts }) => {
      const r = await session.renderFrame(path, opts);
      if (!r?.ok) return fromRun(r);
      return ok(r.result, inlinePng(r.result, inline));
    },
  },
  {
    name: 'render_strip',
    description: 'Render several frames (the export path, like render_frame) into one labelled contact-sheet PNG, e.g. frames [0, 8, 16, 24, 40, 60] to check an entrance, the rest and the exit in one look.',
    inputSchema: {
      type: 'object',
      required: ['frames'],
      properties: {
        frames: { type: 'array', items: { type: 'number' }, description: 'Up to 64 frame numbers.' },
        path: { type: 'string', description: 'Where to write the PNG (default: a temp file).' },
        columns: { type: 'number', description: 'Default min(4, frames).' },
        tileWidth: { type: 'number', description: 'Width of each tile in px (default min(480, comp width)).' },
        labels: { type: 'boolean', default: true },
        inline: { type: 'boolean', default: true },
      },
    },
    annotations: { readOnlyHint: true },
    handler: async ({ path, inline = true, ...opts }) => {
      if (!Array.isArray(opts.frames) || !opts.frames.length) return fail('"frames" is required');
      const r = await session.renderStrip(path, opts);
      if (!r?.ok) return fromRun(r);
      return ok(r.result, inlinePng(r.result, inline));
    },
  },
  {
    name: 'export_mp4',
    description: 'Render the active composition to an MP4 file through FlashFX\'s real exporter (WebGPU + WebCodecs, same as File > Export Video). Defaults to the composition size and fps. Can take minutes for long comps.',
    inputSchema: {
      type: 'object',
      required: ['path'],
      properties: {
        path: { type: 'string', description: 'Output .mp4 path on this machine.' },
        width: { type: 'number' },
        height: { type: 'number' },
        frameRate: { type: 'number' },
        bitrate: { type: 'number', description: 'Bits per second (default 8000000).' },
        includeAudio: { type: 'boolean', default: true },
      },
    },
    handler: async ({ path, ...opts }) => {
      if (typeof path !== 'string' || !path) return fail('"path" is required');
      return fromRun(await session.exportMp4(path, opts));
    },
  },
  {
    name: 'save_project',
    description: 'Save the open project to the app local storage now (File > Save). The app also autosaves.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => fromRun(await session.run('agent.saveProject')),
  },
  {
    name: 'export_project',
    description: 'Write the open project to disk as an editable .ffx file (every composition + imported media), the same file as File > Download Project. Open it in FlashFX with File > Import Project, or with import_project.',
    inputSchema: {
      type: 'object',
      required: ['path'],
      properties: { path: { type: 'string', description: 'Output .ffx path on this machine.' } },
    },
    handler: async ({ path }) => {
      if (typeof path !== 'string' || !path) return fail('"path" is required');
      return fromRun(await session.exportProject(path));
    },
  },
  {
    name: 'import_project',
    description: 'Import a .ffx project file from disk as a new local project and open it in the editor (File > Import Project). Saves and closes the open project first.',
    inputSchema: {
      type: 'object',
      required: ['path'],
      properties: { path: { type: 'string', description: '.ffx file on this machine.' } },
    },
    handler: async ({ path }) => {
      if (typeof path !== 'string' || !path) return fail('"path" is required');
      return fromRun(await session.importFile('agent.importProject', path));
    },
  },
  {
    name: 'import_image',
    description: 'Import an image file from disk (PNG, JPEG, WebP, GIF, or SVG, which is rasterized) into the open project and, by default, place it as a new image layer. Returns assetId (and the new layer id as activeLayerId when placed).',
    inputSchema: {
      type: 'object',
      required: ['path'],
      properties: {
        path: { type: 'string', description: 'Image file on this machine.' },
        place: { type: 'boolean', default: true, description: 'Also add it as an image layer (editor.addImageFromAsset).' },
        x: { type: 'number', description: 'Layer centre X in comp px (default: comp centre).' },
        y: { type: 'number', description: 'Layer centre Y in comp px (default: comp centre).' },
        rasterSize: { type: 'number', description: 'SVG only: longest side of the rasterized PNG in px (default 1024).' },
      },
    },
    handler: async ({ path, place = true, x, y, rasterSize }) => {
      if (typeof path !== 'string' || !path) return fail('"path" is required');
      const imp = await session.importFile('agent.importImage', path, rasterSize === undefined ? {} : { rasterSize });
      if (!imp?.ok || !place) return fromRun(imp);
      const st = await session.state();
      const placed = await session.run('editor.addImageFromAsset', {
        assetId: imp.result.assetId, x: x ?? Math.round(st.width / 2), y: y ?? Math.round(st.height / 2),
      });
      if (!placed?.ok) return fromRun(placed);
      return ok({ ...imp, placed: true, activeLayerId: placed.activeLayerId, undoDepth: placed.undoDepth });
    },
  },
  {
    name: 'import_media',
    description: 'Import a video (MP4, MOV, WebM, MKV), audio (MP3, WAV, M4A, AAC, OGG, FLAC) or image file from disk into the open project (streamed in chunks, so big clips work) and, by default, place it: video as a video layer (fit to the canvas unless fit=false), audio as an audio layer, images as an image layer. Returns the import result (kind, assetId, duration, size, compFrames) plus activeLayerId of the placed layer. The clip starts at frame 0; move it in time with editor.moveClipInTime.',
    inputSchema: {
      type: 'object',
      required: ['path'],
      properties: {
        path: { type: 'string', description: 'Media file on this machine.' },
        place: { type: 'boolean', default: true, description: 'Also add it as a layer.' },
        fit: { type: 'boolean', default: true, description: 'Video / image: scale the placed layer to fit the canvas (editor.fitLayerToCanvas).' },
        x: { type: 'number', description: 'Video / image centre X in comp px (default: comp centre).' },
        y: { type: 'number', description: 'Video / image centre Y in comp px (default: comp centre).' },
        mimeType: { type: 'string', description: 'Override the type inferred from the extension.' },
      },
    },
    handler: async ({ path, place = true, fit = true, x, y, mimeType }) => {
      if (typeof path !== 'string' || !path) return fail('"path" is required');
      const imp = await session.importFileChunked('agent.importMedia', path, mimeType ? { mimeType } : {});
      if (!imp?.ok || !place) return fromRun(imp);
      const { kind, assetId } = imp.result;
      const st = await session.state();
      const cx = x ?? Math.round(st.width / 2);
      const cy = y ?? Math.round(st.height / 2);
      const placed = kind === 'audio'
        ? await session.run('editor.addAudioFromAsset', { assetId })
        : await session.run(kind === 'video' ? 'editor.addVideoFromAsset' : 'editor.addImageFromAsset', { assetId, x: cx, y: cy });
      if (!placed?.ok) return fromRun(placed);
      if (kind !== 'audio' && fit && x === undefined && y === undefined) {
        const fitted = await session.run('editor.fitLayerToCanvas', { layerId: placed.activeLayerId });
        if (!fitted?.ok) return fromRun(fitted);
      }
      return ok({ ...imp, placed: true, activeLayerId: placed.activeLayerId, undoDepth: placed.undoDepth });
    },
  },
  {
    name: 'import_font',
    description: 'Import a font file from disk (WOFF2, WOFF, TTF or OTF) into the browser font library (agent.importFont, like Inspector > Font > Import). Returns the family name to put in "content.spans.0.style.fontFamily". Pass family for WOFF2 (its name table is not readable here); import Regular / Bold / Italic files under one family with weight / style. Bundled families: list_features catalogs.fontFamilies.',
    inputSchema: {
      type: 'object',
      required: ['path'],
      properties: {
        path: { type: 'string', description: 'Font file on this machine.' },
        family: { type: 'string', description: 'Family name to register it under (default: the font name table, else the file name).' },
        weight: { type: 'number', description: 'Weight descriptor 1..1000 (default: read from the font when possible).' },
        style: { type: 'string', enum: ['normal', 'italic'], description: 'Style descriptor (default: read from the font when possible).' },
      },
    },
    handler: async ({ path, family, weight, style }) => {
      if (typeof path !== 'string' || !path) return fail('"path" is required');
      const extra = {};
      if (family !== undefined) extra.family = family;
      if (weight !== undefined) extra.weight = weight;
      if (style !== undefined) extra.style = style;
      return fromRun(await session.importFile('agent.importFont', path, extra));
    },
  },
  {
    name: 'list_recipes',
    description: 'The animation recipes (mcp/recipes/*.json): parameterized house moves measured on reference motion videos (kinetic title, blur-in text, type-on, prompt bar, pop-in, underline, scene camera, shape morph, transition, cursor click, end card...). Each entry has its params schema with defaults, its natural length (frames at 30 fps) and the references it was extracted from. Use apply_recipe to build one.',
    inputSchema: { type: 'object', properties: { category: { type: 'string', description: 'Only this category: background, text, ui, shape, camera, transition, endcard.' }, id: { type: 'string', description: 'Only this recipe.' } } },
    annotations: { readOnlyHint: true },
    handler: async ({ category, id }) => {
      const all = [...recipes().values()];
      const list = all.filter((r) => (!category || r.category === category) && (!id || r.id === id));
      if (id && !list.length) return fail(`unknown recipe ${id} (known: ${all.map((r) => r.id).join(', ')})`);
      return ok({ count: list.length, howTo: 'apply_recipe { id, params, startFrame, endFrame?, parentId? }. Times inside params are frames at 30 fps (scaled to the comp fps); startFrame / endFrame are comp frames. Apply back to front: background, camera, content, transitions last.', recipes: list.map(describeRecipe) });
    },
  },
  {
    name: 'apply_recipe',
    description: 'Build one recipe into the open composition: runs its action sequence (whitelisted actions only, one undo step each) with your params. startFrame = comp frame where it begins; endFrame (optional) = where it ends (exits land on it and every created layer is clipped to [startFrame, endFrame]); without endFrame it uses its natural length. parentId = a scene camera / group null (from the scene-camera recipe) to hang its root layers on. dryRun = return the expanded actions without running them. Returns the created layers, useful ids / frames (returns) and checkFrames to render_strip.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'Recipe id from list_recipes.' },
        params: { type: 'object', description: 'Recipe params (see list_recipes); omitted ones use their defaults.' },
        startFrame: { type: 'number', default: 0 },
        endFrame: { type: 'number', description: 'Optional end in comp frames (exits finish here; layers are clipped to it).' },
        parentId: { type: 'string', description: 'Optional parent null for the root layers (a scene camera).' },
        dryRun: { type: 'boolean', default: false },
      },
    },
    handler: async ({ id, params = {}, startFrame = 0, endFrame, parentId, dryRun = false }) => {
      const recipe = recipes().get(id);
      if (!recipe) return fail(`unknown recipe ${id} (known: ${[...recipes().keys()].join(', ')})`);
      const st = dryRun ? { width: 1920, height: 1080, fps: 30, durationFrames: 300, ...(lastState ?? {}) } : await session.state();
      lastState = { width: st.width, height: st.height, fps: st.fps, durationFrames: st.durationFrames };
      let parentPosition;
      if (parentId && !dryRun) {
        const pl = await session.run('agent.getLayer', { layerId: parentId });
        if (!pl?.ok) return fromRun(pl);
        const pos = pl.result?.transform?.position?.defaultValue;
        parentPosition = Array.isArray(pos) ? pos : [0, 0];
      }
      try {
        const out = await runRecipe(recipe, params, {
          width: st.width, height: st.height, fps: st.fps, durationFrames: st.durationFrames, startFrame, endFrame, parentId, parentPosition,
        }, recipeExec, { dryRun });
        return ok({ ok: true, ...out, next: dryRun ? 'dry run: nothing was changed' : `render_strip { frames: ${JSON.stringify(out.checkFrames)} } to check it` });
      } catch (e) {
        return fail(`apply_recipe ${id}: ${e.message}`);
      }
    },
  },
  {
    name: 'undo',
    description: 'Undo the last undoable action (history.undo).',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => fromRun(await session.run('history.undo')),
  },
  {
    name: 'redo',
    description: 'Redo the last undone action (history.redo).',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => fromRun(await session.run('history.redo')),
  },
  {
    name: 'close_browser',
    description: 'Close the FlashFX browser (the next tool call relaunches it). Unsaved changes in the open project are autosaved by the app.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => { await session.closeBrowser(); return ok({ closed: true }); },
  },
];

const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

// ---------------------------------------------------------------------------------------------
// Recipes (mcp/recipes/*.json, engine in lib/recipes.mjs)
// ---------------------------------------------------------------------------------------------

let recipeCache = null;
let lastState = null;
/** Loaded once per server process (restart the server to pick up edited recipes). */
function recipes() { if (!recipeCache) recipeCache = loadRecipes(); return recipeCache; }

/** Runs one recipe step: a whitelisted action through the agent runtime, or one of the allowed tools. */
async function recipeExec({ kind, name, args }) {
  if (kind === 'action') {
    const r = await session.run(name, args);
    if (!r) throw new Error(`${name}: no result from the page`);
    if (r.ok === false) throw new Error(`${name}: ${r.error}`);
    return r;
  }
  const tool = TOOL_BY_NAME.get(name);
  if (!tool) throw new Error(`unknown tool ${name}`);
  const res = await tool.handler(args ?? {});
  if (res.isError) throw new Error(`${name}: ${res.content?.[0]?.text ?? 'failed'}`);
  return res.structuredContent;
}

// ---------------------------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------------------------

const RESOURCES = [
  { uri: 'flashfx://manifest', name: 'features.json', title: 'FlashFX agent manifest', description: 'Features, whitelisted actions and live catalogs (/agent/features.json).', mimeType: 'application/json' },
  { uri: 'flashfx://state', name: 'state', title: 'FlashFX editor state', description: 'Live summary of the open composition (same as get_state).', mimeType: 'application/json' },
  { uri: 'flashfx://taste', name: 'TASTE.md', title: 'FlashFX taste rules', description: 'Motion design principles with numbers measured on reference videos: easing, durations at 30 / 60 fps, stagger, overshoot, holds, type scale, colour, motion blur, transitions. Read before planning a piece.', mimeType: 'text/markdown' },
  { uri: 'flashfx://authoring', name: 'AUTHORING.md', title: 'FlashFX MCP authoring guide', description: 'How to build through these tools: comp setup, layers, text, shapes, masks, effects, checks, export.', mimeType: 'text/markdown' },
  { uri: 'flashfx://recipes', name: 'recipes', title: 'FlashFX animation recipes', description: 'Every recipe with its params schema (same as list_recipes).', mimeType: 'application/json' },
];
const RESOURCE_TEMPLATES = [
  { uriTemplate: 'flashfx://recipe/{id}', name: 'recipe', title: 'One recipe (full JSON, steps included)', mimeType: 'application/json' },
];

async function readResource(uri) {
  if (uri === 'flashfx://taste') return { text: readDoc('TASTE.md'), mimeType: 'text/markdown' };
  if (uri === 'flashfx://authoring') return { text: readDoc('AUTHORING.md'), mimeType: 'text/markdown' };
  if (uri === 'flashfx://recipes') return JSON.stringify([...recipes().values()].map(describeRecipe), null, 2);
  if (uri.startsWith('flashfx://recipe/')) {
    const r = recipes().get(uri.slice('flashfx://recipe/'.length));
    if (r) return JSON.stringify(r, null, 2);
  }
  if (uri === 'flashfx://manifest') return JSON.stringify(await session.manifest(), null, 2);
  if (uri === 'flashfx://state') return JSON.stringify(await session.state(), null, 2);
  const e = new Error(`unknown resource ${uri}`);
  e.code = -32002;
  throw e;
}

// ---------------------------------------------------------------------------------------------
// Prompts (slash commands in Claude Code: /mcp__flashfx__motion-brief, /mcp__flashfx__taste)
// ---------------------------------------------------------------------------------------------

const PROMPTS = [
  {
    name: 'motion-brief',
    title: 'Build a motion graphic from a one-line brief',
    description: 'Plan and build a clean, editable FlashFX piece from a brief with the taste rules and recipes, check it frame by frame, export the MP4 and the .ffx.',
    arguments: [
      { name: 'brief', description: 'What to make, e.g. "8 s launch title for FlashFX MCP early access".', required: true },
      { name: 'format', description: 'square (1080x1080), vertical (1080x1920) or landscape (1920x1080). Default square.', required: false },
      { name: 'outDir', description: 'Folder for piece.mp4 and piece.ffx. Default ./flashfx-out', required: false },
    ],
    build: ({ brief = '', format = 'square', outDir = './flashfx-out' }) => [
      `Brief: ${brief}`,
      `Format: ${format}. Output folder: ${outDir}`,
      '',
      'Follow the flashfx-motion workflow (mcp/skill/flashfx-motion/SKILL.md):',
      '1. Read the taste rules (resource flashfx://taste) and call list_recipes.',
      '2. Plan before any build call: shots (median 2 s, cut on beats), one idea per shot, the recipe for each element, start / end frames at the comp fps. Write the plan as a short table.',
      '3. create_project (clipLength "comp"), editor.setCompositionSize for square / vertical, then apply_recipe back to front: background, scene-camera, content, transitions last.',
      '4. After each shot: render_strip on the checkFrames that apply_recipe returns. Fix what breaks the taste rules (overlaps, crowding, elements visible too early, flat timing) with run_action / editor.setKeyframes, or undo and re-apply with new params.',
      '5. Final pass: render_strip of 8-12 frames across the piece, then export_project and export_mp4 into the output folder.',
      '6. Report the plan, the recipes used and the file paths.',
    ].join(String.fromCharCode(10)),
  },
  {
    name: 'taste',
    title: 'FlashFX taste rules',
    description: 'The full TASTE.md (measured motion design principles) as context.',
    arguments: [],
    build: () => readDoc('TASTE.md'),
  },
  {
    name: 'authoring',
    title: 'FlashFX MCP authoring guide',
    description: 'The full AUTHORING.md as context.',
    arguments: [],
    build: () => readDoc('AUTHORING.md'),
  },
];

// ---------------------------------------------------------------------------------------------
// JSON-RPC over stdio
// ---------------------------------------------------------------------------------------------

const write = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);
const reply = (id, result) => write({ jsonrpc: '2.0', id, result });
const replyError = (id, code, message) => write({ jsonrpc: '2.0', id, error: { code, message } });

// Tool calls and resource reads touch the one browser tab: run them strictly in order.
let queue = Promise.resolve();
const serial = (fn) => { const p = queue.then(fn, fn); queue = p.catch(() => {}); return p; };

async function handle(msg) {
  const { id, method, params = {} } = msg;
  const isRequest = id !== undefined && id !== null;
  if (!method) return; // a response to something we never send
  try {
    switch (method) {
      case 'initialize': {
        const asked = params.protocolVersion;
        reply(id, {
          protocolVersion: SUPPORTED_PROTOCOLS.includes(asked) ? asked : SUPPORTED_PROTOCOLS[0],
          capabilities: { tools: { listChanged: false }, resources: { listChanged: false, subscribe: false }, prompts: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions: INSTRUCTIONS,
        });
        return;
      }
      case 'ping': reply(id, {}); return;
      case 'tools/list':
        reply(id, { tools: TOOLS.map(({ handler: _h, ...t }) => t) });
        return;
      case 'tools/call': {
        const tool = TOOL_BY_NAME.get(params.name);
        if (!tool) { replyError(id, -32602, `unknown tool: ${params.name}`); return; }
        const result = await serial(async () => {
          try { return await tool.handler(params.arguments ?? {}); }
          catch (e) {
            const logs = session.recentLogs(5);
            return fail(`${tool.name} failed: ${e.message}${logs.length ? `\nrecent page errors:\n${logs.join('\n')}` : ''}`);
          }
        });
        reply(id, result);
        return;
      }
      case 'resources/list': reply(id, { resources: RESOURCES }); return;
      case 'resources/templates/list': reply(id, { resourceTemplates: RESOURCE_TEMPLATES }); return;
      case 'resources/read': {
        const uri = String(params.uri ?? '');
        // Docs and recipes are files on disk: no need to wait for (or boot) the browser.
        const local = /^flashfx:\/\/(taste|authoring|recipe)/.test(uri);
        const body = local ? await readResource(uri) : await serial(() => readResource(uri));
        const { text: t, mimeType } = typeof body === 'string' ? { text: body, mimeType: 'application/json' } : body;
        reply(id, { contents: [{ uri, mimeType, text: t }] });
        return;
      }
      case 'prompts/list': reply(id, { prompts: PROMPTS.map(({ build: _b, ...p }) => p) }); return;
      case 'prompts/get': {
        const pr = PROMPTS.find((p) => p.name === params.name);
        if (!pr) { replyError(id, -32602, `unknown prompt: ${params.name}`); return; }
        reply(id, { description: pr.description, messages: [{ role: 'user', content: { type: 'text', text: pr.build(params.arguments ?? {}) } }] });
        return;
      }
      default:
        if (method.startsWith('notifications/')) return; // initialized, cancelled, ... nothing to do
        if (isRequest) replyError(id, -32601, `method not found: ${method}`);
    }
  } catch (e) {
    if (isRequest) replyError(id, typeof e.code === 'number' ? e.code : -32603, e.message);
  }
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { replyError(null, -32700, 'parse error'); return; }
  for (const m of Array.isArray(msg) ? msg : [msg]) void handle(m);
});

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  try { await queue; } catch { /* ignore */ }
  await session.shutdown().catch(() => {});
  process.exit(0);
}
rl.on('close', shutdown);
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.stderr.write(`[flashfx-mcp] ready (${config.url ? `url ${config.url}` : `server ${config.server}`}, ${config.attachPort ? `attach :${config.attachPort}` : config.headed ? 'headed' : 'headless'})\n`);
