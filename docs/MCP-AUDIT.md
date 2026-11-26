# FlashFX MCP and agent runtime audit (Nov 2026)

**Question:** does "Claude builds it, FlashFX renders it, fully editable" work today, and where does
it break?

**Answer:** yes for clean 2D motion design, after this audit's fixes. Three reference pieces were
built end to end through the MCP server only (real MCP stdio, no DOM clicks, no page evals), rendered
to 1080p MP4 by the real exporter, saved as editable `.ffx` projects and re-opened. Before the audit
an agent could NOT save the editable project, could NOT bring in a logo, and the signature "words
rising out of masks" look silently failed (masks were dropped from animated text). Those are fixed.
What remains is queued as batches B44-B49 in `docs/AE-FEATURE-BATCHES.md`.

How to author through the MCP: [`mcp/AUTHORING.md`](../mcp/AUTHORING.md).

## 1. Method

1. Standing harnesses (local Chrome + GPU): `npm run gpu:mcp` 10/10 passed (85 s, dev server),
   `npm run gpu:agent-runtime` 8/8 passed. After the fixes `gpu:mcp` was extended to 13 checks
   (get_layer, measure_text, import_image, export_project, import_project round trip).
2. Three builds, each a Node script that speaks MCP stdio to `mcp/flashfx-mcp.mjs` (shared client
   `mcp/examples/lib/mcp-client.mjs`), with screenshots at key frames, `export_project`, then
   `export_mp4` at 1920x1080:
   - (a) `mcp/examples/build-a-kinetic-title.mjs`: two-line title, words rise out of per-line masks
     with a per-word stagger and per-glyph motion blur, gold italic accent word, underline draw-on
     (expo), type-on caption, staggered exit up through the same masks. 4 s.
   - (b) `mcp/examples/build-b-lower-third.mjs`: gold accent bar, rounded card growing from its left
     edge on a custom `cubic-bezier(0.2, 0.9, 0.1, 1)`, avatar pop on a named `backOut` with parented
     initials, name per word + role per character, progress line, ease-in exit. Card sized to the
     measured text. 5 s.
   - (c) `mcp/examples/build-c-logo-reveal.mjs`: `public/flashfx-mark.svg` imported, spin + scale in
     with a glow halo (glow-only copy behind the mark), spark burst (particles) + shockwave ring on the
     landing, mark slides left while the wordmark slides out from behind it through a mask, tagline
     blurs in. 4 s.
3. Every friction hit was logged, root-caused in the code, then either fixed (when small) or queued.
4. Diagnostics kept as scripts: `mcp/examples/diag-text-mask.mjs` (mask on plain vs animated text),
   `mcp/examples/diag-logo-color.mjs` (glow vs import colour), `mcp/examples/probe-defaults.mjs`
   (what each add* action creates), `mcp/examples/verify-roundtrip.mjs` (re-open every `.ffx`).

Artifacts (exports, `.ffx`, key-frame PNGs, logs): the task artifacts folder `mcp-audit/`.

## 2. Results

| Piece | Build time (MCP calls) | Export (1080p30) | MP4 | `.ffx` | Re-opened via import_project |
| --- | --- | --- | --- | --- | --- |
| (a) kinetic title | 51 s (create_project 30 s) | 120 frames in about 5 s | 0.77 MB | 15 KB | yes |
| (b) lower third | 57 s (create_project 34 s) | 150 frames in about 5 s | 0.57 MB | 20 KB | yes |
| (c) logo reveal | 60 s (create_project 29 s) | 120 frames in about 12 s | 1.55 MB | 0.8 MB (holds the mark PNG) | yes |

Preview vs export was compared frame by frame (frames extracted with ffmpeg): geometry, timing,
masks and colours match. The only visible difference is motion blur quality: the preview shows a few
stepped copies, the export is smooth (16+ samples). Exports are 1920x1080, H.264, exactly the comp
frame count.

## 3. Coverage (what an agent can reach)

| Area | Agent reachable | Used in builds | Notes |
| --- | --- | --- | --- |
| Project create / settings | yes | a, b, c | `create_project`, setCompositionSetting / Size |
| Save editable project | **yes (new)** | a, b, c | `save_project`, `export_project {path}`, `import_project {path}` |
| Background stack | yes | a, b, c | solid / linear / radial; default layer id not exposed (F21) |
| Layer naming / delete / select | yes | a, b, c | |
| Stack order | **broken** | b | `reorderLayers` has no visible effect (F10, B44) |
| Parenting | yes, quirky | b | keeps local position (F11, B34) |
| Clip timing | yes | b, c | 4 s default clip (F9); moveClipInTime works |
| Text: create, style, accent word | yes | a, b, c | size lives in two places (F23) |
| Text: measure | **yes (new)** | b, c | `measure_text` |
| Text animators (range selectors) | yes | a, b, c | presets + full `animators` edit via dot-path; first-glyph leak (F13) |
| Text boxes (fixed / fixedWidth) | partial | b | misplaced with animators (F12, B45) |
| Shapes: rect / circle / star / polygon | yes | a, b, c | 1 px grey stroke default (F16) |
| Path modifiers, repeater, dash, booleans | yes | | not exercised here |
| Pen / freehand paths | no (UI) | | create a polygon and set `shape.vertices` by dot-path as a workaround |
| Keyframes | yes | a, b, c | |
| Easing: bezier handles | yes | a, b, c | CSS cubic-bezier mapping; one handle pair per call (F14, B46) |
| Easing: named (back / elastic / bounce / Penner) | yes | b, c | outgoing segment |
| Hold keyframes | yes | a, c | |
| Expressions | yes | | covered by gpu:agent-runtime |
| Masks (parametric) | yes | a, b, c | composition-space; now clip animated text (F2 fixed) |
| Track mattes | yes | | not exercised |
| Motion blur | yes | a, b, c | preview stepped, export smooth (F17) |
| Glow / shadow / blur | yes | c | static params only (F15, B47) |
| Effect stack | yes | | numeric type ids, not exercised |
| Particles | **yes (new helper)** | c | `agent.configureParticles` (preset + overrides) |
| Image import | **yes (new)** | c | `import_image {path}` (SVG rasterized; vectors = B37) |
| Video / audio import | no (UI) | | B49 |
| Cloner, procedural, physics, VFX, templates | yes | | not exercised here |
| Precomp | yes | | not exercised |
| 2.5D camera | partial | | not exercised |
| Screenshot | yes, improved | a, b, c | clean capture (no overlays); still preview resolution (F17, B48) |
| MP4 export | yes | a, b, c | real exporter, fast |

## 4. Friction log

Severity: **S1** blocks the piece or silently ruins it, **S2** costs real agent time or needs a
workaround a new agent would not find, **S3** polish.

| # | Sev | Friction | Root cause | Status |
| --- | --- | --- | --- | --- |
| F1 | S1 | No way to save the editable project headlessly (`export.project` had zero actions). The core promise ("fully editable") was not deliverable by an agent. | Only the File menu triggered a browser download. | **Fixed:** `agent.saveProject`, `agent.exportProject` (bundle via the refactored `buildProjectBundle`, streamed with `readExport`), `agent.importProject`; MCP `save_project`, `export_project {path}`, `import_project {path}`. All three `.ffx` re-opened. |
| F2 | S1 | Layer masks were ignored on any text with an animator or an accent style, so "words rising out of a mask" showed the words travelling unclipped. | `resolveFrame` expanded the text into per-glyph stamps without copying the layer's masks. | **Fixed** in `core/interpolation.ts` (stamps carry the comp-space masks); harness check added to `verify:text-glyph-motion`; confirmed in the real renderer with `diag-text-mask.mjs`. |
| F3 | S1 | File import was UI-only, so a logo reveal could not use the real logo. | Import needed a browser `File`. | **Fixed for images:** `agent.importImage` + MCP `import_image {path}` (PNG / JPEG / WebP / GIF; SVG rasterized in the page). Video / audio: queued **B49**. |
| F4 | S2 | The agent could not read a layer's properties (get_state is a summary), so every dot-path was a guess. | No read action. | **Fixed:** `agent.getLayer` + MCP `get_layer`. |
| F5 | S2 | No text measurement: impossible to left-align text, size a card or a mask to text. | No measure action; `core/align` returns a fake 200x40 for text. | **Fixed:** `agent.measureText` + MCP `measure_text` (resolves exactly like the renderer). |
| F6 | S2 | The particle preset catalog was listed but no action applied it; the emitter is a JSON string. | Missing helper. | **Fixed:** `agent.configureParticles(layerId, presetId, overrides, seed)`, one undo step. |
| F7 | S2 | The first seek / screenshot after `create_project` was black (not even the background). | The Viewport attaches its WebGPU renderer asynchronously; createProject / seek did not wait. | **Fixed:** createProject and seek wait for the renderer. |
| F8 | S2 | Canvas screenshots contained DOM overlays: selection handles and the Flash character with its speech bubble. | Page screenshot clipped to the canvas rect. | **Fixed:** `screenshot` `clean` option, on by default for `region: "canvas"`. |
| F9 | S1 | In a 5 s comp everything vanished at frame 120. | New layers are 4 s clips like in the UI (`defaultClipFrames`). | **Documented** (manifest `conventions.timing`, AUTHORING); agent option queued **B45**. |
| F10 | S2 | `reorderLayers` changes nothing on screen. Also affects the UI's Bring to Front / Send to Back. | Render order is track order; reorder only permutes the layer array. | Queued **B44**. Workaround: create back to front. |
| F11 | S2 | Parenting moved the child off-screen. | `setLayerParent` keeps the local position (AE keeps world). | Queued (**B34** already specifies world-preserving parenting). Workaround: set the child offset. |
| F12 | S2 | `horizontalAlign: left` does nothing on an auto box; a fixed-width box misplaces animated / accent text (glyphs at the box top, outside the mask). | Auto box = text width; stamp placement ignores the box layout. | Queued **B45**. Workaround: `measure_text` and centre. |
| F13 | S3 | `type-on` and `blur-in` show the first glyph before their start frame. | Reveal window offset starts at the first unit. | Queued **B45**. Workaround: hold opacity 0 until the start. |
| F14 | S2 | Per-segment easing takes one call per segment; the arg order is handleIn before handleOut. Bezier handles themselves work well (exact CSS cubic-bezier). | `setKeyframeInterpolation` writes one handle pair to every target. | Documented (AUTHORING section 4); `agent.setKeyframes` queued **B46**. |
| F15 | S2 | Glow / shadow parameters cannot be keyframed (no glow pulse on a logo landing). | Plain numbers in `LayerGlow` / `LayerShadow`. | Queued **B47** (colour shares B33). |
| F16 | S3 | New shapes carry a 1 px grey stroke; `addRectangle` etc. place shapes at staggered positions. | UI defaults. | Documented (manifest `conventions.shapes`); `agent.addShape` queued **B46**. |
| F17 | S2 | Screenshots are the scaled preview (about 1392 px wide) with stepped preview motion blur, not the final frame. | No offscreen full-res frame path for agents. | Queued **B48** (`render_frame`, needed for frame-by-frame reference replication). |
| F18 | S3 | A glow on bright artwork shifts its hue (the amber mark became lemon: (253,255,65) vs source (255,200,61); glow off = (254,197,52)). | Glow adds light onto the subject (onlyGlow false). | Taste rule in AUTHORING: put a glow-only copy BEHIND the artwork. SVG as editable vectors: **B37**. |
| F19 | S3 | Cold start on the dev server: create_project 29-34 s, first text batch 8-9 s, first seek about 10 s, first import_image 6 s. Steady state: actions 25-50 ms, screenshot 150-250 ms, export 5-12 s for 4 s of 1080p. | Vite on-demand compile, font load. | Documented (use `--server dist`); queued **B49**. |
| F20 | S3 | `list_features` served a stale manifest after the action list changed. | `public/agent/features.json` is generated (`npm run agent:manifest`, first step of dev/build). | Documented in AUTHORING. |
| F21 | S3 | The default background layer id is not exposed, so builds add a second background on top. | get_state has no background / tracks. | Queued **B46**. |
| F22 | S3 | Measuring before creating (to size a card first) needs probe layers that are then deleted. | No string measure. | Queued **B46** (`agent.measureString`). |
| F23 | S3 | Text size exists twice (`animOverrides.fontSize` renders, `content.spans.0.style.fontSize` is the base style). | Data model. | Documented (manifest `conventions.textStyle`, AUTHORING). |
| F24 | S3 | A particle burst fires on the layer's first frame. | By design. | Documented: time it with `moveClipInTime`. |

## 5. Fixes shipped in this audit

| Change | Files |
| --- | --- |
| Agent actions `agent.saveProject`, `agent.exportProject`, `agent.importProject`, `agent.importImage`, `agent.getLayer`, `agent.measureText`, `agent.configureParticles` (all in `AGENT_ACTIONS` + features; `verify:agent-manifest` green, 104 actions) | `src/agent/runtime.ts`, `src/agent/featureManifest.ts` |
| `buildProjectBundle` extracted from the File-menu download (same bundle, also accepts a whole live SceneDocument) | `src/project-system/services/ffx.ts` |
| Glyph stamps carry the layer masks (+ harness check) | `src/core/interpolation.ts`, `scripts/verify-text-glyph-motion.mjs` |
| Renderer-ready wait in createProject / seek | `src/agent/runtime.ts` |
| MCP tools `get_layer`, `measure_text`, `save_project`, `export_project`, `import_project`, `import_image`; clean canvas screenshots | `mcp/flashfx-mcp.mjs`, `mcp/lib/session.mjs`, `mcp/README.md` |
| `gpu:mcp` covers the new tools (13 checks) | `scripts/gpu-mcp-smoke.mjs` |
| Manifest conventions: timing, textBox, shapes | `src/agent/featureManifest.ts` |
| Reference builds, client, diagnostics | `mcp/examples/*` |
| Authoring guide v0 | `mcp/AUTHORING.md` |

## 6. Queued (docs/AE-FEATURE-BATCHES.md, Agent / MCP group)

| Batch | What | From |
| --- | --- | --- |
| B44 | One stacking model: reorder moves tracks; agent bring-to-front / send-to-back | F10 |
| B45 | Text layout for agents: fixed boxes with stamps, first-glyph leak, comp-length clips option | F9, F12, F13 |
| B46 | Ergonomics: setKeyframes with per-key ease, addShape clean defaults, measureString, background ids in state | F14, F16, F21, F22 |
| B47 | Animatable glow / shadow parameters | F15 |
| B48 | Full-resolution `render_frame` / `render_strip` | F17 |
| B49 | Session speed + headless video / audio import | F3, F19 |
| (B34, B37, B33) | Already queued: world-preserving parenting + nulls, SVG as editable shapes, colour keyframes | F11, F18 |

Recommended order for the "replicate the reference videos" step: **B48** (pixel-true side-by-sides)
and **B44** first, then B46 / B45, then whatever the references demand (B33 colour keyframes, B37 SVG
shapes, B47 glow pulses are the likely ones).
