# FlashFX MCP server

A local [Model Context Protocol](https://modelcontextprotocol.io) server that lets Claude Code (or any
MCP client) drive a **real FlashFX editor**: create projects, add and animate layers, scrub, play,
screenshot and export MP4. It is how the tutorial/video pipeline builds scenes in FlashFX.

How it works:

- It starts FlashFX itself (the Vite dev server from this repo, the built `dist/`, or any URL such as
  `https://editor.flashfx.app`) and opens it in **Chrome with WebGPU**, either headless, as a headed
  chromeless app window (for screen recording), or attached to a Chrome you already run.
- Every tool maps onto the in-app agent runtime **`window.__ffxAgent`** (`src/agent/runtime.ts`) over the
  Chrome DevTools Protocol. That means the same whitelisted store actions the UI uses, listed in
  `/agent/features.json`, with one undo step per undoable action. It never clicks the DOM and never
  evaluates arbitrary code in the app.
- No dependencies: the MCP stdio protocol (JSON-RPC 2.0, one message per line) is implemented in
  `flashfx-mcp.mjs`, and the CDP client in `lib/session.mjs` uses Node 22's built-in `fetch` and
  `WebSocket`. Requires Node 22+ and Chrome/Chromium/Edge (set `CHROME_PATH` if it is not found).

## Add it to Claude Code

From the repo root (`Desktop/project`):

```bash
claude mcp add flashfx -- node mcp/flashfx-mcp.mjs
```

Headed (a visible 1920x1080 FlashFX window you can screen-record), serving the built app:

```bash
npm run build
claude mcp add flashfx-rec -- node mcp/flashfx-mcp.mjs --server dist --headed --window 1920x1080
```

Against production instead of the local code:

```bash
claude mcp add flashfx-prod -- node mcp/flashfx-mcp.mjs --url https://editor.flashfx.app
```

Use an absolute path to `mcp/flashfx-mcp.mjs` if you register it from another directory. You can also
run it directly with `npm run mcp:flashfx` (it then waits for MCP messages on stdin).

Equivalent JSON config (Claude Desktop / `.mcp.json`):

```json
{ "mcpServers": { "flashfx": { "command": "node", "args": ["C:/Users/there/OneDrive/Desktop/project/mcp/flashfx-mcp.mjs", "--server", "dist", "--headed"] } } }
```

## Options

| Flag | Env | Default | Meaning |
| --- | --- | --- | --- |
| `--server dev\|dist` | `FLASHFX_SERVER` | `dev` | Start the Vite dev server (always the current code, slower first load; it can reload the tab when Vite re-optimizes deps) or serve the built `dist/` (run `npm run build` first; stable, best for recording). |
| `--url URL` | `FLASHFX_URL` | none | Use an already running FlashFX (local or `https://editor.flashfx.app`). No local server. |
| `--headed` | `FLASHFX_HEADED=1` | headless | Show a chromeless app window (no tabs or URL bar) for screen recording. |
| `--window WxH` | `FLASHFX_WINDOW` | `1920x1080` | Window size (headed) or viewport size (headless). |
| `--attach PORT` | `FLASHFX_CDP_PORT` | none | Attach to your own Chrome started with `--remote-debugging-port=PORT --enable-unsafe-webgpu` instead of launching one. |
| `--profile DIR` | `FLASHFX_PROFILE` | temp dir | Persistent Chrome profile, so projects in IndexedDB and fonts survive restarts. By default a throwaway profile is used and deleted on exit. |
| `--chrome PATH` | `CHROME_PATH` | auto | Chrome/Edge binary. |
| | `FLASHFX_BOOT_TIMEOUT_MS` | `180000` | How long to wait for the app to load. |

A fresh profile skips the first-run onboarding, turns analytics consent to "denied" and marks the tour as
seen (through `localStorage`, before the app loads). An existing choice is never overwritten.

## Tools

| Tool | Maps to | Notes |
| --- | --- | --- |
| `list_features {area?, compact?}` | `/agent/features.json` | Features (UI path, status), action ids with params, live preset catalogs. Start here. |
| `get_state` | `__ffxAgent.getState()` | Size, fps, duration, playhead, selection, layers (id, name, type, text), undo/redo. |
| `get_layer {layerId}` | `agent.getLayer` | Full JSON of one layer: every property path you can set or keyframe. |
| `measure_text {layerId, frame?}` | `agent.measureText` | Text laid out exactly like the renderer: centre, ink box, line widths. For alignment and sizing. |
| `create_project {name?, format: long\|short, frameRate?, durationFrames?, uiMode?}` | `agent.createProject` | long = 1920x1080, short = 1080x1920. Saves and closes any open project first. |
| `run_action {actionId, args?}` | `__ffxAgent.run` | One whitelisted action. args are keyed by param name, or a positional array. |
| `run_actions {actions[], stopOnError?}` | `__ffxAgent.run` x N | In order. A string arg `"$N.path"` / `"$last.path"` is replaced from an earlier result, e.g. `"$0.activeLayerId"`. |
| `seek {frame}` | `agent.seek` | Moves the real playhead (timeline `playbackController`) and renders. |
| `play` / `pause` | `agent.play` / `agent.pause` | Preview playback. |
| `screenshot {path?, region: window\|canvas, inline?, clean?}` | CDP `Page.captureScreenshot` | Writes a PNG, returns a downscaled JPEG preview plus the preview canvas rect. `clean` (default for `canvas`) hides DOM overlays during the capture. |
| `export_mp4 {path, width?, height?, frameRate?, bitrate?, includeAudio?}` | `agent.exportMp4` | The real exporter (WebGPU + WebCodecs, same as File > Export Video). The bytes are streamed out with `__ffxAgent.readExport`. |
| `export_project {path}` | `agent.exportProject` | Writes the editable `.ffx` (every composition + imported media), the same file as File > Download Project. |
| `import_project {path}` | `agent.importProject` | Opens a `.ffx` from disk as a new project. |
| `save_project` | `agent.saveProject` | Saves to the app's local storage now (the app also autosaves). |
| `import_image {path, place?, x?, y?, rasterSize?}` | `agent.importImage` (+ `editor.addImageFromAsset`) | PNG / JPEG / WebP / GIF, or SVG rasterized to `rasterSize` px (default 1024). |
| `undo` / `redo` | `history.undo` / `history.redo` | |
| `close_browser` | | Closes Chrome. The next call relaunches it. |

Resources: `flashfx://manifest` (the feature manifest) and `flashfx://state` (the live editor state).

### Example: an animated title

```json
{ "name": "run_actions", "arguments": { "actions": [
  { "actionId": "editor.addText", "args": { "content": "STUNNING" } },
  { "actionId": "editor.updateLayerProperty", "args": { "layerId": "$0.activeLayerId", "path": "animOverrides.fontSize.defaultValue", "value": 220 } },
  { "actionId": "editor.updateLayerProperty", "args": { "layerId": "$0.activeLayerId", "path": "content.spans.0.style.color", "value": [1, 0.85, 0.2, 1] } },
  { "actionId": "agent.applyTextAnimatorPreset", "args": { "layerId": "$0.activeLayerId", "presetId": "pop-in", "startFrame": 0, "durationFrames": 20 } },
  { "actionId": "editor.addKeyframe", "args": ["$0.activeLayerId", "transform.opacity", 0, 0] },
  { "actionId": "editor.addKeyframe", "args": ["$0.activeLayerId", "transform.opacity", 15, 1] }
] } }
```

Text gotcha: font size, line height, letter spacing and stroke width are animatable and live in
`animOverrides` (`animOverrides.fontSize.defaultValue`, keyframe path `animOverrides.fontSize`). Colour,
font family and weight live in `content.spans.0.style.*`.

## Smoke test

```bash
npm run gpu:mcp                                   # headless, Vite dev server
FLASHFX_SERVER=dist npm run gpu:mcp               # against the built dist/
FLASHFX_HEADED=1 FLASHFX_SERVER=dist npm run gpu:mcp   # watch it in a real window
```

It spawns the server over real MCP stdio, creates a project, adds a styled and keyframed text layer with
`run_actions`, seeks, screenshots, checks that the text changed the preview canvas pixels, tests
undo/redo, reads the layer back (`get_layer`, `measure_text`), imports the FlashFX SVG mark, writes the
project to a `.ffx` and re-opens it, and exports a 1-second MP4 through the real exporter
(`FLASHFX_SMOKE_EXPORT=0` skips that).

## Authoring

How to build clean pieces through these tools (comp setup, naming, timing grid, easing, masks,
checks, saving): [`AUTHORING.md`](./AUTHORING.md). Reference builds: `mcp/examples/build-*.mjs`
(`node mcp/examples/build-a-kinetic-title.mjs <outDir>`). Audit and known gaps:
[`docs/MCP-AUDIT.md`](../docs/MCP-AUDIT.md).
Like every `gpu:*` script it needs Chrome and a GPU, so it is local-only and not part of `npm test`.

## Limits

- Video / audio import, auto-captions (in-browser Whisper) and pen drawing are UI-only (see
  `list_features` notes). Images import with `import_image`; place already-imported media with the
  `editor.add*FromAsset` actions.
- One tab per server. Tool calls run strictly in order.
- Exports are held in page memory until they are streamed out, as in the app's Export modal, so very
  long 1080p exports need RAM.
