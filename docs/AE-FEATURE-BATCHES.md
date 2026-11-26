# FlashFX Feature Build Plan - Batches

The implementation plan for [`AFTER-EFFECTS-PREMIUM-FEATURES.md`](./AFTER-EFFECTS-PREMIUM-FEATURES.md). Its 28 research categories are re-cut here into **batches**: each batch is a coherent, dependency-ordered chunk sized to what can realistically be built **deeply and bulletproof in a single prompt**, then verified and shipped.

## How this works

- **One batch per prompt.** You run `/next-batch` to see the current batch, then reply **go** to build it. Nothing is implemented until you say go.
- **Audit before building.** Every batch starts by verifying what already exists in the editor (this codebase already has a lot - shape layers, masks, expressions, 2.5D camera, particles, cloner, precomp, text animators, per-layer motion blur, color-correction, physics bake, field sampling). We build only the genuine gaps and fix what's broken - never duplicate.
- **Verified, not vibes.** Each batch ends green on the standing gates - `tsc` (0 errors) · `lint` (125-problem baseline) · `build` · `npm test` - and adds a `scripts/verify-*.mjs` harness for any pure logic it introduces. Then commit + push.
- **Batches can split.** If a batch proves bigger than one prompt once we're in it, we split it (e.g. "B19a / B19b") rather than cram - bulletproof beats broad. This document is the source of truth; completing a batch flips its status here.

## Performance principles (why the ordering is what it is)

1. **Foundations before dependents.** Shared infrastructure is built once and reused. The big one is **B11 (effect-stack framework + adjustment layers)** - most finishing/stylise/glow/glitch/color batches depend on it, so they compose through one ordered GPU post-pipeline with a shared render-to-texture / ping-pong pool instead of each effect inventing its own passes.
2. **Perf-heavy features get their own batch.** Anything GPU-compute-bound or motion-estimation-bound (particles, optical-flow retiming, tracking, denoise, true 3D objects) is isolated so it gets full attention and its own profiling, never lumped with light work.
3. **Frame-purity is non-negotiable.** The timeline scrubs non-sequentially; every new evaluator must be a pure function of `(state, frame)` (house `mulberry32` for any randomness - no `Date`/`Math.random`). This keeps caching (`renderTree`, LRU) valid.
4. **LOD + caching where it counts.** Instanced/particle/geometry work reuses the cloner's LOD-threshold approach; expensive resolves cache by config hash (as field-sampling and precomp already do).

## Status legend
✅ done · ▶ **next** · ⬜ pending

| Batch | Title | Status | Perf weight |
|------|-------|--------|-------------|
| B1 | Easing engine core (Penner/elastic/bounce + render↔graph fix) | ✅ | light |
| B2 | Graph Editor Pro (speed graph, influence, hotkeys) | ✅ | light |
| B3a | Spatial motion path (curved position keyframes + per-frame spacing dots + auto-bezier) | ✅ | light |
| B3b | Motion-path tangent handles (drag) + roving | ✅ | light |
| B3c | Separate dimensions (independent X/Y position curves) | ✅ | medium |
| B4a | Composition motion-blur finishing (shutter angle / phase / samples) | ✅ | medium |
| B4b | Keyframe assistants - The Smoother + The Wiggler | ✅ | light |
| B5a | Time-remap model + speed ramps + Exponential Scale (pure + UI) | ✅ | medium |
| B5b | Frame-mix frame blending (two-frame cross-dissolve via resolve-time expansion) | ✅ | medium |
| B6a | Optical-flow retiming foundation (pure + mode + UI; GPU pass deferred) | ✅ | medium |
| B6b | Optical-flow GPU estimator + warp pre-pass (WebGPU, browser-gated) | ✅ | **heavy** |
| B7 | Procedural motion expressions (offset loop, inertial bounce, lag) | ✅ | light |
| B8a | Path modifier operators - trim / offset / roughen (pure, resolve-time) | ✅ | light |
| B8b | Shape morph + pucker/bloat + keyframable path (resample/correspondence/interp) | ✅ | medium |
| B8c | Dashed strokes (+ animated dash offset) on pen paths - pure geometry via existing pipeline | ✅ | medium |
| B8d | In-shape Repeater operator (per-copy transform accumulation) | ✅ | medium |
| B8e | Gradient strokes on pen paths (CPU-bake per-vertex, no shader) | ✅ | medium |
| B9a | Kinetic typography - motion presets (type-on, cascades) + Decode/scramble (pure) | ✅ | light |
| B9b | Text on a path (glyph placement + tangent orient; browser-eyeball placement) | ✅ | medium |
| B9c | Per-character 3D rotation (delta + stamp 3D wiring; camera-gated) | ✅ | medium |
| B9d | Per-glyph blur-in (per-stamp blur via existing pipeline) | ✅ | medium |
| B10a | Mask reveal wipes (iris + directional, pure - existing mask render) | ✅ | light |
| B10b | Track mattes - model + pure resolver pairing + UI + persist (composite pass browser-gated) | ✅ | medium |
| B10c | Freeform mask paths + per-vertex feather - model + pure resolver (coverage shader browser-gated) | ✅ | medium |
| B10d | Track-matte RTT composite (coverage math + guarded multipass composite pass) | ✅ (browser-verify-pending) | **heavy** |
| B10d-mask | Freeform-polygon mask coverage shader + path-mask authoring UI | ✅ (headless-GPU verified; in-app eyeball owed) | **heavy** |
| B10e | Basic roto / refine-edge (mask modes + expansion + colour-aware Refine Edge pass) | ✅ (headless-GPU verified; in-app eyeball owed) | **heavy** |
| B11a | Effect presets (save/apply stack) + effectsEnabled master-switch fix (pure) | ✅ | light |
| B11b | Adjustment layers - type + pure coverage resolver + resolve wiring + create UX + persist (harnessed) | ✅ | medium |
| B11b-gpu | Adjustment apply-below composite (RTT below-layers → effect stack → blit back; multipass surgery) | ✅ (headless-GPU verified; in-app eyeball owed) | **heavy** |
| B11c | Blend modes - W3C enum + pure reference math + routing table + Inspector dropdown (harnessed) | ✅ | medium |
| B11c-gpu | Content-layer blend rendering (hardware pipeline variants + dst-dependent scene composite) + cross-class effect reorder (multipass) | ⬜ (browser) ▶ **next** | **heavy** |
| B12 | Glow & light finishing - bloom mode + light-finish presets + param model + type scaffold (harnessed) | ✅ | medium |
| B12-gpu | Bloom downsample pyramid + light-wrap pass + star glints/streaks (WGSL) | ⬜ (browser) | **heavy** |
| B13 | Stylise & cinematic finish - curated stylise presets over existing effects (harnessed) | ✅ | medium |
| B13-gpu | Vignette WGSL case (the one missing stylise effect) | ✅ (browser-verify-pending) | light |
| B14 | Glitch & datamosh - curated glitch presets over existing frame-pure effects (harnessed) | ✅ | medium |
| B14-gpu | Pixel-sort + datamosh block-displacement WGSL cases | ✅ (browser-verify-pending) | medium |
| B15 | Color grading - LUT/.cube engine + curves + film-look grade tool (harnessed, renders now) | ✅ | medium |
| B15-gpu | HSL secondary color effect (hue/sat/lightness + hue-range gate) - additive WGSL case | ✅ (browser-verify-pending) | medium |
| B15-gpu-lut | Live per-layer 3D-LUT + curves in IMAGE_SHADER (3D-texture BIND surgery) + HSL-range modal UI | ⬜ (browser) | **heavy** |
| B16 | Light rays, flares & beams - light presets over existing effects + pure beam/lightning geometry (harnessed) | ✅ | **heavy** |
| B16-gpu | Beam/lightning FOUNDATION - new `beam` layer type + pure SDF shading (harnessed); renderer skips it | ✅ | **heavy** |
| B16-gpu-render | Isolated WGSL fragment-SDF beam pipeline that DRAWS the resolved beam (bind group + additive blend) | ⬜ (browser) | **heavy** |
| B17 | Tiling & generative simulations - sim presets over existing pattern engine + motion-tile param model (harnessed) | ✅ | medium |
| B17-gpu | Motion-tile warp effect (repeat + mirror + seamless scroll) - additive WGSL, mirrors tileUV | ✅ (browser-verify-pending) | medium |
| B18 | 3D scene completion (DOF/bokeh, lights & shadows, parallax, focus pull) | ⏭️ skip (3D) | **heavy** |
| B19 | Particle system polish - wind/attractor forces + dissolve emitter + 5 presets + frame-purity FIX (harnessed) | ✅ | **heavy** |
| B20 | Plexus - 2D connected-dots network (pure edge graph + particle line render + 2 presets, harnessed) | ✅ | medium |
| B21 | Physics dynamics - reviewed + hardened (velocity fix) + magnets/attraction + spring/jiggle force models (harnessed) | ✅ | **heavy** |
| B21-sim | Spring/rope/chain joints + soft-body via Rapier joints (browser/WASM) | ⬜ (browser) | **heavy** |
| B22 | 3D objects & extrusion (extruded text/logos, materials) | ⏭️ skip (3D) | **heavy** |
| B23 | Destruction generators - Voronoi fracture + explosion trajectory + card-dance grid/stagger engines (harnessed) | ✅ | medium |
| B23-render | Resolve/store expansion of shatter + card-dance into rendered clipped pieces | ⬜ (browser) | medium |
| B24 | Deformation & warp - puppet pin-mesh engine + deform presets over existing warps (harnessed) | ✅ | medium |
| B24-render | Puppet mesh-warp render (warp the layer texture through the deformed triangle mesh) | ⬜ (browser) | medium |
| B25 | Character rigging - 2-bone IK + FABRIK + rubber-hose + joystick blend solvers (harnessed) | ✅ | **heavy** |
| B25-rig | Rig binding (attach layers to a chain, pin/target handles) + limb render + rig UI | ⬜ (browser) | **heavy** |
| B26 | Transitions & preset system - harden the preset engine + whip/spin transitions (harnessed) | ✅ | light |
| B27 | Tracking & match-move - corner-pin homography + match-move/stabilize transform math (harnessed) | ✅ | **heavy** |
| B27-track | The tracker: follow point/planar features across video frames (NCC/optical-flow, browser) + UI | ⬜ (browser) | **heavy** |
| B28 | Keying - YCbCr chroma key + luma key + despill + choke/feather matte math (harnessed) + CPU-bake Chroma Key image tool (renders now) | ✅ | medium |
| B28-gpu | Live per-layer WGSL keyer: upgrade the frozen chromaKey effect (id 163) to YCbCr Cb/Cr distance + key-channel despill + multi-param/color-picker UI | ⬜ (browser) | medium |
| B29 | Footage cleanup & beauty - denoise + edge-preserving skin retouch (frequency separation, face-limited) + deflicker gain math (harnessed) + CPU-bake Retouch image tool (renders now) | ✅ | **heavy** |
| B29-video | Temporal deflicker apply: per-frame luma via video decode (sceneDetect-style) -> deflickerGains -> re-expose frames; + live per-layer WGSL denoise/retouch | ⬜ (browser) | **heavy** |
| B30 | Practical VFX compositing - curated light-leak/film-burn/atmosphere element catalog + sweep-keyframe generator (harnessed) + one-click add as a screen/add generativePattern (renders now) | ✅ | light |
| B31 | Audio-reactive - audio->keyframes (RMS envelope + beat pulses) driving a layer property, harnessed + renders now; animated counter already ships (animation-item) | ✅ | medium |
| B31-viz | Bar/circle spectrum visualiser - needs an offline FFT (nonexistent) + a bar/arc render (new animation-item type or a data-fed cloner) | ⬜ (browser) | medium |
| B31-data | Data binding (spreadsheet/JSON -> property) - CSV/JSON parser + authoring UI + bake-to-keyframes | ✅ | medium |
| B32 | Motion-design principle rigs - anticipation + follow-through/overshoot + squash & stretch + staggered offset as one-click keyframe rigs (harnessed, renders now) | ✅ | light |
| B32-render | Echo / motion trails / smears - temporal ghosting (transform echo feasible at resolve-time via the cloner staggered-time path; pixel-accurate echo needs a GPU accumulation pass) | ⬜ (browser) | medium |
| B32-secondary | Secondary motion (lag a child behind a parent) - spring-damped follow, baked to child keyframes | ✅ | medium |
| B33 | Colour keyframes - animatable shape fill / stroke and text colour (Vec4 AnimatableProperty + interpolation + hold swaps + Inspector stopwatch) for UI state changes (Bricks gap #1) | ✅ (agent + timeline; Inspector colour stopwatch owed) | medium |
| B34 | Null layer type ("New Null": invisible controller) + parenting UI (timeline parent picker / pick-whip) - nested controller rigs (Bricks gap #2) | ⬜ | light |
| B35 | Typing caret for type-on + UI-mock template kit (chat bubble with tail, search bar, notification, toggle pill, YouTube player, Discord card, fast-forward badge, "Scene N" card, section card) (Bricks gap #3) | 🟡 partial (caret + search bar / toggle / chat bubbles / notification shipped; YouTube, Discord, fast-forward, Scene N, section cards owed) | medium |
| B36 | Text animator completion - keyframable selector Start/End, skew + fill-colour deltas, multi-line glyph stamps, save-your-own animator preset (Bricks gap #4) | ⬜ partial (Nov 2026 wave 1B: Start/End keys, skew, fill colour, seeded order + scatter, multi-line stamps done; save-your-own preset left) | medium |
| B37 | SVG import as editable shape layers (path / rect / circle / ellipse / polygon / groups -> layers) instead of a flat raster (Bricks gap #5) | ⬜ | medium |
| B38 | Liquid-glass material - backdrop blur + refraction inside a shape outline, edge light sweep; track-matted adjustment layers (Bricks gap #6) | ⬜ (browser) | **heavy** |
| B39 | Editor ergonomics - in-app eyedropper (EyeDropper API), relative numeric entry (+400 / *2), copy / paste easing between properties (Bricks gap #8) | ⬜ | light |
| B40 | Property links - pick-whip UI + expressions that read another layer's property (Bricks gap #9) | ⬜ | medium |
| B41 | Background gradients - renderer drops stops 5-6 (bug) + 4-corner (mesh-like) gradient (Bricks gap #10) | ⬜ (browser) | light |
| B42 | Orbit / custom 2.5D debug view + bundle true italic serif faces for accent words (Bricks gap #11) | ⬜ | light |
| B43 | Text raster bounds: synthesized-italic (oblique) glyphs are clipped at the left/right of the text box, e.g. a word-initial italic "f" loses its hook (found in tutorial sample-01) | ✅ (headless-GPU verified) | light |
| B44 | Agent/MCP: one stacking model - render order follows track order, so `reorderLayers` (agent AND the UI's Bring to Front / Send to Back) has no visible effect; make it move the clip's track, add agent stack actions (MCP audit F10) | ⬜ | light |
| B45 | Agent/MCP: text layout correctness for agents - fixed / fixedWidth text boxes misplace per-glyph (animated, accent) stamps; range reveal presets (type-on, blur-in) show the first glyph before startFrame; optional agent clip length = comp length (MCP audit F9, F12, F13) | ✅ (Nov 2026, wave 1B, headless-GPU verified) | medium |
| B46 | Agent/MCP: authoring ergonomics - `agent.setKeyframes` with per-keyframe ease (bezier / named / hold) in one call, `agent.addShape` with clean defaults (no stroke, name, fill, radius), `agent.measureString` (no layer), background stack ids + tracks in get_state (MCP audit F14, F16, F21, F22) | ✅ | light |
| B47 | Agent/MCP: animatable effect parameters - glow intensity / radius / colour, shadow offset / blur / opacity as AnimatableProperty (pulses, logo stings), reachable via addKeyframe (MCP audit F15; colour part shares B33) | ✅ | medium |
| B48 | Agent/MCP: full-resolution frame render tool - `agent.renderFrame(frame, w?, h?)` / MCP `render_frame` + `render_strip` (offscreen renderer at comp size, export-quality motion blur, no DOM), for pixel-true taste checks and side-by-sides with reference videos (MCP audit F17) | ✅ (headless-GPU verified) | medium |
| B49 | Agent/MCP: session speed and robustness - warm boot (dist by default for production, reuse the tab across create_project), no 10 s first seek / first text batch, video + audio file import headless (`import_media {path}`) (MCP audit F3 remainder, F19) | ✅ import (wave 1B) / ⬜ speed | medium |
| B50 | Refs: keyframable layer Blur radius + effect-stack parameters (radial blur, pixelate, RGB split, glitch strength, saturation) as AnimatableProperty - extends B47 beyond glow / shadow (ref gap #2: r01 r02 r03 r05 r06) | ✅ | medium |
| B51 | Refs: agent-reachable cursor + click rig (expose `animation-templates/cursor.ts`: move-to-target, dwell, click squash, icon swap) - completes the B35 UI-mock kit (ref gap #5: r03 r06) | ✅ (headless-GPU verified) | light |
| B52 | Refs: font library - more bundled families (wide grotesque, rounded display, pixel, monoline script, geometric with alternates), 500 / 600 weights, true italic serif, `agent.importFont {path}` over `engine/customFonts.ts` (ref gap #6: r01 r02 r03; absorbs the italic part of B42) | ✅ (headless-GPU verified; Damion replaces Apache-licensed Yellowtail, files are WOFF) | medium |
| B53 | Refs: perspective cards - prove the 2.5D card render headless (`gpu:camera-cards`), corner pin for text / shape / precomp layers, agent camera move helpers (ref gap #4: r01 r03 r05 r07) | ✅ (headless-GPU verified) | medium |
| B54 | Refs: seeded pixel-block dissolve / build-on for any layer + 8-bit sparkle generator (ref gap #10: r01 r07) | ✅ | medium |
| B55 | Refs: word roll / slot swap text primitive (stepped or rolled vertical word list, in-place swap, per-row colour) (ref gap #11: r03 r04) | ⬜ | light |
| B56 | Refs: animatable text on path - keyframable `textPath.margin` + path-shape keyframes bound to the text (unfurl along a curl, text riding an opening mask edge) (ref gap #18: r05) | ⬜ | medium |
| B57 | Refs: effect stack on text / shape / precomp layers (today image + adjustment only) + layer-local bulge / mesh warp with animatable centre and radius (ref gap #12: r01 r05) | ✅ (headless-GPU verified; mesh warp not built) | **heavy** |
| B58 | Refs: gradient-blob field generator (soft animated blurred colour blobs, lumpy cloud floor; seeded, frame-pure) (ref gap #13: r06) | ⬜ | medium |
| B59 | Refs: script / logo write-on - stroke-order centreline trim reveal for filled glyphs and logos (ref gap #14: r03) | ⬜ | medium |
| B60 | Refs: cloner per-instance sources - render `ResolvedCloner.instanceSources` so each copy can be a different image (photo rings / grids) (ref gap #15: r04) | ✅ (headless-GPU verified) | medium |
| B61 | Refs: liquid drip / melt text (letters melt into glowing drips that run down and pool; seeded, frame-pure) (ref gap #21: r05, low priority) | ⬜ (browser) | **heavy** |
| B62 | Refs / F2: agent shape morph - `editor.setShapeMorph` (parametric poses: rounded rect / ellipse / star / polygon / points, per-pose ease incl. overshoot, auto start-point + winding alignment) + fix: path fill dropped half the polygon when the ring had a collinear point | ✅ | medium |
| B63 | Replicas: shape render correctness - SDF stroke clipped at the shape bounds (rings get flat sides), rounded rect wider than ~2048 px draws lens ends, circle ignores non-uniform scale (no ellipse), setShapeMorph ellipse pose with w != h has wrong geometry, borderRadius not clamped to min(w,h)/2, shape materialConfig radial gradient renders nothing, setShapeMorph with one pose (or a hold first pose) renders nothing, addShapeLayer polygon has no sides (found replicating r02 r04 r06 r07) | ✅ (Nov 2026, headless-GPU verified, `gpu:shape-render` 18/18) | medium |
| B64 | Replicas: text paint - stroke-only text (transparent fill + stroke) renders nothing; vertical linear gradient fill (angle 180) drops horizontal strokes (T / f crossbars), angle 90 shows no top-to-bottom ramp (found replicating r02 r04) | ✅ (Nov 2026, engine session 26 Nov, headless-GPU verified) | light |
| B65 | Replicas: agent video clip timing - video tracks are magnetic with no agent toggle: `editor.moveClipInTime` returns ok but does not move a video layer, every `import_media` of a video re-packs the earlier video clips back to back, `import_project` snaps inPoint-timed clips back to frame 0, a shape track matte over a video does not matte it (found replicating r07) | ⬜ | light |
| B66 | Replicas: motion blur from parent transforms - a layer moved / zoomed by a parent (or grand-parent) null gets much weaker blur than the same motion on the layer itself (r02 f6-16 zoom smear) | ⬜ (browser) | medium |
| B67 | Replicas: agent authoring ergonomics - setKeyframes accepts the breakdown ease names (easeOut, easeInOut, easeOutCubic ...; the replica kit aliases them today), createQuickText option to place by ink centre / baseline, glow defaults that show on coloured text, trim start angle option (12 o'clock), document that text layout trims leading / trailing spaces | ✅ (Nov 2026, engine session 26 Nov, headless-GPU verified) | light |
| B68 | Replicas: export fails on video - `export_mp4` (the real exporter) aborts with "A valid external Instance reference no longer exists" when a scaled, position-keyed H.264 clip is in the comp, while render_frame of the same frames works (suspect a VideoFrame closed while still bound via importExternalTexture in the export path; found replicating r07, ties into the EX plan) | ✅ (browser) | medium |
| B69 | Replicas: adjustment-layer masks - `editor.addMask` on an adjustment layer leaves the layer with no `masks` array (get_layer shows none), so an adjustment effect (glitch, RGB split) cannot be limited to a region; r01 f168-176 title glitch hits the whole frame (found replicating r01) | ⬜ | light |
| B70 | Replicas: cursor rig robustness - `findCursorRig` (cursorRig.ts) finds the icon children only by the names arrow / hand / ibeam, so renaming them breaks cursorMoveTo / cursorClick / cursorIcon; a layer added at a later frame goes onto the first same-type track with free space (`ensureLayerHasTrack` findFirstFit) and renders under later shots' grounds (ties to B44). Both confirmed in source, not render-tested (found replicating r03 f1838-2589) | ⬜ | light |
| B71 | Replicas: path stroke width profile - a path stroke has one width per layer: add taper / per-vertex width along the path (r03 S34 line fans merge into a tapering bundle, f3436-3525) (found replicating r03) | ⬜ (browser) | medium |
| B72 | Replicas: kit / measurement ergonomics - replica-kit `text({lineHeight})` writes `content.spans.0.style.lineHeight` but the renderer reads `animOverrides.lineHeight` (option silently ignored; write both); `measure_text` returns an ink box equal to the line box for VT323 (not tight to the glyph ink) (found replicating r01) | ⬜ | light |
| B73 | Replicas: render defects to reproduce (low confidence) - `editor.setShapeDash` on a 1 px tall stroked rect or a 2-point open path renders nothing (r01 f206-300); a text selector with shape 'square', start 0 and keyed `end` hides almost every glyph (r01 probe3); transform.rotation keys on some 3D-toggled text layers do not render (r05 f21-32, probe6). Repro each in a headless gpu check before fixing (found replicating r01 r05) | ⬜ (browser) | light |
| B74 | Refs: conic (angular) gradient fill on shapes with a keyframable start angle - the spinning hue colour-wheel ring (conic exists only on text fills today) (r08) | ✅ (headless-GPU verified) | light |
| B75 | Refs: styled number counter on a text layer - count between values with decimals, thousands separators / K-M suffix, prefix / suffix, any font and style (italic), eased (r08 view multipliers, follower count) | ✅ (headless-GPU verified) | light |
| B76 | Refs: design-tool UI kit - pen / crosshair / rotate / direct-select cursor icons, a selection box with handles that follows a layer's bounds, anchor squares, live dX / dY / W / H / angle tooltip readouts, smart-guide labels (extends the B51 cursor rig) (r11) | ⬜ | medium |
| B77 | Refs: text style keyframes - hold-keyed font family / weight / style switches on one text layer (type-style switcher) (r10) | ✅ (headless-GPU verified) | light |
| B78 | Refs: soft freeform matte - a blurred / feathered shape used as a track matte keeps its blur (flower-shaped soft reveal) (r10) | ⬜ (browser) | medium |
| B79 | Refs: person matte on footage (AI roto) - creator pops out over a divider (r09); fallback a pre-keyed stand-in clip | ⬜ (browser) | **heavy** |
| B80 | Refs: outline text robustness - `editor.outlineTextLayer` on imported fonts, and glyphs with separate parts (i, j, !, :) keep the dot / second contour (r11, read in the code) | ⬜ | light |
| PB1 | Playback: decoded-frame LRU on the mediabunny path (backward/oscillating scrubs hit the cache instead of re-walking the GOP) | ✅ | medium |
| PB2a | Playback: keyframe-snap-then-refine on far seeks (kills the scrub freeze) | ✅ | medium |
| PB2b | Playback: real half-res proxy decode (cuts 4K upload/convert cost during scrub) | ✅ | heavy |
| PB3 | Playback: frame-keyed resolve memoization (coarse whole-frame memo shipped; per-layer dirty-skip deferred) | ✅ | heavy |
| PB4a | Playback: proxy-planning policy (which footage gets a proxy; target dims + GOP) | ✅ | light |
| PB4b | Playback: background low-res proxy transcode + fail-open preview routing (fresh-import, in-session) | ✅ | heavy |
| PB4c | Playback: persist the proxy to OPFS (survive reload; apply to reloaded projects instead of re-transcoding) | ✅ | medium |
| PB5a | Playback: global decode-cursor budget (fail-open; prevents black frames with many clips) | ✅ | medium |
| PB5b | Playback: adaptive prefetch lookahead + cursor-pool-sizing (NOT fail-open; invariant-constrained) | ⬜ (browser) | medium |
| PB6 | Playback: filmstrip/thumbnail decode lane separation + OPFS sprite-sheet cache | ✅ (browser scrub-test owed) | medium |
| PB7 | Playback: range-stream URL assets (UrlSource) + pure chunk-range planner | ✅ | medium |
| PB7-gpu | Playback: zero-copy importExternalTexture upload for playing frames (texture_external pipeline fork) | ⬜ (browser) | **heavy** |
| PB7-lazy | Playback: lazy CustomSource chunked-local read (wire the chunk-range planner into decode) | ⬜ (browser) | medium |

---

## B1 - Easing engine core ✅ DONE
**Delivers:** true Penner family + Back/Elastic/Bounce eases; `Keyframe.easing`; one canonical `segmentProgress` shared by renderer + graph editor; fixed the render-read-both-handles-off-start bug and the `handle||default` zero-clobber. **Categories:** 1. **Files:** `core/easings.ts`, `core/keyframeEase.ts`, `core/interpolation.ts`, `core/types.ts`, `InterpolationGraph.tsx`, `store/editor.ts` (`setKeyframeEasing`), `menuDefinitions.ts`. **Verify:** `verify:easing` (19 checks).

## B2 - Graph Editor Pro ✅ DONE
**Delivered:** **Speed Graph** toggle (read-only velocity-over-time curve - the derivative of the value curve, with its own value/s scale, a zero line, and keyframe ticks) beside the Value Graph; the numeric handle strip now shows the **AE Keyframe-Velocity model** - **Influence %** and **Speed (value/s)** for the In and Out sides (round-trip-safe converters in `core/keyframeEase.ts`); **F9 / Shift+F9 / Ctrl+Shift+F9** easy-ease hotkeys on the current keyframe selection; `setKeyframeInterpolation` now clears any named ease so Linear/Ease/F9 correctly override an elastic/bounce. **Files:** `core/keyframeEase.ts` (influence↔handle helpers), `InterpolationGraph.tsx`, `App.tsx` (F9), `store/editor.ts`, `menuDefinitions.ts` (exported ease constants), new `ui/panels/keyframeSelection.ts` (shared selection resolver). **Verify:** `verify:easing` (now 22 checks - incl. influence↔handle round-trip). **Deferred:** dragging on the Speed Graph itself (read-only for now).

## B3a - Spatial motion path ✅ DONE
**Delivered:** ordinary position keyframes now travel a **curved path through space** (arc-length-parameterized cubic bezier, so eased time = constant speed along the arc), separate from temporal easing. `Keyframe.spatialIn/spatialOut/spatialMode`; a pure `core/positionPath.ts` (bezier + arc-length reparam + auto-tangents); `interpolation.ts` uses it for any position segment carrying tangents (every other vec2 property is untouched). Keyframe context menu → **Motion Path: Smooth (Auto Bezier)** / **Linear** (`setKeyframeSpatialMode`, auto-computes smooth tangents from neighbours). The "Show Motion Paths" overlay draws the curved path for all layers and **per-frame spacing dots** for the selected layer (capped at 240) - the velocity/weight X-ray. **Verify:** `verify:spatial-path` (7 checks - endpoints, constant-speed arc-length, straight-vs-curved, auto-tangent smoothness). **Categories:** 1.

## B3b - Motion-path tangent handles + roving ✅ DONE
**Delivered:** **draggable spatial tangent handles** on the selected layer's position path (`PositionPathOverlay.tsx`) - plain drag keeps the handle mirrored (smooth), Alt-drag breaks it (independent); Auto→Bezier on first drag; one undo entry per drag (batched `updateLayerProperty` + `commitDrag`). **Roving** via `roveKeyframesAcrossTime` (redistributes the middle position keyframes' frames by arc length so speed is constant along the whole path - a keyframe-assistant retiming, no eval change), on the "Motion Path (Spatial)" context group alongside Smooth/Linear. Engine helpers `segmentArcLength` + `framesFromCumLengths` in `core/positionPath.ts`. **Verify:** `verify:spatial-path` (now 11 checks - adds arc-length + roving distribution). **Categories:** 1. **Deferred:** Separate Dimensions → B3c (a data-model change, kept separate to stay bulletproof).

## B3c - Separate dimensions ✅ DONE
**Delivered:** **Separate Dimensions** - position can split into independent X / Y scalar curves (`AnimatableProperty.separated` + `keyframesX`/`keyframesY`), each with its own keyframes/timing/easing. `evaluateProperty` branches on `separated` so ALL read-sites (inspector, overlays, snapping, renderer) get the separated position for free - no call-site refactor. `toggleSeparateDimensions` (motion-preserving: split bakes byte-identical per-axis curves, re-couple merges the union of frames) + `addSeparatedKeyframe`; pure split/merge/eval in `core/separateDimensions.ts`; round-trips through `validation.ts`. Inspector shows a Separate/Combine toggle + independent X/Y rows when separated; the combined Position track is hidden from timeline/graph while separated (per-axis timeline/graph editing = a later follow-up - edit X/Y in the Inspector), and spatial motion-path handles are combined-mode only (mutually exclusive). **Verify:** `verify:separate-dims` (7 checks - split preserves motion byte-stable, independence, merge/round-trip). **Categories:** 1. **(B3 fully complete.)** **Categories:** 1 (*Separate Dimensions*). **Depends on:** B1/B3a (✅). **Perf:** light - pure eval; a data-model change touching the Transform model, the position evaluator, the inspector position row, the keyframe timeline/graph property extraction, and serialization/validation (so it round-trips). **Likely files:** `core/types.ts` (separated position representation / `dimensionsSeparated` flag + `positionX`/`positionY` props or equivalent), `core/interpolation.ts`, `store/editor.ts` (separate/re-couple action that bakes the current path into per-axis keyframes), `Inspector.tsx` + `keyframeSelection.ts`/`InterpolationGraph.tsx`, `project-system/services/validation.ts`. **Verify:** `verify:separate-dims` (X and Y evaluate on independent curves/timings; separate→re-couple round-trips the sampled motion).

## B4a - Composition motion-blur finishing ✅ DONE
**Delivered:** composition-level **Shutter Angle** (global streak master; per-layer shutter is now a relative factor, so existing projects render identically - verified), **Shutter Phase** (0 centres / − trails / + leads, via a new `u.phase` sample offset in the blur shader), and **Samples** (full-quality target, still scaled down by preview quality) - all in Composition Settings. Pure maths in `core/shutter.ts`; `ResolvedMotionBlur.phase`; `computeMotionBlur` takes the comp shutter; renderer BlurU `_pad`→`phase`; `getMotionBlurSamples(quality, base)` threads comp samples in `Viewport` + `ReviewViewport`. **Verify:** `verify:shutter` (5 checks - non-breaking default, global scaling, clamp, phase sign; the WGSL blur is browser-verified). **Categories:** 1.

## B4b - Keyframe assistants (Smoother + Wiggler) ✅ DONE
**Delivered:** **The Smoother** (`smoothKeyframes`) rounds jittery selected keyframe VALUES with a weighted moving average, pinning the endpoints; **The Wiggler** (`wiggleKeyframes`) adds seeded organic tremble (±amplitude) to the interior selected values - deterministic given (selection, amplitude, seed), the menu rolls a fresh seed each apply. Both handle number + vec2 (per component; X/Y wiggle independently). Pure ops in a new leaf module `core/keyframeAssistants.ts` (no `interpolation` import, so it's harnessable - house `mulberry32`); two undoable store actions via `mapKeyframesByPath`; exposed in the keyframe context menu's Multi-Keyframe group ("Smoother (round values)" / "Wiggler…"). Both need ≥3 selected keyframes (bake a held range first for a dense wiggle). **Verify:** `verify:keyframe-assistants` (9 checks - roughness reduction + endpoint pinning; seed-determinism, amplitude bound, per-component vec2). **Categories:** 1. **(B4 fully complete.)** Motion Sketch (live gesture capture) intentionally deferred - a distinct interaction feature, not a keyframe-array op.

## B5a - Time-remap model + speed ramps + Exponential Scale ✅ DONE
**Delivered:** animated **Time Remap** on video layers - `VideoLayer.video.timeRemap` (an `AnimatableProperty` whose value is SOURCE seconds). `resolveVideoLayer` now routes through a pure `core/timeRemap.ts` (`linearSourceSeconds` / `sourceFrameFromSeconds`, byte-identical to the old constant-rate path) and, when a remap curve is present, evaluates it - superseding playbackRate/reverse/freeze. **Speed ramps** come for free by easing the remap curve (B1 easing + graph editor); freeze = flatten, reverse = descend. Enabling seeds an identity curve (2 keyframes) so nothing changes until shaped (`setVideoTimeRemap`, motion-preserving). **Exponential Scale** added to the pure `core/keyframeAssistants.ts` (`exponentialScaleSelected` - geometric ramp, constant ratio/frame, per-component vec2, linear fallback for non-positive) + `exponentialScaleKeyframes` store action + context-menu item. Inspector video section gets a Remap On/Off toggle + a keyframable "Src s" control; round-trips through `validation.ts`. **Verify:** `verify:time-remap` (7 checks - byte-identical linear mapping, reverse descends, identity seed, exponential constant-ratio/monotonic). **Categories:** 2 (+ Cat-1 tail: Exponential Scale). **Deferred:** frame-mix blending → B5b.

## B5b - Frame-mix frame blending ✅ DONE
**Delivered:** **Frame Mix** for retimed/slowed video - a `video.frameBlend` toggle. `resolveVideoLayer` computes the fractional source position (`frameBlendSplit` in `core/timeRemap.ts` → frameA/frameB/mix), and `resolveFrame` **expands** a frame-blended clip into a second resolved video layer at frameB drawn on top at opacity = mix - a cross-dissolve through the EXISTING image pipeline (the cloner-stamp pattern; a synthetic `id:fb` keys its own decoded texture). **No shader / bind-layout change**, so no risk to the shared render path; when off (default) resolve is byte-identical. `mix` is 0 on an exact frame or at the last frame, so a blend never invents content past the source. Round-trips via `validation.ts`; Inspector video section gets a Frame Mix On/Off toggle. **Verify:** `verify:time-remap` extended (4 frameBlendSplit checks - straddling frames + mix, exact→0, last-frame clamp, before-start/NaN). **Perf:** decodes one extra source frame per blended layer (opt-in). **Categories:** 2, 1. **Browser-gated:** the actual two-frame decode + composite is WebCodecs/WebGPU - the split math is harnessed; the visible blend needs a browser eyeball.

## B6a - Optical-flow retiming foundation ✅ DONE
**Delivered:** the node-verifiable foundation for optical-flow retiming. `video.retimeInterp: 'mix' | 'flow'` (default mix) - a per-clip Interpolation selector (Mix / Optical Flow) in the Inspector, shown when Frame Mix is on and **honestly labelled** that Optical Flow currently previews as Mix until the GPU pass (B6b) is wired. Pure `core/opticalFlow.ts` (`warpT`, `flowFieldKey` - a per-frame-pair/resolution/quality cache key so flow isn't recomputed on scrub, `shouldWarp`); `ResolvedVideo.interp` carries the mode; round-trips via `validation.ts`. **Audit finding:** the engine has NO compute infrastructure, so B6b will do flow as iterative ping-pong FRAGMENT passes + a precomp-style warp pre-pass (reusing the Kawase N-pass + `ensurePrecompTexture` patterns, no shared-render-path change). **Verify:** `verify:optical-flow` (warpT clamp, cache-key distinctness, shouldWarp truth table). **Categories:** 2, 1.

## B6b - Optical-flow GPU estimator + warp pre-pass ✅ DONE (shader browser-verify-pending)
**Delivered:** the **motion-compensated warp** for `interp:'flow'` slow-mo. `engine/video/opticalFlow.ts` holds a single-pass gradient (Lucas-Kanade-style) WGSL shader (`FLOW_WARP_SHADER` + `FLOW_UNIFORM_SIZE`, plain string, no GPU calls → type-checks in CI): per pixel it estimates a small local flow from spatial+temporal luma gradients, samples frameA forward along `t`·flow and frameB backward along `(1−t)`·flow, cross-fades by `t` (identity at t=0/1). `renderer.ts` builds the pipeline **lazily and guarded** (`ensureFlowWarp` - `pushErrorScope('validation')` + async `popErrorScope` disables on a bad shader; try/catch on build) and runs `tryFlowWarp` in its **own encoder+submit** into a pooled per-layer texture (`ensureFlowTexture`, sized to texA's actual pixel dims so the `uv=pos.xy/dims` identity mapping holds); frameB is decoded into a synthetic `${id}:fbw` cache slot. In the video loop the warped view **replaces** the crisp texture at bind slot 2 only when `interp==='flow' && sourceFrameB!=null && blendMix`; **any** failure (texB not decoded yet, pipeline null, exception) returns null → falls back to the crisp frameA. `interpolation.ts` skips the B5b `:fb` cross-dissolve overlay when `interp==='flow'` (the warp already blends both frames in one texture - no double-composite). **Opt-in, off by default** - non-flow video is byte-identical. **Perf:** one extra fullscreen-triangle pass + one decoded-frame texture per active flow layer. **⚠ The WGSL is browser-verify-pending** - WGSL neither compiles nor runs here (tsc/build/harness don't check shader bodies); the flow *look* and shader validity must be confirmed in a WebGPU browser. Safe by construction: guarded init + frame-A fallback means a broken/invalid shader can never break the renderer or existing (mix/off) video. **Files:** `engine/video/opticalFlow.ts` (NEW), `engine/renderer.ts` (`flowWarp`/`flowUniformBuf`/`flowTexPool` fields + `ensureFlowWarp`/`ensureFlowTexture`/`tryFlowWarp` + video-loop swap), `core/interpolation.ts` (`:fb` gated on `interp!=='flow'`). **Verify:** `verify:optical-flow` (pure helpers, unchanged, 3 checks) + all 62 harnesses green; shader is browser-verified. **Deferred to a later batch:** pyramidal/iterative flow (this is single-level → degrades to cross-dissolve for large motion), a flow-field `LruCache`, and **pixel/rendered motion blur on footage** (flow-driven blur pass) - none blocking; can fold into a B6c or the motion-blur batch.

## B6 - Optical-flow retiming & pixel motion blur
**Delivers:** motion-estimated in-between frames for **buttery slow-motion** (Twixtor/Kronos look) and **pixel/rendered motion blur** added to sharp footage. **Categories:** 2, 1. **Perf:** **HEAVY** - GPU optical-flow; needs its own profiling + LOD/preview-quality gating. **Likely files:** new `engine/video/opticalFlow.*` (WGSL), renderer hooks. **Verify:** `verify:*` for the flow-vector math where pure; browser-gated for the GPU pass.

## B7 - Procedural motion expressions
**Delivers:** complete the expression motion vocabulary - `loopOut/loopIn('offset')`, an **inertial bounce / spring** expression (auto overshoot-and-settle on any keyframes), `posterizeTime`, `valueAtTime`-based **lag/delay/follow** (secondary motion). **Categories:** 6, 1. **Depends on:** B1. **Perf:** worker-evaluated already; pure. **Likely files:** `expressions/worker.ts`, `expressions/types.ts`. **Verify:** `verify:expressions-motion` (offset loop continuity, bounce decay, lag offset).

## B8 - Shape motion completion ✅ COMPLETE (a–e) (SPLIT - audit found a foundational gap)
Audit (subagent) verdict: shape **paths are not keyframable** and there is **no per-frame path modifier stack**, so the whole set can't land in one prompt. Also already-built (don't rebuild): **merge/boolean** (`core/pathOps.ts`, destructive + compound, wired), **repeater** (the `src/cloner/` system already does layer-level radial/grid arrays of a shape - an *in-shape* Repeater operator is the only gap), and **gradient stroke** on SDF shapes (only the pen-path tessellation path lacks it). Split:

### B8a - Path modifier operators ✅ DONE
**Delivered:** a non-destructive **path modifier stack** on shape layers, applied at RESOLVE time so the existing polygon tessellator draws the result with **zero renderer change**. Pure ops in `core/shapeModifiers.ts` (leaf; imports only `core/bend`'s `evalCubic`): **Trim Paths** (draw-on - arc-length window with start/end/offset, wraps across the seam on closed paths, full window returns the original vertices byte-identical), **Offset Paths** (parallel inset/outset via outward miter bisector, miter-limit capped, winding-agnostic via centroid orientation), **Roughen** (subdivide + seeded per-normal displacement, frame-pure via house mulberry32). `ShapeModifier` union + `ShapeLayer.modifiers?` in types; `createShapeModifier` factory; `resolveShapeLayer` evaluates the stack (`resolveShapeModifiers` → `applyResolvedModifiers`) - **absent modifiers = byte-identical** (opt-in). Store: `addShapeModifier`/`removeShapeModifier`/`toggleShapeModifier` (undoable); params are AnimatableProperty edited through the generic `updateLayerProperty`/`addKeyframe` on `modifiers.<i>.<param>` dot-paths (so they **keyframe like any property** - animated draw-on/offset/roughen for free). Inspector "Path Modifiers" section (add Trim/Offset/Roughen, per-modifier eye-toggle + delete + param drags + Roughen reseed), shown on polygon shapes. Persistence via `ensureShapeModifiers` in validation.ts (structurally sanitized). **Scope:** polygon (pen-path) shapes only - SDF rect/circle/star modifier support needs a shapeToPathVertices conversion + render-path switch (a browser-verifiable follow-up). **Verify:** `verify:shape-motion` (17 checks: trim boundary/seam-wrap/empty/full, offset exact ±per-side + miter cap + identity, roughen determinism/bound/closed, stack compose + short-circuit). 64 harnesses total. tsc 0, lint 125, build ok.

### B8b - Shape morph + pucker/bloat + keyframable path ✅ DONE
**Delivered:** **animatable pen-path outline (shape morph)** + **Pucker & Bloat**, both pure and resolve-time (no renderer change - the tessellator draws the emitted `PathVertex[]`). In `core/shapeModifiers.ts`: `evalPathKeyframes` (at/beyond a pose → the pose's ORIGINAL bezier vertices byte-identical; strictly between poses → a morph), `morphPaths` (arc-length **resample both poses to a common point count** → index correspondence → lerp, so **different vertex counts morph** - square→triangle works), `resampleToN`, and `puckerBloat` (bows each edge out/in via `amount·sin(π·tLocal)` while anchors stay put - the flower/spike look, not a scale). Model: `PathKeyframe` + `PolygonShape.pathKeyframes?` (optional → static `vertices` unchanged when absent); `PuckerBloatModifier` added to the `ShapeModifier` union + `createShapeModifier`. Resolve: `resolveShapeLayer` evaluates the outline pose FIRST, then the modifier stack. Store: `addPathPose` (snapshot current vertices@playhead, replace any at that frame, sorted) / `removePathPose` (undoable); pucker keyframes via the generic dot-path actions. Inspector: "Path Animation" (Add Pose + pose list) and the Pucker row, on polygon shapes. Persistence: `pathKeyframes` in `ensureShapeGeometry`, pucker in `ensureShapeModifiers`. **Scope/limits:** morph correspondence is index-0 arc-length (a correspondence-offset control is a refinement); poses are snapshots of the editable base `vertices` (re-Add at a frame to update a pose); path-edit tools still edit the base, not per-pose (AE-style per-keyframe path editing is a later refinement). **Verify:** `verify:shape-motion` extended to **29 checks** (pucker sign/anchors, morph endpoints/midpoint/identity, evalPathKeyframes at-pose/between/clamp/hold/different-counts). tsc 0, lint 125, build ok, 64 harnesses.

### B8c - Dashed strokes ✅ DONE (gradient-stroke split to B8e)
**Delivered:** **dashed & dotted strokes** on pen-path (polygon) shapes, with an **animatable dash offset** (marching ants). A stroke-rendering audit found the pen-path stroke is CPU-tessellated `[x,y,r,g,b,a]` quads in one draw (`engine/pathTessellation.ts`), so dashing is **pure geometry, no shader**: the pure `dashPath` (in `core/shapeModifiers.ts`) splits the outline into the pattern's "on" runs by arc length (SVG semantics - odd arrays doubled, `dashOffset` shifts the pattern; the FILL is untouched), and `tessellatePath` strokes each dash run as an open sub-path (caps apply) through the **existing** pipeline. Model: `PolygonShape.strokeDash?: number[]` + animatable `dashOffset?`; `ResolvedShape.dashArray`/`dashOffset`; threaded via `TessellateOptions` + folded into the tessellation cache signature so dashed geometry re-tessellates on change. Store `setShapeDash` (undoable, auto-creates the animatable offset on enable); offset keyframes via the generic `shape.dashOffset` dot-path. Inspector "Dashes" presets (Solid/Dashed/Dotted/Dash-dot) + Dash Off drag. Persistence in `ensureShapeGeometry`. **Verify:** `verify:shape-motion` extended with 6 dash checks (counts/positions, offset shift, empty passthrough, odd-array doubling, dash lengths, closed perimeter) → **35 checks total**; the render is the existing proven pipeline (no new GPU). tsc 0, lint 125, build ok, 64 harnesses. **Fully bulletproof / node-verifiable** - nothing browser-gated here.

### B8d - In-shape Repeater operator ✅ DONE
**Delivered:** AE's per-shape **Repeater** - N accumulated copies of a shape (radial arrays, spirals, ladders) with an opacity ramp. Pure `repeaterTransforms` (in `core/shapeModifiers.ts`) computes each copy's offset/rotation/scale/opacity, accumulating the per-copy delta UNDER the growing rotation+scale (copy i offset = Σ_{k<i} scale^k·R(k·rot)·offset) - so rotation fans a radial array and scale makes a spiral, exactly like AE. Expanded at **resolve time** into N resolved shape layers reusing the SAME resolved geometry at accumulated transforms (the cloner-stamp / frame-mix pattern) - **no renderer change**; absent/disabled → a single byte-identical shape. Works for **every** shape type (rect/circle/star/polygon). Model: `ShapeRepeater` + `ShapeLayer.repeater?`; `createShapeRepeater` factory; `MAX_REPEATER_COPIES=300` cap. Store `toggleShapeRepeater` (undoable); params keyframe via the generic `repeater.<param>` dot-paths. Inspector "Repeater" toggle + Copies/Offset X·Y/Rotation/Scale/Start·End Opacity drags. Persistence via `ensureShapeRepeater`. **Perf note:** each copy tessellates independently (distinct layer id) - identical geometry, so N copies = N tessellations; fine for typical counts, a shared-buffer instanced draw is a future optimization. **Verify:** `verify:shape-motion` +5 repeater checks (count 0/1, linear march, radial 90°, spiral scale, opacity ramp) → **40 checks total**. tsc 0, lint 125, build ok, 64 harnesses.

### B8e - Gradient strokes on pen paths ✅ DONE
**Delivered:** the multi-layer gradient **stroke** on pen-path (polygon) shapes (`strokeMaterialConfig` → `ResolvedShape.stroke` was already resolved for polygons but ignored by the path pipeline; SDF shapes already rendered it). Took the audit's **CPU-bake (Option A)** - no shader change: pure `core/fillSampler.ts` (`sampleResolvedFill`) is a faithful port of the shape gradient shader (`gradientT`/`sampleGradientLayer`/`sampleFill`/`blendChannel`/`blendRGB`, all 12 W3C blend modes), and `pathTessellation.ts`'s `buildStroke`/`addJoin`/`addCap` now take a per-vertex `colorAt` - for a gradient stroke it samples the resolved fill at each stroke-vertex's **box-uv** (same bounding-box mapping SDF shapes use), so the baked stroke matches an SDF shape's gradient (Gouraud-interpolated across the dense per-segment quads). Flat strokes pass `() => strokeColor` → **byte-identical**. Threaded via `TessellateOptions.strokeFill` + folded into the tessellation cache signature; renderer passes `s.stroke`. **No new UI** - the existing Material panel already sets a stroke gradient on any shape. Composes with dashes (each dash run is gradient-stroked). **Quality note:** per-vertex Gouraud (not per-pixel); a WGSL `sampleFill` port into `PATH_SHADER` + uv attribute would make it per-pixel exact (browser-gated) - a future upgrade, not needed for correctness. **Verify:** new `verify:fill-sampler` (8 checks: solid, linear/radial stops, clamp, single-stop, multiply blend, transparent). tsc 0, lint 125, build ok, **65 harnesses**. **Fully node-verifiable** - the sampler math is proven; only the on-GPU Gouraud *look* is browser-verified.

**B8 is now COMPLETE (a–e): trim/offset/roughen modifiers, shape morph + keyframable path + pucker/bloat, dashed strokes, in-shape Repeater, gradient strokes.**

## B9 - Kinetic typography completion ✅ COMPLETE (a–d) (SPLIT)
Audit: a strong range-selector + text-animator core already exists, with per-glyph animation done via **stamp expansion** (`expandTextGlyphs` splits a text layer into one 1-char `ResolvedLayer` per glyph - like the cloner, ZERO renderer changes; single visual line only, glyph x/y from canvas measurement = browser-gated placement). So type-on/cascades are new PRESETS, decode is a pure content-swap through the existing stamps, and the remaining pieces (path/3D/blur) are render-gated. Split accordingly.

### B9a - Motion presets + Decode/scramble ✅ DONE
**Delivered:** (1) **Preset library** on the existing animator engine - `type-on` (typewriter, `square` selector + opacity), `cascade up by word`, `slide in`, `rise by line`, `tumble in` (+ the shipped fade-in/pop-in) in `core/textAnimatorPresets.ts`, surfaced as one-click "+" buttons in the animator editor. Pure/config-only, proven by the existing preset path. (2) **Text Decode / scramble** - new pure `core/textDecode.ts` (`decodeContent`/`decodeCharAt`/`scrambleCharAt`/`isGlyphRevealed`): unrevealed glyphs flicker through a seeded charset and lock left→right as `progress` (0..1, keyframed) sweeps; **frame-deterministic** (hash of index+time-bucket, no Math.random/Date). `TextDecode` type + `TextLayer.decode?`; `createTextDecode` factory; wired into `expandTextGlyphs` (swaps the SHOWN char per stamp - advances/positions still use the real char so glyphs flicker in place; **no renderer change**). Decode section in `TextAnimatorEditor` (enable, reveal start/duration, flicker frames, seed+reseed, charset), persisted via `ensureTextDecode`. **Verify:** new `verify:text-kinetic` (9 checks: full-reveal passthrough, all-scrambled charset membership + spaces preserved, left→right prefix lock, reveal monotonicity, determinism, time-bucket flicker/hold, seed variation, empty-charset guard). tsc 0, lint 125, build ok, **66 harnesses**. Fully node-verifiable (glyph placement browser-gated as before).

### B9b - Text on a path ✅ DONE
**Delivered:** glyphs flow along a referenced MotionPath with optional tangent orientation. New pure `core/textPath.ts` (`totalPathLength`, `pointAndAngleAt`, `glyphPathFraction`) - a self-contained cubic sampler with **TRUE arc-length reparameterization** (a dense LUT), so glyphs are **evenly spaced** (a straight 2-node path doesn't bunch them, unlike motionPath.ts's parameter-space walk). It imports no interpolation engine → node-harnessable. `TextPathBinding` + `TextLayer.textPath?` (pathId → a `composition.motionPaths` entry, interpreted in the layer's LOCAL space; align + margin). Wired into `expandTextGlyphs`: each glyph's along-text center distance → arc fraction → path point + tangent, replacing the linear x/y; the pivot offset + `composeTransforms(world, …)` apply the layer transform identically (no renderer change). Picker UI in `TextAnimatorEditor` (path dropdown labeled by owning layer, margin, align toggle); persisted via `ensureTextPath`. **Perf:** medium; the placement maths is unit-tested, exact on-canvas placement is browser-eyeballed (glyph advances come from canvas measurement - same class as the existing cascades). **Verify:** `verify:text-kinetic` +5 path checks (arc length, horizontal/vertical position+tangent, fraction mapping+clamp, glyph-maps-onto-path) → **14 checks**. tsc 0, lint 125, build ok, 66 harnesses.

### B9c - Per-character 3D rotation ✅ DONE
**Delivered:** per-glyph out-of-plane spin (X/Y) on a 3D text layer. **No new shader, and - it turned out - no `worldMatrix` needed**: `writeCard3D` builds the card MVP directly from `layer.transform` (rotationX/Y/positionZ) + `layer.is3D`. Extended `TextAnimatorDelta` (`rotationX?`/`rotationY?`) + `GlyphDelta` (`rx`/`ry`, accumulated) - pure; the stamp now sets `rotationX = rx`, `rotationY = ry` (was hardcoded 0), `composeTransforms` adds the layer's own 3D rotation, and stamps get `is3D` from the text layer so `writeCard3D` fires under the active camera. Editor gains 3D Rot X/Y fields; delta persists via the existing wholesale cast. **Perf:** medium; delta math node-verified (`verify:textanimator` +1 → 12), the 3D visual browser-eyeballed (reuses the proven 3D card path).

### B9d - Per-glyph blur-in ✅ DONE
**Delivered:** blur-in cascade (glyphs resolve from blurry). Turned out to need **no new render**: every expanded layer already carries its `blur` into the draw (`blurFx = expandedLayers[i].blur`) and the existing per-layer blur pipeline renders each text stamp. Added `TextAnimatorDelta.blur?` + `GlyphDelta.blur` (accumulated, clamped ≥0); `expandTextGlyphs` builds a per-stamp gaussian `ResolvedBlur` = base blur + the glyph's accumulated blur (absent → the shared base is untouched). New `blur-in` preset + a Blur field in the editor. **Perf:** medium (one blur pass per blurry glyph via the existing pipeline). **Verify:** `verify:textanimator` +1 (13 checks). tsc 0, lint 125, build ok, 66 harnesses.

**B9 COMPLETE (a–d): type-on + cascade presets, Decode/scramble, text-on-path, per-char 3D rotation, per-glyph blur-in.**

## B10 - Masks / track mattes / roto completion (SPLIT)
Audit: FlashFX masks are **analytic/parametric SDF primitives** (rectangle/ellipse/star/polygon with animatable position/size/rotation + a **single** feather scalar) - NOT freeform `PathVertex[]` outlines, no per-vertex feather, no mask blend mode, no track mattes, no roto. So several asks are blocked at the DATA MODEL + need new shaders (browser-gated). Only mask-reveal wipes are pure/complete on the existing render. Split:

### B10a - Mask reveal wipes ✅ DONE
**Delivered:** one-click **iris + directional wipe** reveals that keyframe an EXISTING mask's position+size so the masked content wipes on over ~1s from the playhead (the mask's current size is the fully-revealed end state). Pure `core/maskReveal.ts` (`buildMaskReveal`, `MASK_REVEAL_KINDS`: iris-in, wipe →/←/↓/↑) - each collapses the mask to a sliver/point anchored to the right edge and grows it back, so the reveal uses the **shipping SDF+feather mask shader with no engine change**. Store `applyMaskReveal` (undoable; sets position/size keyframes + clears invert); a "Reveal" dropdown in the Inspector Masks section. **Verify:** new `verify:mask-reveal` (8 checks: end==current, per-kind edge anchoring, growth/monotonicity, 1-frame guard). tsc 0, lint 125, build ok, **67 harnesses**. Fully node-verifiable (drives the proven mask render).

### B10b - Track mattes ✅ DONE (foundation; composite pass browser-gated)
**Delivered:** the track-matte **data model + pure resolver + authoring UI + persistence** - a layer is matted by the layer directly above it, modes **alpha / alpha-inverted / luma / luma-inverted**. Pure `core/trackMatte.ts` (`pairTrackMattes` - pairs each matted layer with the layer above, marks the source consumed, deterministic; `matteFlags` → luma/invert for the shader). `Layer.trackMatte?: TrackMatteMode` on the masked layer types; resolveFrame records `matte`/`consumedAsMatte` on the paired `ResolvedLayer`s (**metadata only - rendering byte-identical**, a no-op when no layer uses a matte). Store `setTrackMatte` (undoable); a Track-Matte dropdown in the Inspector Layer section; persisted in `baseFields`. **Verify:** `verify:mattes` (7 checks: pairing = layer above, consumed source, topmost-ignored, per-mode, dedupe guard, matteFlags). **Browser-gated remainder (B10d):** the composite pass - render the matte source to an isolated texture (renderer.ts ~4224/4500 `layerTex` plumbing) and multiply the matted layer's alpha by the matte's alpha/luma; skip `consumedAsMatte` draws. tsc 0, lint 125, build ok, 68 harnesses.

### B10c - Freeform mask paths + per-vertex feather ✅ DONE (foundation; coverage shader browser-gated)
**Delivered:** the **data model + pure resolver** for freeform (bezier-outline) masks with animated shapes and per-vertex feather. `Mask` gains optional `vertices?: PathVertex[]` / `pathKeyframes?: PathKeyframe[]` / `feathers?: number[]` (additive - **no `MaskType` change, so no cascade**; existing parametric masks untouched). Pure `core/maskPath.ts` (`resolveMaskVertices` - animated outline via **B8b `evalPathKeyframes`** reuse, static fallback; `resolveMaskFeathers` - per-vertex feather padded/clamped to the fallback). `resolveMask`/`resolveMasks` attach the evaluated `vertices`/`feathers` to `ResolvedMask` when present; persisted in `ensureMasks`. **Verify:** `verify:mask-path` (7 checks: static/empty, at-pose/between morph, feather fallback/per-vertex/clamp). **Browser-gated remainder (B10d):** a freeform-polygon **coverage shader** (the shipping mask primitives are analytic SDFs and can't draw an arbitrary outline) + the authoring UI to draw path masks. tsc 0, lint 125, build ok, 69 harnesses.

### B10d - Track-matte RTT composite (pure math ✅; multipass render browser-gated) (SPLIT - freeform coverage -> B10d-mask)
**Coverage math shipped (harnessed):** `core/trackMatte.ts` gained `matteLuma` (Rec.709) + `matteCoverage(srcAlpha, srcLuma, {luma,invert})` (alpha/luma pick + invert + clamp) - the exact expression the WGSL composite must implement (single source of truth). `verify:mattes` extended to 10 checks. B10b's pairing + `matteFlags` + the ResolvedLayer `matte`/`consumedAsMatte` metadata already shipped.

**Render deferred to a BROWSER SESSION (not blind):** unlike the additive/isolated GPU batches (vignette/glitch/hsl/motionTile/beam), the track-matte composite RESTRUCTURES the shared multipass compositor - it can't be safely built blind. Audit-confirmed plan (renderer.ts): gate on `hasMatte = frame.layers.some(l => l.matte)` (byte-identical without mattes); add `if (layer.consumedAsMatte) continue;` in the bucketing loop (~3881, next to the adjustment/beam skips) so the source doesn't double-draw; force the multipass encoder path; per matted pair, render the matte SOURCE and the MATTED layer into isolated textures (reuse `ensureBlurTextures`' `layerTex` + one added pooled texture, or `ensurePrecompTexture`), then a NEW small fullscreen composite pipeline (modeled on `blitPipeline`: 2 texture bindings + a flags uniform) multiplies the matted alpha by `matteCoverage` and draws 'over' into `sceneView` AT THE MATTED LAYER'S SLOT. Watch-items the audit flagged (why it needs live verification): painter-order insertion + premultiplied-alpha parity with the existing `layerTex`->`sceneTex` path. No primary pipeline/shader edits - contained to matted frames.

### B10d-mask - Freeform-polygon mask coverage shader + path-mask UI ✅ DONE (headless-GPU verified; in-app eyeball owed)
**Delivers:** the render for B10c's freeform masks. The shipping mask path is analytic SDF only (`MASK_WGSL`: rect/ellipse/star/regular-ngon in a fixed 12-float/mask uniform); an arbitrary `ResolvedMask.vertices`/`feathers` outline needs either a WGSL winding/point-in-polygon loop over a NEW per-mask vertex storage buffer (variable length -> new bind-group entry + count/offset table + per-vertex feather) OR a CPU coverage bake into an alpha texture sampled in-shader. Plus the path-mask drawing UI. Separate mechanism from the track-matte composite; its own row. **Perf:** heavy; browser.

**Delivered (Oct 2026):**
- **Render, with NO bind/pipeline/buffer change** (deviation from both options above): a freeform mask packs into a RUN of the existing 8 `MaskSlot`s - a header slot (type 5, invert, opacity, max feather, count, mode, bbox, span) + data slots holding a flat comp-space stream (bezier: 7 floats/vertex `x,y,inX,inY,outX,outY,feather`; polyline: 3). `MASK_WGSL` moved to `engine/maskWgsl.ts` (constants interpolated from the packer) and gained `computeFreeformMaskAlpha`: adaptive cubic flattening (Wang's bound, 0.25px, <=32 pieces), nearest-edge signed distance with a **nonzero** winding sign, per-vertex feather interpolated along that edge, bbox early-out; `computeMaskStackAlpha` walks slots and skips runs. All 4 mask-bearing shaders (rect/text/image+video/pattern) get it for free.
- **`core/maskCoverage.ts`** = single source of truth: `packMaskSlots` (renderer's `writeMaskUniforms` now just calls it; parametric stacks are **byte-identical** to the old writer) + `maskStackCoverage`, a line-for-line CPU twin of the WGSL. Budget: one mask alone gets <=12 exact bezier vertices; several freeform masks are water-filled by need (`allocateFreeformSlots`); an over-budget outline is reduced by whichever of {Schneider refit (M18 `fitStroke`), arc-length anchor fit with least-squares handles (new `fitCubicSegment`), RDP polyline, arc-length polyline} strays least from the path. Memoized per ResolvedMask (frames are memoized, so loops/paused repaints don't refit).
- **Mask frame convention:** path vertices live in the mask's NORMALIZED local frame (`comp = position + R(rotation)(local * size)`), so the existing position/size/rotation fields, keyframes, overlay box handles and the B10a reveal wipes all drive path masks unchanged.
- **Path animation:** equal-count poses now interpolate **vertex-for-vertex** (AE mask-path behaviour; beziers stay intact) - `evalMaskPathKeyframes`; different counts / holds still use B8b's resample morph. (Changed one B10c harness expectation on purpose.)
- **Authoring UI:** Inspector Masks "Path (draw)" starts the **mask pen** (click = corner, drag = smooth handles, click first point / Enter closes, Backspace drops the last point, Esc cancels); `MaskOverlay` draws path outlines, anchors and tangent handles - drag anchors/handles (mirrored/angle modes, Alt = independent, Shift = 45 deg), double-click outline = insert vertex (all poses, shape preserved), double-click anchor = corner/smooth, Delete = remove vertex (never the layer; keeps >=3). Inspector: Path row (vertex/key count + path keyframe diamond: static -> animated, add/remove pose, last removal -> static), per-vertex feather for the selected vertex + reset. Store: `addPathMask` (undoable), `patchMask` (batch-aware, one undo step per drag). Path-edit helpers `insertPointOnSegment`/`applyVertexType` moved out of editor.ts into `core/pathVertexOps.ts` (shared, no duplicate). Persistence sanitizes path vertices/poses (a malformed vertex would otherwise throw in the packer) and no longer index-shifts per-vertex feathers.
- **Verification:** `verify:mask-coverage` (16: legacy byte parity over 60 random stacks x 3 offsets, layout, edge/feather/invert/opacity/per-vertex/concave/nonzero/circle-area semantics, refit fidelity, allocation, purity, WGSL constants) + `verify:mask-path` (23). **NEW: `npm run gpu:masks`** (27, headless Chrome + WebGPU on a machine with a GPU, NOT in `npm test`): the shipping WGSL compiled + run as compute == CPU twin over 9 scenes (max err <0.003); the REAL `WebGPURenderer` - all 12 shader modules compile, and shape / image / text layers + an animated path resolved mid-morph render the CPU-predicted coverage (<=4/255); and the REAL `MaskOverlay` + editor store driven by genuine Chrome mouse events (draw, close, drag, insert, delete, convert, undo, Esc). **Still owed:** an in-app look (Tailwind styling, overlay stacking against the other viewport overlays, App.tsx key routing) - the harness mounts the overlay standalone.
- **Limits (v1):** max 12 bezier vertices per mask before reduction (8-slot uniform budget); masks beyond the slot budget drop as the 9th+ mask always did; a path mask with <3 vertices is skipped (no area); anchors are read-only strictly between path keys with different vertex counts (the resampled morph).

### B10e - Basic roto / refine-edge ✅ DONE (headless-GPU verified; in-app eyeball owed)
**Delivers:** a simple rotoscope / edge-refine cut-out on top of B10c/B10d-mask's animated freeform masks: the mask-combination and edge controls a roto needs (mask modes, mask expansion / choke) plus a colour-aware Refine Edge pass that snaps a rough roto onto the footage's real edge.

**Delivered (Oct 2026):**
- **Mask modes (After Effects semantics):** `Mask.mode` = add / subtract / intersect / lighten / darken / difference, combined top to bottom; a stack whose first mask is subtract / intersect / darken starts from the full layer, otherwise from nothing. Absent = `intersect` = the legacy multiply, so every existing project renders exactly as before (proven bit-exact against a frozen copy of the pre-B10e CPU twin, `scripts/lib/legacy-mask-twin.mjs`). New masks default to Add (the AE default). Opacity: add / subtract / lighten / difference scale the mask's contribution; intersect / darken keep the legacy "opacity 0 = no effect" rule.
- **Mask Expansion:** `Mask.expansion` (animatable px; + grows, - chokes) offsets the mask's signed distance, so it works on every parametric shape and freeform path with the feather centred on the moved edge (the freeform bbox early-out widens with it).
- **No bind / buffer / pipeline change:** the mode rides in the invert float (`params.y = invert + 2 * modeId`, intersect = 0) and the expansion in each mask slot's previously-unused last float, so legacy stacks still pack byte-identically and every masked pipeline (shape / text / image+video / pattern) gets both for free.
- **Combined matte field:** `computeMaskStack(world, count, masks, band)` (WGSL) / `maskStackField` (CPU twin, `core/maskCoverage.ts`) also return the CSG signed distance + unit outward normal of the combined matte (min / max per mode; freeform normal from the nearest outline point, parametric by central differences), computed only within `band` px of an edge (the freeform early-out widens by the band; proven exact wherever |sd| < band). `computeMaskStackAlpha` (every other caller) asks for no normal.
- **Refine Edge (image + video layers):** `Layer.refineEdge {enabled, radius, contrast, decontaminate}`. In a band of `radius` px around the combined mask edge the image shader re-estimates each pixel's alpha from the footage itself: foreground colour F sampled just inside along the normal, background B just outside (3 taps along the edge each), alpha = the projection of the pixel colour onto B -> F (closed-form two-colour matting), contrast-hardened, weighted by a band fade (no seam) and an F/B-contrast confidence (falls back to the mask alpha where subject and background look alike). Decontaminate solves C = aF + (1 - a)B for F and moves the fringe toward it. CPU twin `core/refineEdge.ts` = WGSL `engine/refineWgsl.ts` (shared constants). Image/video uniform floats 277..279 (radius 0 = off: the plain alpha path, byte-identical).
- **UI:** Inspector Masks tab - a Mode select per mask (+ a mode tag in the mask list), an Expand row (keyframeable; the first edit creates the property on pre-B10e masks), and a Refine Edge block (On/Off, Radius, Contrast, Decontam) on image / video layers only. Store `setRefineEdge` (undoable, batch-aware so a drag is one step). Mode / expansion / refineEdge persist and are sanitized in `validation.ts`.
- **Verification:** `verify:mask-coverage` 26 (+ legacy bit-exactness vs the frozen twin, packing, all six modes, first-mask start, opacity, expansion, field distance / normals, band exactness); new `verify:refine-edge` 19 (matting math, too-big / too-small roto snaps to the edge, soft-edge partial alpha kept, contrast, decontamination, no-contrast fallback, subtract-hole + inverted stacks, band continuity, banded == full field, params, resolveFrame + validateComposition round-trip). `npm run gpu:masks` now **50**: GPU == CPU for the modes / expansion scenes, the field (sd err 0, 0 normals off) and the refine WGSL (err 0); the REAL `WebGPURenderer` refines a 6 px-too-big roto on an image layer onto the footage edge (alpha within 0.004 of the twin) and strips the blue fringe; the REAL Inspector Masks tab driven by genuine mouse + keyboard (Mode select, typed Expand on a pre-B10e mask, Refine toggle, a Radius drag = one undo entry, Refine hidden on shape layers). tsc 0, lint 125, build ok, 111 harnesses.
- **Perf:** refine costs 7 texture taps + the banded field per pixel, only on refine-enabled layers; everything else runs the unchanged alpha-only path.
- **Deferred:** Roto Brush (paint-to-cutout with ML segmentation + propagation), temporal "reduce chatter" and motion-blurred roto edges, refine-brush strokes (the band is the whole edge) and per-mask refine. Video refine shares the image-shader path (same uniform writer) but was not pixel-tested on real decoded footage (headless has no video). **Owed:** an in-app eyeball (Tailwind layout of the new rows; refine on real footage).

## B11 - ★ Effect-stack framework + adjustment layers + blend-mode audit (SPLIT)
Audit: the per-layer effect stack **already exists** (ordered `LayerEffect[]` on IMAGE layers, per-effect enable + params + reorder, ~150-effect registry, add/remove/toggle/reorder store actions + a "Manage Effects" UI). Real gaps: no effect-PRESET system; the per-layer `effectsEnabled` master switch was a **no-op** (never consumed in resolve); **adjustment layers** are entirely missing; and content-layer **BlendMode is unwired** (only `normal` renders; multiply/screen/overlay/add are stored + shown but no-op). Split by pure vs GPU.

### B11a - Effect presets + effectsEnabled fix ✅ DONE
**Delivered:** (1) an **effect-preset system** - save the current effect stack as a named, app-global preset (localStorage, reusable across projects) and apply/delete it. Pure `core/effects/effectStack.ts` (`resolveEffectStack` = ordered, master-switch + per-effect-enable aware; `cloneEffectStack`; `sanitizeEffectStack` for untrusted presets), `store/effectPresets.ts` (persisted), editor `setLayerEffects` (undoable), and an "Effect Presets" bar in the Effects panel. (2) **Bug fix:** `resolveImageLayer` now honors the layer `effectsEnabled` master switch via `resolveEffectStack` (previously ignored - the switch did nothing). Renders through the existing effect pipeline (no GPU change). **Verify:** new `verify:effects` (8 checks: order, per-effect + master-switch disable, param copy-independence, deep clone, sanitize/clamp). tsc 0, lint 125, build ok, **70 harnesses**. Fully node-verifiable.

### B11b - Adjustment layers ✅ (pure foundation; GPU composite split to B11b-gpu - rendered since B11b-gpu, below)
**Delivers:** a layer whose effect stack applies to everything beneath it. **Shipped (pure, harnessed):** the `adjustment` layer type end-to-end (core `Layer` union + `TrackType` + `ResolvedLayer` + `ResolvedAdjustment` payload; `createAdjustmentLayer`; `addAdjustmentLayer` store action; create UX in the canvas toolbar + both context menus; a dedicated Inspector panel + Effects tab; timeline clip colour/icon; validation + schema round-trip so it persists), plus the **pure coverage resolver** `core/effects/adjustmentCoverage.ts` (`resolveAdjustmentCoverage`/`activeAdjustments`/`hasActiveAdjustments`) wired LIVE into `resolveFrame` (a post-pass computes, per frame, which content layers each adjustment covers + whether it is a no-op). Verified by `npm run verify:adjustment-coverage` (9 checks). The renderer explicitly SKIPS adjustment layers for now (byte-identical when none present) - `layer.adjustment` carries the resolved stack + coverage for the pass. **Split out - B11b-gpu (browser-gated):** the apply-below composite is structural multipass surgery (an adjustment REPLACES the below-composite, so the additive precomp-texture pattern does not apply - it must render the covered layers into an offscreen target, run the effect stack via the IMAGE_SHADER/`writeEffectSlots` path, then blit the result back before drawing the layers above). Unverifiable WGSL here, so gated per the B10b/c/d discipline. **Perf:** medium (one RTT pass per active adjustment; skipped for no-ops).

### B11b-gpu - Adjustment apply-below composite ✅ DONE (headless-GPU verified; in-app eyeball owed)
**Delivers:** the actual GPU pass that makes an adjustment layer's effects visible. Force the multipass branch when any resolved adjustment is non-`noOp`; at each adjustment's draw position, run its `adjustment.effects` over the accumulated `sceneView` (sample → `writeEffectSlots` through the image/effect shader → write to a temp → blit back to `sceneView`), then continue with the layers above. Reuse `ensurePrecompTexture`/the blur-texture set for the intermediate and the existing blit-back primitive (renderer.ts multipass RTT + blit, ~L4372-4733). **Perf:** heavy (structural). Anchors captured in the B11b audit.

**Delivered (Oct 2026):**
- **The apply-below pass.** An active adjustment forces the multipass path. At its draw position the scene is copied (blit) into `matteSrcTex` (free there: adjustments are never matted), then an **adjustment variant of the image shader** (`imageShaderSource(true)`: the same WGSL plus a `belowTex` binding and four insertions; the normal variant's WGSL is textually unchanged, the only edit being the unused pad float renamed `adjustMode`) runs the effect stack + basic filters over the copy and writes the result back, mixed with the untouched below by **k = opacity x mask alpha** (no blend state; full-frame quad). Warps / spatial effects sample the premultiplied copy; the filters + colour effects run on straight colour and are re-premultiplied, so alpha is preserved. Layers above the adjustment draw normally afterwards; stacked adjustments chain. No new textures (reuses `matteSrcTex` + `layerTex`), one guarded pipeline (if it fails to build, adjustments stay inert as before).
- **Split plan (layer Blur / Glow on the adjustment):** apply-only into `layerTex`, the existing layer Blur and Glow passes over it, then a mix-only pass back into the scene (2 uniform slots). An adjustment's Glow is always the luminance (image) glow (outer / inner trace a layer alpha edge a full-frame composite does not have); Glow Only, Motion Blur and Shadow do not apply. Blur / Glow follow the effects-preview switch like every layer's; the stack + filters do not (like an image layer's stack).
- **Model:** `AdjustmentLayer.filters` (partial basic filters, identity defaults) + `ResolvedAdjustment.filters`; the coverage `noOp` now counts stack effects, non-identity filters, Blur and Glow (`adjustmentHasWork`). Filters persist, sanitized to five finite numbers. Pure CPU twin + pass plan: `core/effects/adjustmentComposite.ts`.
- **UI:** adjustment layers get the **Filters** tab (the image Filters panel: basic filters, the whole effect catalog, look presets, saved effect presets, blur / glow wire filters); the effect-stack store actions (`setLayerEffectParam` / remove / reorder / toggle / `setLayerEffects`) now accept adjustment layers (they were image-only, so an adjustment could not get a single stack effect). The Properties panel gains a keyframeable **Opacity** (effect strength; masks limit where) and the Effects tab hides Motion Blur / Shadow / glow Mode / Glow Only for adjustments.
- **Layer Blur fixed (found + proven while building this; affected every layer):** (1) the CPU packed `BlurFxU` with `params` at float 2, but WGSL aligns that `vec4f` to byte 16, so gaussian read `strength` as its radius (the per-glyph blur-in and camera DOF blurs, strength 0 / 1, did nothing) and directional / radial / kawase read garbage; (2) the per-pass `queue.writeBuffer` rewrites land before any command of the frame's single submit runs, so the zeroed copy-back slot also zeroed the directional / radial pass and every kawase pass saw the same index; (3) the object step redrew the sharp layer (`d.fn`) instead of compositing the blurred `layerTex`, so a layer Blur never showed on the object itself. Fixed with `core/effects/blurFxPack.ts` (correct packer + one slot per distinct uniform: main, shared passthrough, each kawase pass) and a premultiplied-over `layerTex` composite. Also: a matted layer / matte source with effects now still consumes its effect uniform slots (later layers read the wrong slot before), and the Filters-panel directional / radial blur sliders now drive `strength` (they only set the unused `radius`).
- **Verification:** new `verify:adjustment-composite` (16 checks: filters defaults / sanitize, has-work truth table, strength, premultiply round-trip, the per-pixel twin incl. partial alpha, the basic-filter twin, pass plan, BlurFxU layout, slot plan incl. capacity overflow, resolveFrame noOp wiring, persistence). New `npm run gpu:adjustment` (35 checks, local headless WebGPU): every module compiles; the real `WebGPURenderer` matches the CPU twin over a rendered composite (filters, partial opacity, feathered mask, pixelate warp, layer above untouched, stacked, no-op / bottom / switched-off byte-identical, split Blur / Glow / Blur + mask, inside a precomp) within 1.6/255; the shipping pipeline on a premultiplied alpha 0..1 strip == the twin with alpha unchanged; each blur type == a CPU twin of its shader (and the pre-batch renderer is shown leaving the object sharp); six frames without an active adjustment / layer Blur are byte-identical to the pre-batch renderer (commit b6d82b9 bundled side by side); the real Inspector on the real stores driven by genuine clicks (Saturation slider, searched Invert, Gaussian Blur wire filter) renders the expected pixels from the store. `gpu:masks` still 50/50.
- **Perf:** one copy pass + one full-frame effect pass per active adjustment (+ the Blur / Glow passes and one mix pass when used); frames with no active adjustment stay on the fast path.
- **Deferred / limits:** effects run in composition space (an adjustment has no spatial transform of its own, matching its Inspector); blend modes and track mattes on an adjustment layer are not applied (it draws normal + unmatted); the Color (lift / gamma / gain) tab is still image-only; every composite is opaque here (the background shader starts from opaque black), so the straight-colour path is proven on a direct strip, not a real scene. **Found, not fixed (separate issue):** a precomp layer at its DEFAULT transform (`createPrecompLayer` / Precompose: position 0, 0) is drawn centred on the comp's top-left corner (the image quad is centred on its position), so a fresh precompose renders shifted up-left by half the frame (`gpu:adjustment` logs it as info). **Owed:** an in-app eyeball (Tailwind layout of the Filters tab on an adjustment, real footage below).

### B11c - Blend modes ✅ (pure foundation; GPU rendering split to B11c-gpu)
**Shipped (pure, harnessed):** completed the `BlendMode` union toward the W3C separable set (normal, darken, multiply, colorBurn, lighten, screen, colorDodge, add, overlay, softLight, hardLight, difference, exclusion - 13). New pure leaf `core/effects/blendModes.ts` = the authoritative reference math (`blendChannel`/`blendRGB` matching the W3C Compositing L1 formulas) AND the renderer's routing table (`BLEND_MODE_META`/`isHardwareBlend` - which modes map to a fixed GPU blend-state variant vs. need a destination read), plus the ordered `BLEND_MODES` for UI. Verified by `npm run verify:blend-modes` (11 checks: known values, overlay=hardLight-swapped, dodge/burn edge clamps, softLight continuity, [0,1] over a grid, hardware set). Added a **blend-mode dropdown** to the Inspector Layer section (content layers) - authored + persisted + resolved now (blendMode already threads to `ResolvedLayer`), like the B10b track-matte control. Expanding the enum is byte-identical at render (the pattern renderer's `PATTERN_BLEND_INDEX[...] ?? 0` falls new modes back to normal; content layers already ignore blendMode). **Split out - B11c-gpu (browser-gated):** the actual content-layer rendering + effect reorder - all WGSL, unverifiable here.

### B11c-gpu - Content-layer blend rendering + effect reorder (browser-gated)
**Delivers:** make a content layer's `blendMode` visible. **Hardware modes** (normal/darken/multiply/lighten/screen/add) via per-blend GPU blend-state pipeline variants + a matched fragment output form - the exact pattern proven for generative-pattern layers (`PATTERN_BLEND_INDEX` + the `m==2/3` output forms at renderer.ts ~790-940); additive, `normal` stays the existing path (byte-identical). **Destination-dependent modes** (overlay/softLight/hardLight/colorDodge/colorBurn/difference/exclusion) need the backdrop, so an in-shader scene composite (sample the accumulated scene texture, run `blendChannel` per the reference, write back) - route by `isHardwareBlend`. **Cross-class effect reorder:** rework IMAGE_SHADER from fixed warp→spatial→color into an ordered multi-pass over the resolved `ResolvedEffect[]`. **Perf:** medium (shared scene RTT). Blend math is fixed by `core/effects/blendModes.ts`.

## B12 - Glow & light finishing ✅ (pure foundation; pyramid/light-wrap/glints split to B12-gpu)
**Shipped (renders now + harnessed):** extended `GlowMode` with `bloom` (routes to a broad image glow today via the existing `glowExtract`/`glowH`/`glowV` RTT; the true pyramid is B12-gpu) and added light-finish params to `LayerGlow`/`ResolvedGlow` (`lightWrap`, `glints`, `glintLength`, `glintAngle` - persisted + resolved now, consumed by the gated passes). New pure leaf `core/effects/glowParams.ts`: `GLOW_MODE_META` (which modes need the pyramid), **light-finish presets** (Soft Glow / Bloom / Deep Glow / Neon - tuned on params the existing glow already renders, so applying one is immediately visible), `clampGlow`, `applyGlowPreset`, resolution-relative `glowRadiusPx`. Inspector `EffectsSection` gained a **preset row** + the `bloom` mode button. Verified by `npm run verify:glow-params` (5 checks: mode metadata, clamping, preset validity/override, resolution-relative radius). Byte-identical when glow is off. **Split out - B12-gpu (browser-gated):** the actual light-finish PASSES - all WGSL.

## B12-gpu - Bloom pyramid + light wrap + glints (browser-gated)
**Delivers:** the real bloom **downsample pyramid** (threshold-extract → progressive downsample/blur → additive upsample, one pyramid shared with blur), a **light-wrap** pass (blur the backdrop, mask to the subject's outer edge, add - drives `lightWrap`), and **star glints / light streaks** (radial kernel from bright points - drives `glints`/`glintLength`/`glintAngle`). All hang off the already-resolved `ResolvedGlow`. **Perf:** medium (shared pyramid). WGSL - unverifiable here.

## B13 - Stylise & cinematic finish ✅ (presets over existing effects; vignette split to B13-gpu)
**Audit finding:** every headline stylise effect ALREADY exists in the effect registry with a working `IMAGE_SHADER` case - chromatic aberration (242), lens/barrel/pincushion/fisheye distortion (210-215), film grain (155) + add/gaussian noise, halftone (308) + dots (150), scanlines (249) + VHS (246) + CRT (248), posterize (118), cartoon (305) + posterPaint/cel + crossHatch. So the batch is **curation + exposure, not new effects.** **Shipped (renders now + harnessed):** new pure leaf `core/effects/stylizePresets.ts` = 8 built-in looks (Cinematic, Film, VHS, CRT, Comic, Retro, Dream, Lens) as effect-stack presets composed from those existing ids, + `applyStylizePreset` (deep clone). Verified by `npm run verify:stylize-presets` (4 checks: every preset effect is a REAL registry effect, params match the registry `paramCount`, clone is mutation-safe). Inspector filters panel gained a **"Stylise Looks" bar** that applies a look via the existing `setLayerEffects` (one click, immediately visible). No shader work - the effects were already wired. **Split out - B13-gpu:** only `vignette` is missing from the registry - one small radial-darken WGSL color case (browser-gated).

## B13-gpu - Vignette ✅ DONE (browser-verify-pending)
**Shipped:** a radial vignette as a new `color`-class effect (the first browser-gated `-gpu` row taken). Three surgical, additive edits mirroring the existing color-effect idioms exactly:
- `core/effects/effectRegistry.ts` - `EFFECT_TYPE.vignette = 164` (next free class-A color id) + an `EFFECT_DEFS` row `{ klass:'color', paramCount:3, defaults:[amount 0.6, radius 1.1, softness 0.6] }`.
- `engine/renderer.ts` - a `case ${EFFECT_TYPE.vignette}` in `applyColorEffect` (before `default:{}`), reading `a.y/a.z/a.w` = amount/radius/softness, computing `1 - smoothstep(radius-softness, radius, length((uv-0.5)*2))` and `c *= mix(1, factor, amount)` - the exact WGSL twin of the pure module, with matching clamps.
- `ui/panels/filters/filterDefinitions.ts` - a `vignette` FilterDef in Color Stylization (the generic panel auto-wires the single slider to param0 = amount + the applied-effects label; radius/softness use the registry defaults, tunable later via a dedicated control like ChromaKey's modal).
- Pure math already lived in `core/effects/vignette.ts` (`vignetteFactor`/`applyVignetteChannel`), harnessed by `verify:vignette` (6 checks); the shader mirrors it so the falloff is pinned.

Gates: tsc 0, lint 125 baseline, build ok, **105 harnesses**, em-dash clean. **⚠ WGSL is browser-verify-pending** - tsc/build/harness do NOT compile shader source, so the vignette look + that the shared IMAGE_SHADER still compiles must be confirmed in a WebGPU browser (add Vignette to a layer; edges darken; nothing else regresses). Safe by construction: a new switch case, off unless added, mirroring proven idioms. **Follow-up:** expose radius/softness in the UI (only amount is on the generic slider today).

## B14 - Glitch & datamosh ✅ (presets over existing effects; pixel-sort/datamosh split to B14-gpu)
**Audit finding:** the glitch family already exists in the registry with frame-pure `IMAGE_SHADER` cases (seeded by `effectTime`, so scrubbing is byte-identical): rgbSplit (240), channelOffset (241), digitalGlitch (245), vhs (246) + vhsNoise (247), scanlines (249) + scanlineNoise (250), blockPixelation, wave, add/gaussian noise. So the batch is curation. **Shipped (renders now + harnessed):** new pure leaf `core/effects/glitchPresets.ts` = 7 built-in looks (RGB Split, Datamosh, Signal Loss, Digital Decay, Broken Signal, Corrupt, Wave Glitch) as effect-stack presets over those ids (reusing B13's preset type + `applyStylizePreset`). Verified by `npm run verify:glitch-presets` (3 checks: every effect is REAL with matching `paramCount`, mutation-safe clone). The filters panel's preset bar was generalized (`LookPresetBar`) and now shows **Stylise Looks + Glitch** rows. **Split out - B14-gpu:** the two genuinely-missing effects - **pixel-sort** and **true datamosh** (block motion-vector displacement) - as new WGSL cases (browser-gated).

## B14-gpu - Pixel-sort + datamosh ✅ DONE (browser-verify-pending)
**Shipped:** two spatial-class glitch effects, wiring up the two previously-INERT filter sliders (`pixelSorting`/`datamosh` in filterDefinitions.ts) - so no new UI, they just light up.
- `core/effects/effectRegistry.ts` - `pixelSorting: 313`, `datamosh: 314` (ids match the filter sliders) + two `klass:'spatial'` EFFECT_DEFS (paramCount 1, p0 = amount).
- `engine/renderer.ts` `applySpatialEffect` - two new cases (after `paintDaubs`, before `default:{}`), reusing the shader's `sampleTex` (LOD-0), `texel` (=1/quadSize), `hash21`, and `time` (=effectTime):
  - **pixelSort** = a bounded 16-tap leftward row scan carrying the brightest above-gate pixel forward (the bright-streak look). Honest approximation of a true full-row sort (a real sort is multi-pass/compute); documented as such.
  - **datamosh** = per-block (24x14 grid) pseudo-random displacement seeded by `floor(time*0.25)` (discrete, frame-pure corruption steps), gated so only a fraction of blocks displace (block-drop look), more as amount rises.
- Pure twin `core/effects/glitchGpu.ts` (`luma709`/`hash21`/`moshOffset`/`pixelSortLuma`) harnessed by `verify:glitch-gpu` (7 checks: hash determinism+range, bounded offset, gate-vs-amount, frame-to-frame change, sort selection). The WGSL mirrors it.

Gates: tsc 0, lint 125 baseline, build ok, **106 harnesses**, em-dash clean. **⚠ WGSL browser-verify-pending** (shader source isn't compiled by tsc/build/harness): confirm both effects render + that the shared IMAGE_SHADER still compiles (add Pixel Sorting / Datamosh Simulation to a layer; nothing else regresses). Safe by construction: two new switch cases, off at amount 0, fixed-bound loop, reusing proven idioms. **Follow-up:** true multi-pass full-row pixel sort; per-effect threshold/block-size params (only amount is on the generic slider).

## B15 - Color grading ✅ (LUT/curve engine + grade tool; live per-layer LUT split to B15-gpu)
**Audit finding:** color **wheels** (lift/gamma/gain/offset) already exist in `ImageColorCorrection`; curves, LUT and HSL did not. **Shipped (renders now + harnessed):** a real pure engine - `core/effects/lut.ts` (`.cube` parser + `identityLUT` + trilinear `sampleLUT` of an N³ 3D LUT), `core/effects/curves.ts` (`evalCurve`/`bakeCurve1D`/`sampleCurve1D` tone curves), `core/effects/gradePresets.ts` (8 film looks: Teal & Orange, Warm, Cool, Bleach Bypass, Noir, Vintage, Vibrant + None, as master/per-channel curves + saturation). Verified by `npm run verify:color-grade` (7 checks: cube parse + reject malformed/1D, identity round-trip, invert-LUT + trilinear midpoint, clamp, curve endpoints/interp/clamp, bake round-trip, preset validity). A **Color Grade image tool** (media-pool right-click + Inspector button) applies a film-look preset and/or a loaded `.cube` LUT per pixel on a 2D canvas, intensity-blended, live preview + bake to a new PNG asset (the image-tools pattern - real, no GPU). **Split out - B15-gpu:** the live per-layer path. **Perf:** medium (a per-pixel 3D-LUT trilinear + 1D-LUT curve lookups on the bake; the GPU does it as a 3D-texture sample).

## B15-gpu - HSL secondary ✅ DONE (browser-verify-pending) (SPLIT - LUT/curves -> B15-gpu-lut)
**Split rationale:** audit found the three parts are NOT one batch. HSL is an additive color switch case (safe, like vignette). The **3D-LUT** needs bind-group-LAYOUT surgery: a new `texture_3d<f32>` binding added to the image bind group layout + a matching entry in EVERY image `createBindGroup` (WebGPU rejects an incomplete bind group, so non-LUT layers need a 1x1x1 identity dummy 3D texture) + the upload path - it affects all image draws and can't be off-by-default. That + curves-as-texture + the multi-param range modal are split to **B15-gpu-lut** (browser session). Global hue/sat already exist (vibrance 100 / hueShift 101 / colorize 122); the genuinely-new piece is the hue-RANGE-gated secondary.

**Shipped (HSL secondary, additive):**
- `core/effects/hsl.ts` - pure `rgbToHsl`/`hslToRgb`/`hueDistance`/`hslRangeMask`/`applyHslAdjust` (hue/sat/lightness + a soft hue-range gate for secondary correction). Harnessed by `verify:hsl` (8 checks incl. RGB<->HSL round-trip over a grid + the range gate touching only in-band pixels).
- `engine/renderer.ts` - added `rgb2hsl`/`hslHue2rgb`/`hsl2rgb` WGSL helpers (beside the existing rgb2hsv/hsv2rgb; safe helper fns, no bind change) + an `hslSecondary` case in `applyColorEffect` mirroring the pure module. params `[hueShiftDeg, satScale, lightAdd, rangeCenter, rangeWidth]`; rangeWidth>=1 = global.
- `core/effects/effectRegistry.ts` - `EFFECT_TYPE.hslSecondary = 165` + a color EFFECT_DEF (paramCount 5, defaults `[0,1,0,0,1]` = identity).
- `filterDefinitions.ts` - an "HSL Secondary (Hue)" slider (generic panel drives param0 = hue shift in degrees). **UI limit:** only hue is on the generic slider; sat/lightness/rangeCenter/rangeWidth need a dedicated modal -> that modal is part of **B15-gpu-lut** (the engine + params already support them).

Gates: tsc 0, lint 125 baseline, build ok, **107 harnesses**, em-dash clean. **⚠ WGSL browser-verify-pending** (shader not compiled in CI): confirm hue shift works + the shared IMAGE_SHADER still compiles. Safe by construction (additive case + additive helper fns).

## B15-gpu-lut - Live 3D-LUT + curves + HSL range modal (browser-gated, bind surgery)
**Delivers:** the invasive remainder of B15-gpu. (1) Bind the parsed `.cube` 3D LUT as a GPU `texture_3d<f32>` in the image pipeline (new bind-group-layout entry + identity dummy for non-LUT layers + upload path) and sample it in IMAGE_SHADER; (2) per-channel 1D-LUT curves (a 1D LUT texture or packed uniform); (3) a dedicated HSL-secondary modal exposing sat/lightness/hue-range (the engine + `hslSecondary` params already exist). Reuses `core/effects/lut.ts` (`parseCube`/`sampleLUT`/`identityLUT`) + `core/effects/curves.ts` (`bakeCurve1D`/`sampleCurve1D`) as the exact CPU spec (already used by `engine/color-grade/colorGrade.ts`). **Heavy: bind-layout surgery touching every image draw; build with a WebGPU browser open.**

## B16 - Light rays, flares & beams ✅ (presets + beam geometry; beam-layer render split to B16-gpu)
**Audit finding:** all five light effects already render (lightRays 290, sunRays 291, lightWrap 292, lensFlare 293, specularHighlight 294 - each has an `applySpatialEffect` WGSL case). So flares/god-rays are curation. **Shipped (renders now + harnessed):** `core/effects/lightPresets.ts` = 6 light looks (Sun Flare, God Rays, Lens Flare, Dreamy Light, Hero Glint, Volumetric) over those ids, exposed as a "Light" row in the filters preset bar. Plus the genuinely-new **beam/lightning geometry** `core/beam/beamGeometry.ts`: `lightningPath` (seeded midpoint-displacement bolt - **frame-pure** via house `mulberry32`, so mixing the frame number into the seed animates it while scrubbing stays byte-identical), `straightBeam`, and `ribbon` (offset a polyline into a tapered quad strip). Verified by `npm run verify:light` (6 checks: endpoints exact, count = 2^iterations+1, amp/iter 0 = straight, frame-pure determinism + off-axis zig-zag, ribbon +/- half-width + taper, preset validity). **Split out - B16-gpu:** drawing the beam as a glowing ribbon layer. **Perf:** heavy (the effects are per-pixel; the beam ribbon is cheap geometry).

## B16-gpu - Beam/lightning FOUNDATION ✅ DONE (SPLIT - render -> B16-gpu-render); built ULTRACODE
**Researched first (ultracode):** a 10-agent research+audit workflow studied how pro tools render beams/lightning/god-rays/flares (AE Saber/Trapcode, ShaderToy SDF bolts, GPU-Gems god-rays, mu6k flares) and audited FlashFX. Verdict: render the beam as a fragment **SDF (distance-to-polyline capsule chain + inline hot core + inverse-square colored glow + in-shader tonemap)** on a bounded quad, in a NEW ISOLATED pipeline - fastest (single additive pass, zero taps, AABB-bounded, <0.1ms typical), sidesteps the missing HDR framebuffer, and a shader-compile error is contained to beam layers (can't regress existing rendering). Lightning = the same pass fed `beamGeometry.lightningPath(seed = beam.seed ^ frameNumber)` (frame-pure). Light rays already ship (lightRays/sunRays 290/291); lens flare deferred.

This is two batches of work (a new layer TYPE + a whole new GPU pipeline), so it's split. **Shipped now (foundation, fully node-verified):**
- `core/beam/beamShading.ts` - pure SDF shading math (`sdSegment`, `capsuleChainDistance`, `coreCoverage`, `glowFalloff`, `tonemap`), the exact twin the WGSL will mirror. Harnessed by `verify:beam` (6 checks). (`beamGeometry.ts` pure geometry already shipped + harnessed by `verify:light`; fixed its stale `verify:beam-geometry` comment.)
- A new first-class **`beam` layer type** wired exactly like Cloner/Precomp: `BeamLayer` + `ResolvedBeam` in core/types (Layer union, TrackType, ResolvedLayer.layerType/.beam), `createBeamLayer` factory (straight cyan beam 30%..70% of canvas; `style:'beam'|'lightning'`, keyframable p1/p2/width/intensity, iterations/amplitude/seed/taper/coreColor/glowColor/glowFalloff), a `resolveFrame` branch that regenerates the centreline polyline each frame via the pure geometry (frame-pure), a `validation.ts` `case 'beam'` (persistence - survives save/load), `addBeamLayer` store action, and "New Beam / Lightning" context-menu items.
- The renderer SAFELY SKIPS beam layers (`layerType === 'beam' -> continue`), so frames with no beam are byte-identical (the Cloner/Precomp incremental-GPU precedent).

Verified: tsc 0, lint 125 baseline, build ok, **108 harnesses**, em-dash clean. An adversarial-review workflow (4 dimensions x per-finding skeptic verify) found only one low issue (a `taper` fallback default mismatch), now fixed; the missing-handling sweep, frame-purity, and renderer no-regression came back clean.

## B16-gpu-render - Isolated WGSL SDF beam pipeline (browser-gated, bind surgery)
**Delivers:** the actual draw of `ResolvedBeam`. A dedicated WGSL pipeline (mirror the pattern-layer pipeline setup + bucketing): a bounded quad (beam AABB + glow margin) vertex stage; a fragment shader that minimises `capsuleChainDistance` over the resolved polyline (uploaded as a fixed-size segment uniform, hard cap ~64-128 like the cloner renderCount), computes hot core + inverse-square colored glow, accumulates in local f32 and tonemaps (`1-exp`) before the LDR write, with free `fwidth` AA; its OWN additive blend variant (`src-alpha`/`one`) so no shared blendState changes; LOD mirroring CLONER_LOD_THRESHOLDS. Mirrors the pure `beamShading.ts` exactly (that math is already proven by `verify:beam`). Isolated so a compile error can only affect beam layers. Browser-only to verify (WebGPU).

## B17 - Tiling & generative simulations ✅ (sim presets + tile param model; tile render split to B17-gpu)
**Audit finding:** the generative-pattern engine (`src/patterns/`) already renders 11 pattern types (waves, plasma, kaleidoscope, mosaic, clouds, voronoi, rings, spiral, interference, gradient, warp) with 12 presets, and `offset` (209) already offsets UVs. **Shipped (renders now + harnessed):** 6 new generative-simulation presets in `PATTERN_PRESETS` mapped onto existing types - **Caustics** (interference), **Wave World** (waves), **Radio Waves** (rings), **Fractal Noise** (clouds), **Energy Field** (warp), **Deep Cells** (voronoi) - auto-exposed in `GenerativePatternPanel`. Plus the genuinely-new **motion-tile param engine** `core/effects/tileParams.ts`: `wrapOffset` (seamless - equal at 0 and size), `resolveScroll` (per-frame offset, resolution-relative + frame-pure), `clampMotionTile`, and `tileUV` (screen UV -> source tile UV with grid + scroll + ping-pong mirror; the reference for the GPU shader). Verified by `npm run verify:pattern-tile` (5 checks: every preset uses a real `PATTERN_TYPE` with in-range params, seamless wrap, scroll sign/monotonic/resolution-relative/frame-pure, clamp, tile mirror). **Split out - B17-gpu:** the actual motion-tile effect (repeat + mirror + edge blend) and any missing pattern type (radio-waves refinement / vegas stroke). **Perf:** medium.

## B17-gpu - Motion-tile warp effect ✅ DONE (browser-verify-pending)
**Shipped:** a `motionTile` WARP-class effect that repeats the layer `tilesX x tilesY` with optional mirror + a seamless scroll phase, as an additive case in `applyWarpEffect` (renderer.ts, after `pointillize`, before `default`) that remaps the sampling UV BEFORE the texture read - a verbatim WGSL mirror of the already-harnessed pure `core/effects/tileParams.ts:tileUV` (fract wrap + mirror parity), so it keeps uv in [0,1) and the caller's inBounds border test stays 1 (no transparent border). `EFFECT_TYPE.motionTile = 235` (B2 warp band) + a `klass:'warp'` EFFECT_DEF (paramCount 5, defaults `[3,3,0,0,0]` = 3x3, no scroll, no mirror) + a "Motion Tile" FilterDef (generic panel drives param0 = tilesX; scrollX/scrollY/mirror ride params 3/4/5 at defaults). Params: `[tilesX, tilesY, scrollX, scrollY, mirror]`; scrollX/Y are a normalized 0..1 phase (the resolve/animation layer drives them to match `resolveScroll`'s fps math - the shader doesn't have fps).

No new harness needed - the pure spec `tileUV` already ships harnessed by `verify:pattern-tile` (from B17), and the WGSL mirrors it. Gates: tsc 0, lint 125 baseline, build ok, **108 harnesses**, em-dash clean. **⚠ WGSL browser-verify-pending** (shader not compiled in CI): confirm tiling/mirror/scroll render + the shared IMAGE_SHADER still compiles. Safe by construction (additive warp case, off-by-default at tilesX resolving to a pass-through when 1x1).

**Deferred (were bundled in the original B17-gpu, not shipped):** `radioWaves` - the existing **rings** pattern already covers it (the shipped "Radio Waves" preset maps to rings), so a separate type would be redundant; `vegasStroke` (a path-following animated outline stroke) is a distinct feature needing its own geometry, out of scope for the motion-tile goal.

## B18 - 3D scene completion ⏭️ SKIPPED (3D - out of scope)
**Decision (2026-09):** the app is intentionally **2.5D-only** (cards-in-space + camera, already built); full 3D is out of scope. Skipped: 3D lights & shadows, environment/reflection, full DOF/focus-pull. If ever wanted, only the 2.5D-compatible slivers (a 2D **bokeh blur** effect and camera **parallax** on the existing multiplane) would be revisited as a light batch - not the 3D scene.
~~**Delivers:** depth of field / bokeh, lights & shadows, parallax multiplane, focus pulls, environment/reflection. Categories: 7. Depends on the 2.5D camera system. Perf: HEAVY.~~

## B19 - Particle system polish ✅ (full - no split)
**Audit finding:** a mature particle system already existed (`src/particles/`: seeded `ParticleEngine`, gravity/drag/**turbulence**, trails, size/opacity/colour-over-life, 5 sprite shapes, and 8 presets incl. fire/smoke/sparks/confetti/snow/magic/rain/bubbles - rendered on a 2D canvas), but with **no harness**. **Shipped:** (1) **Bug fix - frame-purity**: the engine reseeded its RNG per-frame only on keyframe restore, so **scrubbing backward produced different particles than playing forward** (the sim was NOT frame-pure despite the doc's claim). Now `stepFrame` reseeds `mulberry32(baseSeed + frame*7919)` every frame, so play and scrub are byte-identical (proven by the harness). (2) New forces: **wind** (constant directional) + **attractor** (radial pull/push with radius falloff), applied in the sim, exposed as Wind X/Y in `ParticlePanel`. (3) **Dissolve emitter**: a `'points'` emitter shape spawning from `sourcePoints`, plus pure `sampleRegionPoints` / `sampleMaskPoints` (deterministic - the logo/text dissolve foundation). (4) 5 new presets: **dust, embers, steam, fireworks, dissolve**. All optional new config fields, so old projects load unchanged. Verified by `npm run verify:particles` (9 checks: frame-purity + scrub-determinism, gravity/drag/wind/attractor/lifetime, points emitter, dissolve samplers, all 13 presets simulate). **Categories:** 8. **Perf:** the sim is CPU (bounded by maxParticles) + keyframe-snapshot scrubbing; frame-pure. **Follow-up (optional):** live source-layer alpha -> `sourcePoints` + source fade-out (couples the dissolve to a real layer) is a browser-render integration, not built here.

## B20 - Plexus (2D connected-dots) ✅ (built on the frame-pure particle system)
**Delivers (2D only):** **plexus** - a connected-dot network (points + proximity lines, animated). **Approach:** reuse the B19 frame-pure particle sim as the moving-point source, and connect nearby particles - so plexus is frame-pure for free and needs no new layer type. **Shipped:** new pure leaf `core/plexus/plexusGraph.ts` (`computeEdges` - all point pairs within `connectDistance`, per-edge alpha fading 1->0 with distance, no self/dup edges, `maxEdges` cap; `edgeDegrees`), harnessed by `npm run verify:plexus` (6 checks). The particle renderer draws the edges as fading lines behind the dots when `connectDistance > 0` (new optional `connectDistance`/`connectColor`/`connectWidth` on `EmitterConfig`, a `Connect` control in `ParticlePanel`), plus **Plexus** + **Constellation** presets. **Dropped as 3D (out of scope):** 3D stroke "draws in space" + Mir/Tao flowing surfaces. **Categories:** 9. **Perf:** medium - O(n^2) edges capped at 6000, over the bounded particle count. The line-drawing is 2D canvas (browser-eyeball for looks); the edge math is fully harnessed.

## B21 - Physics dynamics ✅ (review + harden + magnets; spring/rope joints split to B21-sim)
**Audit finding:** a real Rapier 2D system already existed (roles kinematic/dynamic/static/ghost, colliders box/circle/hull/polyline, materials restitution/friction/damping/axis-locks, boundary walls, velocity handoff, a deterministic bake cache) - so **collisions + stacking already work** - but it had **no harness** and a bug. **Review + harden:** fixed `deriveVelocityFromEvaluator` - it divided the handoff velocity by the full sample `window` even when the loop broke early near frame 0, under-estimating the velocity; now it divides by the samples actually taken (proven by the harness). **Expand:** new pure leaf `physics/forces.ts` - `magnetForce` (radial attract/repel with radius falloff), `springForce` (Hooke + axis damping, a rope/chain segment), `dampedSpringStep` (soft-body jiggle / spring-to-rest integrator). **Magnets are wired end-to-end** (`magnets` on `PhysicsWorldConfig`/`PhysicsWorldDef`, applied as an impulse to active dynamic bodies in the bake, a Magnet control in the physics panel) - additive + byte-identical when none set. Verified by `npm run verify:physics` (7 checks: magnet attract/repel/falloff, spring rest/stretch/compress/damping, jiggle convergence, velocity round-trip + the sample-count fix). **Split out - B21-sim:** springs/ropes/chains + soft-body as real Rapier JOINTS (the `springForce`/`dampedSpringStep` models are the spec) - browser/WASM, unverifiable here. **Categories:** 13. **Perf:** bake step (playback stays cheap).

## B21-sim - Spring/rope/chain joints + soft-body (browser-gated)
**Delivers:** multi-body **spring joints**, **ropes/chains** (a chain of distance/spring joints between segment bodies), and **soft-body jiggle** (a body spring-pulled toward its keyframed rest pose), wired via the Rapier joint API in `world.ts`/`bake.ts` using the pure `springForce`/`dampedSpringStep` as the reference. Runs in the browser (Rapier WASM) - not runnable here.

## B22 - 3D objects & extrusion ⏭️ SKIPPED (3D - out of scope)
**Decision (2026-09):** full 3D extrusion / imported models / materials are out of scope (the app is 2.5D-only). Skipped entirely. A **faux-bevel** on 2D text (inner shadow + highlight, no real geometry) could be a light stylise item later, but is not this batch.
~~**Delivers:** extruded 3D text/logos with bevels, imported models, materials/reflections. Categories: 17.~~

## B23 - Destruction generators ✅ (pure engines; the piece render split to B23-render)
**Shipped (pure + harnessed):** the destruction ENGINES. `core/destruction/fracture.ts` - `fractureVoronoi` decomposes a rect into exact Voronoi shard polygons by clipping the rect with each pair's perpendicular-bisector half-plane (Sutherland-Hodgman), + `polygonArea`/`polygonCentroid`, + `shardExplode` (a shard's frame-pure trajectory: fly outward from the blast centre with seeded speed/spin jitter, gravity fall, fade). `core/destruction/cardDance.ts` - `tileGrid` (cols x rows tiles with UV sub-regions), `tileMapValue` (leftToRight/topToBottom/diagonal/radial/random ordering maps), `cardDanceTransform` (per-tile fly-in/out staggered by the map, easing to identity so the layer reassembles exactly). Frame-pure throughout. Verified by `npm run verify:destruction` (6 checks: shards partition the rect + sites in their cells, fracture determinism, explosion outward + frame-pure + fade, tile-grid coverage, map ordering, settled 'in' = identity). **Split out - B23-render:** turning the shards/tiles into rendered pieces. **Categories:** 25. **Perf:** medium; frame-pure.

## B23-render - Destruction piece render (browser-gated)
**Delivers:** expand a shatter/card-dance modifier into rendered pieces - the resolve-time way (per-piece stamps of the source, each clipped to its shard polygon / tile rect via a mask, transformed by `shardExplode`/`cardDanceTransform`) or a store-bake (create real shard/tile layers with the animation keyframed). Needs per-piece source clipping (polygon/rect mask on a stamp or baked layer), which is an unverifiable renderer/store integration here. The `fracture`/`cardDance` engines are the exact spec.
- **Reference replication (Nov 2026):** needed by r05 f31-98 (words shatter into shards around the brain; ref gap #19). See `refs/GAP-MATRIX.md` in the task artifacts.

## B24 - Deformation & warp ✅ (puppet engine + deform presets; mesh render split to B24-render)
**Audit finding:** the warp effects already render (bulge, pinch, twirl, wave, **ripple**, **turbulentDisplace** - all `warp`-class `applyWarpEffect` cases). **Shipped (harnessed):** (1) 8 **deform presets** over those effects (Jelly, Flag Wave, Ripple, Wobble, Melt, Bulge, Pinch, Vortex) - render now, exposed as a "Deform" row in the filters preset bar; (2) the genuinely-new **puppet mesh-warp engine** `core/warp/puppet.ts`: `warpPoint` (a point displaced by an inverse-distance-weighted blend of pin offsets - no pins = identity, one pin = uniform translate, a point on a pin's rest lands on its pos), `buildWarpMesh` (rest grid), `warpMesh` (deform every vertex). Pure + deterministic. Verified by `npm run verify:warp` (6 checks: identity, single-pin translate, pin-rest exactness, two-pin inverse-distance blend, mesh build/apply/immutability, preset validity). **Split out - B24-render:** warp the layer texture through the deformed triangle mesh (GPU). **Categories:** 12. **Perf:** medium. **Not built (out of scope / gated):** liquify brush (interactive stroke field) and displacement-map (needs a map texture) - the puppet mesh covers bezier/mesh warp.

## B24-render - Puppet mesh-warp render (browser-gated)
**Delivers:** render a layer through the `warpMesh` deformed grid - triangulate the mesh, map the source as a texture across the deformed triangles (a per-triangle textured draw, or a vertex-displaced quad grid) in the renderer. `core/warp/puppet.ts` is the exact spec; the GPU mesh draw is unverifiable here.

## B25 - Character rigging ✅ (pure solvers; rig binding/render split to B25-rig)
**Greenfield** (no prior rig code). **Shipped (pure + harnessed):** `core/rig/rigging.ts` - the solver math for posing a 2D character: `solveTwoBone` (analytic law-of-cosines IK for an arm/leg - reachable targets hit exactly with correct bone lengths, `bendSign` flips the elbow, unreachable straightens), `solveFabrik` (N-bone Forward-And-Backward-Reaching IK for tails/spines - reaches the target, preserves every segment length, root fixed), `rubberHosePath` (bendy-limb quadratic bezier), `blendJoystick` (bilinear pose blend over 4 corner poses, Character-Animator style). Verified by `npm run verify:rig` (7 checks). **Split out - B25-rig:** binding real layers to a chain + drawing the limbs + the rig UI. **Categories:** 11. **Perf:** solver eval is cheap; the rig binding/render is the heavy part. **Not built:** auto-squash (a follow-on that would drive scale from limb velocity, tying into B32 squash & stretch).

## B25-rig - Rig binding + render (browser-gated)
**Delivers:** attach layers as bones to an IK/FABRIK chain, expose draggable target/pole/pin handles on the canvas, drive the bound layers' transforms from the solved joint positions each frame, draw rubber-hose limbs, and a joystick control widget. `core/rig/rigging.ts` is the solver; this is the layer-binding + on-canvas + render integration, unverifiable here.

## B26 - Transitions & preset system ✅ (full, no split)
**Audit finding:** a rich animation-preset engine already exists (`core/animationPresets.ts` - 24 presets across Position/Fade/Scale/Rotation/Combination, `generatePresetKeyframes` resolving each preset's tracks to real keyframes at the layer's in/out, consumed by `AnimatePanel`), and effect presets (`useEffectPresetStore`) + the B13-17 look-preset bars cover the "save/browse" side. **Shipped:** (1) **Review + harden** - the preset engine shipped untested; added `npm run verify:anim-presets` (5 checks: every preset generates non-empty tracks in [start, start+dur] with ordered frames + valid property paths, fade-in ramps 0->ctx opacity, slide-left off-screen->rest, category bucketing). (2) **New drag-in transitions** (the missing ones from this batch, all driving existing properties so they render now): **Whip Left/Right/Up/Down** (position spring overshoot + a brief directional scale stretch that reads as motion blur) and **Spin In/Out** (rotation + scale + opacity), auto-exposed in `AnimatePanel`. **Categories:** 15. **Depends on:** B1 (easing) + B7 ✅. **Perf:** light. **Not built (need a blur track):** true blur/liquid dissolve transitions - the preset engine drives position/scale/rotation/opacity only; a blur-track transition would follow B12-gpu / B11c-gpu.

## B27 - Tracking & match-move ✅ (pure math; the tracker split to B27-track)
**Greenfield.** **Shipped (pure + harnessed):** the match-move MATH that consumes tracked feature positions. `core/tracking/homography.ts` - `computeHomography` (solve the 3x3 projective transform mapping a source quad to a destination quad via an 8x8 Gaussian solve - the corner-pin / planar warp), `applyHomography`, `invertHomography`. `core/tracking/matchMove.ts` - `onePointOffset` (1-point match-move), `twoPointTransform`+`applyRigid` (2-point position+rotation+uniform-scale), `smoothTrack` + `stabilizeCorrections` (warp-stabilize: correction = smoothed - raw cancels high-frequency shake). Verified by `npm run verify:tracking` (7 checks: homography identity / exact corner mapping / invert round-trip, 1- and 2-point match-move exactness, smoothing, stabilise reduces jitter >40%). **Split out - B27-track:** the actual tracker (find + follow features across frames). **Categories:** 16. **Perf:** the math is trivial; the tracker is the heavy part.

## B27-track - The tracker (browser-gated)
**Delivers:** follow point/planar features across video frames (normalized cross-correlation of a search patch, or reuse the B6 optical-flow field) to produce the per-frame positions/quad that `homography.ts`/`matchMove.ts` consume, plus the on-canvas track-point UI and apply (corner-pin a layer / match-move / stabilize). Needs decoded video frames + per-frame image correlation - browser, unverifiable here.

## B28 - Keying ✅
**Delivers:** chroma/luma key, spill suppression, edge refine, screen replacement. **Categories:** 22. **Perf:** medium.

**Shipped (harnessed + rendering now):**
- Pure keying core `src/core/keying/keying.ts` (leaf module, no imports): `rgbToYCbCr` (BT.601), `luma709` (BT.709), `chromaKeyAlpha` (Cb/Cr chroma-plane distance, so it keys evenly across a lit vs shadowed backing - the property naive RGB-Euclidean fails), `lumaKeyAlpha` (soft threshold + invert), `suppressSpill` (green/blue despill by key channel), `chokeMatte` (separable erode/dilate) and `featherMatte` (separable box blur), plus `dominantChannel`. Deterministic; proved by `scripts/verify-keying.mjs` (`npm run verify:keying`, 9 checks incl. the luminance-independence property).
- CPU-bake **Chroma Key** image tool that renders today (mirrors Color Match / Grade / Cutout): `src/engine/chroma-key/chromaKey.ts` (`renderChromaKey` builds the matte, chokes then feathers it, despills RGB, bakes a straight-alpha transparent PNG; `sampleBitmapColor` eyedropper), `src/store/chromaKey.ts`, `src/ui/panels/chroma-key/ChromaKeyModal.tsx` (key-colour swatch + eyedropper, tolerance/softness/despill/choke/feather, checker preview). Wired into the image-asset "AI" menu (`menuDefinitions.ts`), mounted in `MediaPool.tsx`, and surfaced as an Inspector Tools button (`Inspector.tsx`). Apply imports the keyed PNG via `mediaAssetManager.importImage` -> `addImageFromAsset`; the straight-alpha pipeline composites it natively (no renderer change).

**Deferred to B28-gpu (browser-gated, unverifiable here):** the live per-layer WGSL keyer. A crude green-only chromaKey effect already exists (`EFFECT_TYPE.chromaKey=163`, RGB-Euclidean, single frozen slider) - id 163 is serialized/frozen, so upgrading its WGSL math to YCbCr Cb/Cr distance + key-channel despill would change the look of saved projects; that upgrade plus a real color-picker/multi-param filter UI (`filterDefinitions.ts`) is B28-gpu. Edge refine already has a live GPU path (matteExpansion/featherAlpha). Screen replacement / difference key needs a second texture binding (renderer bind-group change) and is out of scope here.

## B29 - Footage cleanup & beauty ✅
**Delivers:** denoise, deflicker, skin/beauty retouch. **Categories:** 23. **Perf:** **HEAVY** - dedicated.

**Shipped (harnessed + rendering now):**
- Pure cleanup core `src/core/cleanup/cleanup.ts` (leaf, no imports): `boxBlur1` (separable), `surfaceBlur1` (edge-preserving range-limited blur = the denoise / skin-smooth primitive; keeps real edges), `frequencySeparate`/`recombine` (split tone from texture so retouch smooths tone while keeping pores; lossless at detail 1), `movingAverage` + `deflickerGains` (temporal per-frame luma -> correcting gain), and `ellipseMaskField` (soft face mask). Deterministic; proved by `scripts/verify-cleanup.mjs` (`npm run verify:cleanup`, 6 checks incl. edge-preservation and flicker-smoothing).
- CPU-bake **Retouch** image tool that renders today (mirrors the Chroma Key / Color tools): `src/engine/retouch/retouch.ts` (`renderRetouch` = global denoise + edge-preserving skin smooth with frequency-separation detail keep, optionally limited to detected faces), `src/store/retouch.ts`, `src/ui/panels/retouch/RetouchModal.tsx` (Denoise / Skin smooth / Detail keep / Radius sliders + a "Faces only" toggle that runs the browser FaceDetector and reuses `face-blur` `ellipseMask` geometry). Wired into the image "AI" menu, mounted in `MediaPool.tsx`, and an Inspector Tools button. Apply imports the baked PNG via `mediaAssetManager.importImage` -> `addImageFromAsset`; original untouched.

**Deferred to B29-video (browser/video-gated, unverifiable here):** temporal **deflicker apply** - the gain math is pure + harnessed (`deflickerGains`), but extracting per-frame luma needs the browser video decoder (a `sceneDetect`-style `videoDecoderPool.decodeFrame` loop) and re-exposing frames across time cannot run/verify in node. Also a live per-layer WGSL denoise/retouch effect. Both ship there. Non-destructive still-image retouch is the rendering-now surface; deflicker is inherently multi-frame.

## B30 - Practical VFX compositing ✅
**Delivers:** an add/screen composite workflow for stock elements (fire/smoke/sparks/blood), light leaks. **Categories:** 24. **Perf:** light - mostly blend modes + asset workflow (leans on B11).

**Key audit finding:** layer-level Screen/Add blend renders on canvas TODAY only for `generativePattern` layers (dedicated GPU pipeline variants: normal/add/multiply/screen). Image/shape/text/video content-layer blend is still the `B11c-gpu` gap. So the rendering-now VFX element is a full-frame **generativePattern** set to screen/add - which composites additively today. (We do NOT bundle copyrighted stock fire/smoke video; the shipping elements are procedural.)

**Shipped (harnessed + rendering now):**
- Pure VFX core `src/core/vfx/vfxElements.ts` (leaf, imports only the pattern-config types): a curated `VFX_ELEMENTS` catalog (light leaks / film burns / atmosphere - warm black-anchored palettes so screen/add only adds highlights) + `buildVfxSweep` (opacity envelope fade-in/hold/fade-out + film-burn flash + optional position drift, emitted as keyframes; frame-pure). Proved by `scripts/verify-vfx.mjs` (`npm run verify:vfx`, 6 checks).
- One-command editor action `addVfxElement(id)` (editor.ts): drops a full-frame generativePattern with the element's warm pattern config, sets `blendMode` to screen/add, and bakes the sweep keyframes - undoable, one command.
- UI: a **Light Leak** button in the CanvasToolbar (one-click adds the default warm leak, renders now) and a **VFX Looks** picker in `GenerativePatternPanel` that applies any curated leak/burn/atmosphere look + its screen/add blend to a selected pattern layer. The pattern's own `speed`/time evolution animates the overlay frame-purely; `buildVfxSweep` adds the fade/drift.

**Leans on (already ✅):** blend-mode model (B11c), the generative-pattern engine (B17) + warm palettes, `animationPresets` keyframe pattern. **Gated:** true Screen/Add compositing for image/shape/text element layers remains `B11c-gpu` (browser). Light leaks sidestep it by being generativePattern layers, which already blend.

## B31 - Audio-reactive & data-driven ✅ (audio->keyframes shipped; visualiser/data-binding split out)
**Delivers:** audio→keyframes, waveform/bar/circle **visualisers**, beat/transient sync, data/spreadsheet/JSON binding, animated counters. **Categories:** 18. **Depends on:** existing audio pipeline. **Perf:** medium.

This is a five-feature batch; per the split rule the strong rendering-now core shipped and the FFT visualiser + data-binding split into gated rows. **Animated counters already ship** (the `counter` animation-item, `animation-items/engine.ts` evaluateCounter) - nothing to build.

**Shipped (harnessed + rendering now) - audio->keyframes + beat sync:**
- Pure core `src/core/audioReactive/audioReactive.ts` (leaf, no imports): `frameAmplitude` (per-frame RMS envelope), `smoothEnvelope` (attack/release), `mapAmplitude` (gain/threshold/exponent curve), `buildAmplitudeTrack` + `buildBeatTrack` (+ `secondsToFrames`) emitting plain keyframes for scale/opacity/rotation/position. Deterministic; proved by `scripts/verify-audio-reactive.mjs` (`npm run verify:audio-reactive`, 6 checks).
- Browser glue `src/engine/audio/audioReactive.ts`: `generateAudioReactiveTrack` decodes via `extractMonoAudio` (the same decode beat detection uses), runs the pure math (amplitude) or the pure `detectBeats` (beat), returns a keyframe track. Reuses B-era `detectBeats`/`computeRms` infrastructure; only the decode is browser-only.
- UI: `src/store/audioReact.ts` + `src/ui/panels/audio-react/AudioReactModal.tsx` (pick an audio/video source, driven property, Amplitude vs Beat, min/max + sensitivity/smoothness/threshold or decay), launched from the clip context menu ("Audio React..."), mounted in `MediaPool.tsx`. Apply writes the keyframes via `updateLayerProperty(layerId,'<path>.keyframes', kf[])` (one undoable command); they then play + export frame-purely.

**B31-data SHIPPED (2026-09-25, bake-to-keyframes):** bind a CSV column or a JSON-array field to a layer property. Pure `src/core/dataBinding/dataBinding.ts` (leaf; reuses the audio core's `ReactTarget`/`Track`/`toValue` - no duplication): `parseCSV` (quoting / `""` escapes / CRLF / ragged rows), `columnValues` (by header, case-insensitive, or index), `parseJSONSeries` (array of numbers, or a dot-path field of an array of objects), `toNumbers`, `mapSeries` (auto-normalise or explicit domain -> [min,max] + invert), `buildDataTrack` (N values -> keyframes spread across a frame span, dedup/last-wins). Verified by `verify:data-binding` (13 checks). It's the **audio-react pattern**: `store/dataBind.ts` + `ui/panels/data-bind/DataBindModal.tsx` (file/paste CSV or JSON, pick column/field + driven property + min/max/frame-span/invert), launched from the clip context-menu "Data Bind..." (Animate group) and mounted in `MediaPool`. Apply bakes ordinary keyframes via `updateLayerProperty(layerId, '<path>.keyframes', kf)` (one undoable command) - fully synchronous, no decode, plays + exports frame-purely, persists as ordinary keyframes (no new persisted type). `applyOverrides`/cloner data-binding were NOT needed (those set a single static value; an animating value is a keyframe track).

**Deferred:** `B31-viz` (bar/circle **spectrum** visualiser) needs an offline FFT that does not exist anywhere (beat detection is energy-flux, no FFT) plus a bar/arc render surface - browser/new. **Follow-up for B31-data:** a *live* binding (re-evaluated, persisted) and a *content-override* case (data field -> text/color, which is where `core/overrides.ts` applyOverrides + the cloner `dataBinding` path would be reused) - the bake model above covers the numeric time-series case.

## B32 - Motion-design principle rigs ✅ (4 keyframe rigs shipped; echo/secondary split out)
**Delivers:** anticipation, follow-through/overlapping action, secondary motion, squash & stretch, staggered offset, motion trails/smears/echo - as one-click **applyable behaviours/rigs**. **Categories:** 19. **Depends on:** B1, B7 (both ✅). **Perf:** light.

Six deliverables; the four that are pure keyframe transforms shipped now (harnessed, rendering), and the two that need a render pass / cross-layer plumbing split into gated rows.

**Shipped (harnessed + rendering now):**
- Pure core `src/core/motionRigs/motionRigs.ts` (leaf, imports only types; mirrors `keyframeAssistants.ts`): `addAnticipation` (insert a windup keyframe opposite the first move), `addFollowThrough` (set an overshoot/settle ease - backOut/elasticOut/bounceOut - on the segment into the rest pose, rendered live by `keyframeEase.segmentProgress`, no bake), `buildSquashStretch` (per-frame volume-preserving scale keyframes driven by position speed - stretch along the motion axis, squash the other, scaleX*scaleY = baseline area), and `shiftKeyframes` (frame shift for stagger). Deterministic; proved by `scripts/verify-motion-rigs.mjs` (`npm run verify:motion-rigs`, 7 checks).
- Store action `applyMotionPrinciple(layerIds, principle, opts)` (editor.ts): picks the primary animated transform property (or drives scale from position for squash & stretch; shifts all keyframed transform props by a per-layer `computeStaggerOffsets` delay for stagger), applies to the selection in one undoable command. Reuses the existing `stagger` engine for the eased per-layer delays.
- UI: a **Principles** section in `AnimatePanel.tsx` (Anticipation / Follow-Through / Squash & Stretch / Stagger buttons) targeting the selected layer(s). The rigs rewrite ordinary keyframes, so they play + export frame-purely.

**B32-secondary SHIPPED (2026-09-25, spring-damped follow, baked):** a child trails a picked layer's motion with a lag (overlapping action). Pure additions to `core/motionRigs/motionRigs.ts`: `springFollow` (semi-implicit-Euler spring integrator that follows a per-frame series - lag + optional overshoot, deterministic), `springParamsFromControls(lag, bounce)` (0..1 UI controls -> stiffness/damping; bounce=0 is critically damped), `buildSecondaryTracks` (parent per-frame samples -> child position+rotation keyframes with the child's constant offset preserved). Verified by `verify:motion-rigs` (now 13 checks: step lags+converges, critically-damped-no-overshoot vs bouncy-overshoots, stability, offset). Store `applySecondaryMotion(childId, parentId, opts)` (editor.ts) samples the FOLLOWED layer's own LOCAL transform per frame via `evaluateVec2`/`evaluateNumber` (they ignore the scene graph - exactly its own motion; this is why the "cross-layer read absent from ExpressionContext" wasn't a blocker: a BAKE reads the evaluator directly), springs each channel, bakes over the child's `[inPoint,outPoint)` span, `deepSet`s position (+ rotation only if the followed layer rotates) and drops separated-dims, one `settleComposition` + `exec`. UI: a "Secondary Motion" section in `AnimatePanel.tsx` (follow-target dropdown from `composition.layers` + Lag/Bounce sliders + Apply). **Caveat:** samples + writes LOCAL transforms, so it's exact when the child and the followed layer share a scene-graph parent (both top-level = the common case); a differently-parented child follows in its own local space. **Deferred:** `B32-render` (echo / motion trails / smears) - a transform echo is feasible at resolve-time (the cloner staggered-local-time path already stamps delayed copies), but a dedicated echo post-pass and a pixel-accurate afterimage (video / animated text / particles) need a GPU render-target accumulation; the `filterDefinitions` echo/smear/trails/ghosting sliders are currently locked as unimplemented.

---

**All B-batches (the After-Effects feature plan) are ✅ or a documented gated/skip row.** AE browser-gated backlog (GPU/WGSL, Rapier-WASM sims, ML/FFT, video-decode, render-target passes): B10d, B10e + B11b-gpu (✅ 2026-10-14, headless-GPU verified), B11c-gpu, B12-gpu, B13-gpu, B14-gpu, B15-gpu, B16-gpu, B17-gpu, B21-sim, B23-render, B24-render, B25-rig, B27-track, B28-gpu, B29-video, B31-viz, B32-render. 3D batches (B18, B22, and B20's full-3D scope) are intentionally skipped (2.5D-only). (B31-data + B32-secondary ✅ shipped 2026-09-25.)

**The NODE-BUILDABLE backlog is now exhausted** - every remaining `⬜` is browser-gated (WGSL/GPU, Rapier-WASM, ML/FFT, video-decode, or render-target passes) and needs a WebGPU/WASM browser session to build + verify. B13-gpu (vignette) + B14-gpu (pixel-sort/datamosh) + B15-gpu (HSL secondary) ✅ shipped 2026-09-25 (browser-verify-pending; B15-gpu SPLIT - its 3D-LUT bind surgery is now **B15-gpu-lut**). The `▶ next` marker is now on **B16-gpu**, but the founder can pick any gated row to tackle with a browser open. Highest-leverage gated rows: **B10d** (track-matte composite - unblocks the shipped matte model), **B11b-gpu**/**B11c-gpu** (adjustment-below + content blend modes - foundational render work), **B12-gpu** (bloom pyramid). NOTE: from here every batch writes real WGSL/GPU/WASM that only a WebGPU browser can verify - the founder must eyeball each.

**The active queue is now the PB (playback performance) batches below** - `/next-batch` points at **PB1**.

---

## Playback performance batches (PB1-PB7)

Source: the video/image playback perf audit ([`PLAYBACK-PERF-AUDIT.md`](./PLAYBACK-PERF-AUDIT.md), a 6-agent code+research audit). Batch 1 (the 6 quick wins - scrub coalescing, `retainOnly`, pattern/lottie stable textures, binary keyframe search, classic drop-to-newest) already SHIPPED (commit 404fb33); the deferred quick win + the structural/heavy fixes are queued here. These are the video **hot path** (browser-only WebGPU/WebCodecs), so most need a runtime eyeball the founder runs after each batch; verification is gates + any harnessable pure logic, then a manual browser scenario list. Frame-purity + the scheduler's open-frame cap (`MAX_OPEN_FRAMES_PER_ASSET`) are non-negotiable invariants for every one.

### PB1 - Decoded-frame LRU on the mediabunny path ✅ (shipped da346d9; browser scrub-test owed)
- **Delivers:** a small (3-4 entry) LRU of recently-decoded frames on the live mediabunny backend so backward / oscillating scrubs BEYOND the scheduler's 8-frame buffer hit the cache instead of tearing down the cursor and re-walking the whole GOP. Ports the legacy worker's 4-frame decoded cache (`videoWorker.ts:472-478`).
- **Source:** PLAYBACK-PERF-AUDIT recommendation #2 (the deferred quick win).
- **Depends on:** nothing (additive to `mediabunnyController`).
- **Perf weight:** medium. **The real risk is VideoSample/VideoFrame lifecycle** (a close-while-in-use bug crashes playback) - build it with the browser open.
- **Likely files:** `src/engine/video/mediabunnyController.ts` (cache keyed by exact source index, checked in `decodeFrame` routing before the jump decision; close on evict); reuse `src/engine/cache/lruCache.ts`.
- **Verification:** gates green; manual browser: scrub backward + oscillate around a point on a long clip and confirm it's instant, no leaked/detached-frame errors in the console, memory stays flat.

### PB2a - Keyframe-snap-then-refine on far seeks ✅ (shipped c24b482; browser scrub-test owed)
**Shipped:** on a far seek/scrub the nearest key frame is shown immediately (~1 decode) instead of
freezing while the exact frame walks the GOP, then refined to exact. `mediabunnyController`
`getNearestKeyframeIndex` (read-only `EncodedPacketSink.getKeyPacket`) -> `videoDecoderPool`
`getNearestKeyframe` -> `frameScheduler` prefetches the key frame while scrubbing (shared `requestDecode`
helper + `isScrubbingNow()`) -> the renderer's classic drop-to-newest miss branch (PB batch 1) uses an
unbounded present distance WHILE SCRUBBING so the snapped keyframe shows (playback keeps the tight
window). Fail-safe: falls back to holding the last frame if nothing suitable is buffered, playback
untouched. Gates green; runtime verification is a founder scrub-test.

### PB2b - Real half-res proxy decode ✅ (shipped dc27ca8; browser scrub-test owed)
**Shipped:** `mediabunnyController.applyProxy` downscales the decoded frame via
`createImageBitmap({resizeWidth,resizeHeight})` when `proxyScale < 1` (the scheduler sets 0.5 for >1080p
assets while scrubbing), cutting the ~33MB/frame 4K upload/convert/texture cost to ~scale^2. **Scope
refinement:** used the legacy createImageBitmap-resize approach rather than a parallel CanvasSink decode
cursor - far less surface, same win, and decodeFrame keeps returning a `VideoFrame` (built from the
resized bitmap, no decoder slot) so no return-type ripple. Fail-safe: no-op during normal playback
(proxyScale === 1), any error returns full-res; export uses a separate full-res path. Gates green;
runtime verification is a founder scrub-test. (Proxy cuts pixel cost, not the GOP walk - PB2a already
covers the freeze.)
- **Delivers:** (a) on a far seek/scrub present the nearest already-decodable keyframe INSTANTLY (one decode) while the exact frame decodes forward, refine on settle - kills the "freeze then snap"; expose keyframe positions (mediabunny `getKeyPacket`; today `getKeyframes` is stubbed to `[]`). (b) implement the real 0.5x downscale decode behind the already-wired `setProxyMode` (currently a no-op stub) via a mediabunny CanvasSink, full-res on settle.
- **Source:** PLAYBACK-PERF-AUDIT #7 + #8 - together the 4K scrub-freeze fix.
- **Depends on:** PB1 helps but not required.
- **Perf weight:** heavy (browser). Note: a 0.5 decode-scale still walks the GOP, so #8 needs #7 to remove the freeze.
- **Likely files:** `src/engine/video/mediabunnyController.ts` (CanvasSink proxy + `getKeyPacket`), `src/engine/video/videoDecoderPool.ts` (`getKeyframes`), `src/engine/video/frameScheduler.ts` (snap request on jump). The proxy activation plumbing (`activateProxyForLargeAssets`) is already wired.
- **Verification:** gates; manual browser: far-seek a 4K long-GOP clip shows a frame within ~1 decode (no ~1s freeze); scrubbing 4K is smooth at reduced quality then sharpens on pause.

### PB3 - Frame-keyed resolve memoization ✅ (coarse whole-frame memo shipped 9601525; built ahead of PB2 as the safe-to-verify-blind batch)
**Shipped:** `TimelineEngine` now memoizes resolved frames by frame number (`engine/timeline.ts`), cleared
whenever `composition` or the resolve context changes (both replaced on every edit via the immutable
store + the Viewport effect, which now also depends on `styles` - the one resolve input outside
`composition`). Paused repaints, scrub revisits and loop playback become a map lookup instead of a full
whole-composition re-resolve. Proven byte-identical + correctly-invalidated by `verify:resolve-cache`.
**Deferred (finer):** the per-layer dirty-skip repurposing the renderTree dirty-set (a bigger change) -
revisit only if profiling shows FIRST-pass resolve is still hot.
- **Delivers:** memoize a layer's `ResolvedLayer` by `(layerId, frame)`, invalidated on edit, and skip re-resolving layers / static sub-comps unchanged since the last frame - so `resolveFrame` stops re-resolving the ENTIRE composition every played frame + every scrub sample. Precomps whose sub-comp is static across many parent frames benefit most.
- **Source:** PLAYBACK-PERF-AUDIT #6/#13 - the long-TIMELINE CPU floor (many clips, dense keyframes, nested precomps).
- **Depends on:** nothing; repurposes the existing RenderTree dirty-tracking (`renderTree.ts` `syncFromLayers` builds content signatures, currently discarded via `markAllClean`).
- **Perf weight:** heavy, but mostly PURE CPU logic -> harnessable. Frame-purity is critical: the memo MUST be byte-identical to a fresh resolve (prove with a fuzz harness, like `verify:keyframe-search`).
- **Likely files:** `src/core/interpolation.ts` (`resolveFrame`), `src/engine/cache/renderTree.ts`; new `scripts/verify-resolve-memo.mjs`.
- **Verification:** new harness proving memoized == fresh resolve over random edits/frames; gates; manual browser: a long, keyframe-dense / precomp-heavy timeline scrubs without the per-frame CPU stall.

### PB4a - Proxy-planning policy ✅ (shipped 2540bf6)
**Shipped:** `src/engine/video/proxyPlan.ts` `planProxy(sourceMeta)` - pure policy deciding whether a
source gets a low-res short-GOP proxy and its target dims/GOP: proxy for >1080p OR >60s footage,
downscaled to <=1280 long edge (aspect-preserved, even), all-intra (keyframeInterval 1) for ~1-decode
seeks; frame rate + count preserved (1:1 index mapping). Proven by `verify:proxy-plan` (5 checks).
Unwired until PB4b imports it (the harness is the proof it's intentional).

### PB4b - Background transcode worker + fail-open preview routing ✅ (shipped 6b085f8; browser scrub-test owed)
**Shipped, FAIL-OPEN (built despite no-browser because it can't regress existing playback/export):**
`proxyTranscodeWorker.ts` (off-thread mediabunny `Conversion` -> downscaled proxy MP4), `proxyTranscoder.ts`
(lazy worker, serialized, timeout, returns null on any failure), `videoDecoderPool` proxy registry +
`registerProxy`/`unregisterProxy` + `decodeFrame` routes to the proxy for PREVIEW and self-heals to the
original on any proxy decode error (export + metadata always original), and `assetManager.maybeBuildProxy`
(fire-and-forget on import). Verified: tsc/lint/build (worker chunk emitted)/99 harnesses. The
transcode + scrub BENEFIT is browser-only (scrub-test a freshly-imported 4K clip). **Limitation:**
fresh-import + in-session only - the proxy isn't persisted, so a reload re-uses the original (or would
re-transcode). That's PB4c.

### PB4c - Persist the proxy to OPFS ✅ (shipped 959ae41; browser reload-test owed)
**Shipped:** `proxyStore.ts` (guarded OPFS load/save/delete keyed by a reload-stable asset id);
`assetManager.maybeBuildProxy` persists the proxy after registering it, and `restoreOrBuildProxy` (wired
into the reload path) loads the persisted proxy if present else rebuilds it. Removes per-session
re-transcoding and makes the proxy apply to reloaded projects. Fail-open (OPFS miss/error -> rebuild or
original). Gates green; runtime substance (OPFS I/O across reload) needs a browser test. **PB4 (a+b+c)
is now complete.**

### PB4 - Background all-intra / short-GOP proxy to OPFS (original combined spec, now PB4a+PB4b)
- **Delivers:** on import, transcode originals in a background worker to a low-res, short-keyframe-interval (ideally all-intra) proxy so every seek is ~1 decode; edit against the proxy, relink to full-res only for export. Persist the proxy (+ filmstrip/waveform) to OPFS/IndexedDB so it survives reload.
- **Source:** PLAYBACK-PERF-AUDIT #14 - the definitive long-video seek fix every desktop NLE ships.
- **Depends on:** PB2 (proxy routing) conceptually; the `videoDecoderPool` facade already routes per-asset so a proxy source swaps behind it. mediabunny has the WebCodecs encoder/muxer; project-system already persists media to IndexedDB.
- **Perf weight:** heavy (browser + worker). Mirror the existing per-import audio/thumbnail worker pattern.
- **Likely files:** new proxy-transcode worker, `src/engine/media/assetManager.ts` (import hook + relink-for-export), `src/engine/video/videoDecoderPool.ts` (proxy vs original source), OPFS persistence in `project-system`.
- **Verification:** gates; manual browser: import a long 4K clip, confirm background proxy generation + instant scrubbing once ready, correct full-res export, proxy survives reload.

### PB5a - Global decode-cursor budget ✅ (shipped be61cd0; browser test owed)
**Shipped, FAIL-OPEN:** `cursorBudget.ts` pure `cursorsToEvict` (harnessed, `verify:cursor-budget`) +
`mediabunnyController.enforceCursorBudget` cap total open cursors at 12 (under the ~16-decoder ceiling),
tearing down the LRU cursors when many clips would otherwise black-frame. An evicted cursor just reseeks
on next use; a `busy` flag + the existing gen-supersede machinery mean a wrong eviction can't break
playback. Drop-to-newest was already shipped (PB batch 1 + PB2a).

### PB5b - Adaptive prefetch lookahead + cursor-pool-sizing ⬜ (browser-gated, NOT fail-open)
**Deferred (not safe blind):** adaptive lookahead is constrained by the `LOOKAHEAD < MAX_OPEN_FRAMES_PER_ASSET`
invariant that prevents the decoder-stall "unplayable" freeze - widening it REGRESSES playback if wrong
(not fail-open), so it needs browser profiling. Cursor-pool-sizing (fixed 2 -> active layers per asset)
needs the scheduler's per-asset layer counts threaded in. Build with the browser open.

### PB5 (combined spec, now PB5a + PB5b) - Adaptive prefetch + drop-to-newest + global decoder/cursor budget
- **Delivers:** widen the prefetch lookahead when decodes are cheap (proxy/all-intra) and keep it narrow for 4K long-GOP, staying under `MAX_OPEN_FRAMES_PER_ASSET`; extend drop-to-newest presentation fully (batch-1 added the classic-path miss fallback); add a global decoder/cursor budget that tears down idle cursors (LRU) near the ~12-14 mark and sizes the per-asset cursor pool to layers-per-asset instead of a fixed 2.
- **Source:** PLAYBACK-PERF-AUDIT #7(present)/#9/#10.
- **Depends on:** PB2/PB4 (adaptive window benefits most once proxy exists).
- **Perf weight:** medium (browser). Respect the open-frame-cap invariant in `frameScheduler.ts`.
- **Likely files:** `src/engine/video/frameScheduler.ts`, `src/engine/video/mediabunnyController.ts` (cursor budget/sizing), `src/engine/video/videoDecoderPool.ts` (adapt the existing `MAX_ACTIVE_WORKERS` LRU as the global budget).
- **Verification:** gates; manual browser: many-clip timeline doesn't hit black frames (decoder ceiling); 4K playback doesn't underrun.

### PB6 - Filmstrip/thumbnail decode lane + OPFS sprite cache ✅ DONE (browser scrub-test owed)
**Shipped (harnessed pure core + fail-open browser lane):** the timeline filmstrip no longer decodes a frame per cell through the shared playback cursor (the audit found BOTH thumbnail features - the live strip and the contact-sheet/scene-detect - rode `videoDecoderPool.decodeFrame`). New pieces, all additive:
- `engine/video/thumbnailSprite.ts` - PURE planning/layout/lookup geometry for a packed atlas (density = 1 thumb/sec capped at MAX_THUMBS=200 with the interval widening to span longer clips; grid bounded to MAX_ATLAS_DIM=4096; `cellRect`/`cellIndexForTime`). Harnessed by `verify:thumbnail-sprite` (9 checks).
- `engine/video/thumbnailLane.ts` - the DEDICATED lane: its own mediabunny `Input`+`VideoSampleSink` walked forward ONCE, packing frames into an `OffscreenCanvas` atlas. Never touches `AssetCtl.cursors`/`frameCache`/the cursor budget; returns the iterator in `finally` so its one decoder closes promptly. Browser-gated + fail-open (returns null on any failure).
- `engine/video/thumbnailSpriteStore.ts` - OPFS persistence mirroring `proxyStore` (atlas PNG + JSON meta sidecar, keyed by the reload-stable asset id, fully fail-open).
- `engine/video/thumbnailSpriteManager.ts` - serializes builds (a tail promise → at most ONE thumbnail decoder open, clear of the ~16 ceiling), LRU-bounds the in-memory atlas cache (24), and exposes a zustand `ready` signal so the strip repaints when a sprite lands.
- Wired into `assetManager` import + reload (mirrors `maybeBuildProxy`/`restoreOrBuildProxy`). `TrackArea`'s `VideoThumb` draws the right atlas cell (ZERO decode) when a sprite is ready and repaints reactively; **falls back to the existing `decodeFrame` path when it isn't**, so the filmstrip never regresses.

Gates: tsc 0, lint 125 baseline, build ok, **102 harnesses** (`npm test`). **Browser scrub-test owed (founder):** confirm a fresh 4K import builds its filmstrip without stealing the playback cursor (scrub stays smooth during the build), and thumbnails persist across reload (no re-decode storm). **Deferred (non-blocking):** build the sprite from the low-res proxy blob for speed (currently the original), move the pack to a worker, and repoint the contact-sheet/scene-detect one-offs (menu tools) onto the lane too.

- **Delivers:** generate timeline thumbnails/filmstrips on a DEDICATED decode lane (not the playback cursor) via mediabunny `samplesAtTimestamps` / a CanvasSink at target size, snapped to keyframes, and persist packed sprite sheets to OPFS so they aren't re-decoded on reload - prevents the "thumbnail decode storm" starving playback on a long timeline.
- **Source:** PLAYBACK-PERF-AUDIT #11.
- **Depends on:** nothing; `thumbnailSheet.ts` (sprite packing) + `sceneDetect.ts` exist - confirm they use a dedicated decoder, not the playback cursor.
- **Perf weight:** medium.
- **Likely files:** thumbnail/filmstrip generation modules, `project-system` OPFS persistence.
- **Verification:** gates; manual browser: scrubbing while a long timeline builds thumbnails stays smooth; thumbnails persist across reload.

### PB7 - Range-stream URL assets + chunk-range planner ✅ DONE (SPLIT - browser/invasive halves gated)
**Audit finding (why this split):** the app is local-first and mediabunny's `BlobSource` **already reads a local File lazily by byte range** (only the moov/cues + requested samples, bounded 8MiB cache) - so a local import was never fully buffered, and even `readChunked`'s reassembled `new Blob(parts)` is read lazily (disk-backed join, not a RAM spike). The two genuinely-wrong things were: (1) a URL source was fully downloaded via `fetch().blob()` before frame 1 - but that branch is **dead** today (every caller passes a File; the Drive/Library path is `LIBRARY_ENABLED=false`); (2) `readChunked` pulls **all** >512MB chunk records from IDB up front. The high-value work (remote streaming, zero-copy upload) is thus either dormant or a heavy unverifiable WGSL fork, so per the batch discipline the verifiable core ships and the rest is gated.

**Shipped (harnessed core + low-risk wiring):**
- `engine/video/videoChunkPlan.ts` - PURE chunk-range planner (`planChunkRange(fileSize, chunkSize, start, end)` → the ordered `{chunkIndex, startInChunk, endInChunk}` slices covering a byte range; `chunkCount`). The missing primitive a lazy `CustomSource.read(start,end)` needs to replace `readChunked`'s eager join. Mirrors `saveChunked`'s slice arithmetic so a planned read maps onto exactly the stored bytes. Harnessed by `verify:chunk-plan` (8 checks incl. a reassembly round-trip). Unwired-but-intentional (PB4a precedent) - consumed by PB7-lazy.
- `mediabunnyController._init` now builds the source via **`UrlSource`** for a string/URL (HTTP range streaming, no full download) instead of `fetch().blob()`; a local Blob still uses `BlobSource` (byte-identical). Fail-open: a UrlSource construction failure falls back to the old full-download path. Removes the "buffer the whole remote file before frame 1" anti-pattern so the URL branch is correct if/when a remote asset source is re-enabled.

Gates: tsc 0, lint 125 baseline, build ok, **103 harnesses** (`npm test`), em-dash clean.

**Split out (gated):**
- **PB7-gpu** - zero-copy `device.importExternalTexture` for PLAYING frames. Heavy: a `texture_external` bind-group-layout + WGSL (`textureSampleBaseClampToEdge`) **pipeline fork** of the shared IMAGE_SHADER (external textures expire per-submit, can't be a render attachment or feed the effects/RTT passes), reserving the pooled owned `copyExternalImageToTexture` texture (videoTextureCache) for the paused/effects/last-frame-hold case. Unverifiable WGSL + risk to the hot render path → browser-gated.
- **PB7-lazy** - the lazy chunked-local read: a mediabunny `CustomSource` whose `read(start,end)` uses `videoChunkPlan` to pull only the overlapping IDB chunk record(s), replacing `readChunked`'s `new Blob(parts)`. Needs an `initAsset`→Source plumbing change + a real decode to verify; modest win (BlobSource already lazy) so lower priority → browser-gated.

- **Delivers:** (a) feed mediabunny a range-based streaming source for URL/Supabase/Drive assets instead of `fetch().blob()` (which buffers the whole file before frame 1), and lazy range-read >512MB chunked local assets instead of concatenating every chunk up front; (b) optional: draw PLAYING frames via `device.importExternalTexture` (zero-copy `texture_external`), reserving the pooled owned texture for the paused/effects/last-frame-hold case.
- **Source:** PLAYBACK-PERF-AUDIT #12 + #15.
- **Depends on:** nothing (local File imports already stream lazily via mediabunny `BlobSource` - extend that to URL/chunked).
- **Perf weight:** medium (browser).
- **Likely files:** `src/engine/video/mediabunnyController.ts` (source construction), `src/engine/media/assetManager.ts` (chunked reassembly), `src/engine/renderer.ts` + `src/engine/video/videoTextureCache.ts` (importExternalTexture hybrid path).
- **Verification:** gates; manual browser: a long URL-hosted clip shows its first frame without a full-file download stall; playback uploads stay cheap at 4K.

---

## Bricks-tutorial gaps (B33-B42, from the Nov 2026 gap analysis)

Source: the YouTube tutorial-channel project compared every technique in the 4 Bricks (@bricksdept) TARGET videos (liquid glass n0g4HXxx03s, UI designs x3SZvxoOmi0, shape morph XJIr419bY9E, smooth camera PdHYC0gqIPA) and the text-animation video MpaGgpw9Qys against the code. The full table is in the task artifact `flashfx/gap-analysis.md`. Already shipped in that step (not batches): animator "Characters Excluding Spaces" + Tracking (em), per-glyph text motion blur, mixed styles / accent word, 4 kinetic title presets (incl. a 2-animator stack), and a fix for per-glyph stamps drawn offset (`verify:textanimator`, `verify:text-glyph-motion`, `verify:text-runs`, `gpu:text-kinetic`). Blend-mode rendering for GLASS is the existing **B11c-gpu**; the voice-note waveform is the existing **B31-viz**. Timestamps below are Bricks beats (video id, m:ss).

## B33 - Colour keyframes ✅ (Nov 2026, wave 1A)
**Delivered:** `AnimatableColor` (RGBA keyframes, same Keyframe shape so every generic op works) stored as animated overrides under `layer.animProps` (`core/animProps.ts`): `fillColor` / `strokeColor` on shapes, `textColor` / `textStrokeColor` on text, `glowColor` / `shadowColor` on any layer with those effects. Evaluated per frame in LINEAR light (sRGB decode, ease, encode; alpha linear; overshoot clamped), hold keys give exact swaps; absent / unkeyed = the static colour object itself (byte-identical). Friendly paths (`shape.fillColor`, `text.color`, `glow.color` ...) map onto the tracks via `canonicalKeyframePath`, which the store applies in `addKeyframe` (creates the track on first key), `setKeyframes` and `groupTargetFrames` (so easing / interpolation / delete / move all work). `Keyframe.value` widened to `number | Vec2 | Vec4`; the keyframe assistants and motion rigs are now component-wise (`core/keyframeValue.ts`) so they never truncate a colour. Timeline lists keyed overrides in an "Animated" group. Persistence: `sanitizeAnimProps` in `validation.ts`. **Verify:** `verify:anim-props` (16 checks: linear-light mix, holds, legacy byte-identity, frame purity, persistence, manifest paths) + `gpu:anim-props` (keyed fill / text colour render byte-identically to static twins on the real WebGPU renderer, red -> eased -> blue hold -> green on screen; text texture re-rasterizes per frame). **Not done:** the Inspector colour-row stopwatch (UI); text gradient stops.

- **Delivers:** keyframable colour: shape fill + stroke colour and text colour (and the text gradient stops if cheap) as an `AnimatableProperty` whose value is a Vec4 (or a parallel `fillColorProp`, whichever keeps old projects byte-identical), interpolated in linear RGB with the existing eases + hold keyframes; Inspector stopwatch on the colour rows; validation/persistence; agent action or `updateLayerProperty` path documented in `featureManifest.ts`.
- **Source beats:** XJIr 1:15-2:05 + 31:51-33:08 (fill-colour morph), XJIr 0:03-0:07 (Follow -> Following state), n0g4 0:16 + 29:52-30:50 (label colour swap), MpaGgpw9Qys 0:26 ("Fill" property word).
- **Reference replication (Nov 2026):** needed by r01 f191-300 (hue cycle), r02 f1404-1470 (black to grey), r03 f2006-2027 / f2554-2570 / f2747-2753 (toggle, button, text to white), r04 f270-350 (colour words darken), r06 f27-49 (mark tint); ref gap #3, 5 of 7 refs. See `refs/GAP-MATRIX.md` in the task artifacts.
- **Depends on:** nothing. Today `AnimatableProperty` values are number | Vec2 only (`core/types.ts:62`); shape `fillColor` is a fixed Vec4; text colour is `spans[0].style.color`.
- **Perf weight:** medium (resolve path touches every shape/text layer: keep the static fast path).
- **Likely files:** `src/core/types.ts`, `src/core/interpolation.ts` (resolveShapeLayer / resolveTextLayer), `src/core/keyframeEase.ts`, `src/ui/panels/Inspector.tsx`, `src/project-system/services/validation.ts`, `src/agent/featureManifest.ts`.
- **Verification:** gates + `scripts/verify-color-keyframes.mjs` (interpolation, hold, frame purity, legacy projects unchanged).

## B34 - Null layer + parenting UI ⬜
- **Delivers:** a "New Null" layer type (invisible controller with a transform and an on-canvas crosshair, never rendered/exported), Object menu + agent action; a parent picker in the timeline row (dropdown and/or pick-whip drag) that calls the existing undoable `setLayerParent` keeping world transforms; nested nulls.
- **Source beats:** PdHYC 2:05-2:46 + 5:35-6:57 (parent everything to chained nulls), XJIr 6:22-7:39 + 14:03-15:18 (null pivots, carousel), n0g4 45:21-46:52.
- **Depends on:** nothing. `layers.groups-parenting` notes "Parenting has no UI control yet: agent-only via setLayerParent"; groups need a selection.
- **Perf weight:** light.
- **Likely files:** `src/core/types.ts` + `factory.ts` (null layer), `src/core/interpolation.ts` (resolve as transform-only), `src/engine/renderer.ts` (skip), `src/ui/panels/timeline/TrackRow.tsx`, `src/store/editor.ts`, `src/agent/featureManifest.ts`.
- **Verification:** gates + `scripts/verify-null-layer.mjs` (null never draws, children follow, world transform preserved on parent/unparent).

## B35 - Typing caret + UI-mock template kit 🟡 partial (Nov 2026, wave 1B)
**Delivered:** (a) the typing caret: `TextLayer.caret` (`TextCaret`: style bar / block / underline, colour, width, height, gap, offsetY, radius, blinkRate, solidWhileTyping, startFrame / endFrame window) resolved in `core/textCaret.ts` as ONE rectangle stamp right after the last revealed glyph (head = past the last glyph with opacity >= 0.5 under the frame-resolved animators), placed with the same layout / advances / line start as the glyph stamps, composed under the layer world transform, drawn by the existing shape pipeline (no renderer change). Frame-pure blink (a function of the frame only), solid while typing. Persisted (`normalizeTextCaret` in `validation.ts`); instantiate rebases the caret window. Agent: `agent.setTextCaret` (one undo step). (b) four UI-mock templates in `animation-templates/categories/uiKit.ts` (plain layers + real keys, `editor.insertAnimationTemplate`): `search-bar-typing` (pill opens, placeholder, query types on behind a blue caret), `toggle-switch` (a B51 cursor clicks a settings toggle: knob slides with backOut, track colour-keys grey to green), `chat-bubbles` (sent / received bubbles with tails popping from the tail tip, typing dots), `notification-banner`. Engine fix on the way: a `hold` key in the middle of a list showed its old value one frame late (on the next key's own frame); `segmentProgress` now returns the next value at t = 1 (After Effects semantics). **Verify:** `verify:ui-kit` (22 checks: caret x = the type-on head advance on every frame and hugs the last glyph stamp, blink purity under shuffled scrubbing, solid while typing, styles / window / colour, persistence, templates instantiate with unique ids and resolve on every frame) + `gpu:ui-kit` (real WebGPU: the lime block caret is drawn within 1.5 px of the resolver on every typing frame, right of the typed text). **Not done:** templates YouTube-player card, Discord card, fast-forward badge, "Scene N" card, section card with cycling caption; an Inspector control for the caret; caret on multi-line / text-on-path text; the stock `type-on` still shows the first glyph before its start (B45: the template keys the offset from `-1 / length`).

- **Delivers:** (a) an optional caret on type-on text (thin bar after the last revealed glyph, blink rate, colour; resolve-time stamp on the existing glyph path, frame-pure); (b) animation templates: chat bubble with tail (sent / received), search bar with typing + caret, notification banner drop-in, toggle / pill state switch, YouTube-player card with Subscribe button, Discord-style community card with Join, fast-forward badge, "Scene N" reference card, section title card with cycling caption. All built from existing layers (shapes, text, animators, presets) so they stay editable.
- **Source beats:** every TARGET cold open (narration-as-UI): PdHYC 0:00-0:24, XJIr 0:00-0:28, x3SZ 0:00-0:36, n0g4 0:00-0:27; presentation overlays (style bible §5: fast-forward badge, Scene N card, section card).
- **Reference replication (Nov 2026):** needed by r03 f2590-2979 (toggle pills), r04 f116-200 / f263-288 / f351-380 (block caret, search bar), r07 f148-172 (lime block caret); the cursor half is B51; ref gap #5, 4 of 7 refs with B51. See `refs/GAP-MATRIX.md` in the task artifacts.
- **Depends on:** B33 helps the toggle state swap (not required: hold-swap two layers).
- **Perf weight:** medium (templates only; caret is one extra stamp).
- **Likely files:** `src/core/textAnimatorPresets.ts` / `src/core/interpolation.ts` (caret), `src/animation-templates/categories/ui.ts` + `catalog.ts`, `src/agent/catalogs.ts`.
- **Verification:** gates + harness for the caret position/blink purity + template instantiation (every template resolves without throwing, layer counts, ids unique).

## B36 - Text animator completion ⬜ partial (Nov 2026, wave 1B: all but save-your-own preset)
**Delivered:** keyframable selector Start / End (`TextAnimator.start` / `.end`, like `offset`; `editor.setKeyframes` / `addKeyframe` on `animators.<i>.start|end|offset` creates the property on first use); animator deltas `skew` (deg, a sheared glyph raster in `textAtlas`), `fillColor` (each glyph mixes from its own colour in linear light, stacked animators in order) and `scatter` (seeded per-unit offset, house mulberry32 hash, frame-pure); seeded randomize order (already in the selector) now harnessed under a reveal sweep; per-glyph stamps for hard multi-line and wrapped text (each laid-out line maps back onto content indices, `core/textGlyphLayout.ts`; runs / accent words and decode work per line too); presets `scatter-in`, `color-wave`, `delete-char`; Animators panel rows for skew, scatter, fill colour and a keyed Start / End indicator. **Verify:** `verify:textanimator` (skew, fill, scatter, unitRandom), `verify:rangeselector` (seeded order under a type-on sweep is a permutation, frame-pure), `verify:text-glyph-motion` (multi-line placement = the static layout, per-word across lines, keyed start / end = the static twin, skew, scatter purity), `verify:text-runs` (accent on two lines), `gpu:text-kinetic` (two-line caption stamps on the plain text, per-word reveal across both lines on the real renderer). **Not done:** save-your-own animator preset (IndexedDB user presets); keyframing Start / End from the Animators panel UI (agents and the timeline can).

- **Delivers:** keyframable selector Start and End (like Offset today), skew and fill-colour animator deltas (fill needs B33's colour interpolation or a per-stamp tint), per-glyph stamps for multi-line / wrapped text (per-line layout from `getTextLayout`, runs per line), and save-your-own animator preset (user presets in IndexedDB like effect presets, listed beside the built-ins, applied by the Animators panel and the agent).
- **Source beats:** MpaGgpw9Qys 1:52-3:04 (style 2 keys range Start), 0:26 (skew / fill property words), 6:08-6:31 (save + apply your own presets); long titles in all hooks.
- **Reference replication (Nov 2026):** needed by r03 f27-92, f546-575, f757-828, f2089-2238, f2444-2526, f2530-2589, f3092-3125, f3433-3525 (multi-line per-word animators) + f1430-1448 (seeded randomize order: add it to this batch), r07 f27-41 (fill-colour wave); ref gap #7. See `refs/GAP-MATRIX.md` in the task artifacts.
- **Depends on:** B33 for the fill-colour delta (ship the rest without it if B33 is not done).
- **Perf weight:** medium.
- **Likely files:** `src/core/types.ts`, `src/core/textAnimator.ts`, `src/core/interpolation.ts` (expandTextGlyphs), `src/ui/panels/TextAnimatorEditor.tsx`, a small preset store (mirror `store/effectPresets.ts`), `src/agent/*`.
- **Verification:** gates + extend `verify:textanimator` / `verify:text-glyph-motion` (multi-line placement, start/end keys, skew) + `gpu:text-kinetic`.

## B37 - SVG import as editable shapes ⬜
- **Delivers:** importing an `.svg` (file or paste) creates editable shape layers: `<path>` (incl. arcs -> beziers), rect (rx), circle, ellipse, line, polyline/polygon, fill/stroke/opacity, transforms flattened, `<g>` -> a group, viewBox fitted to the comp. Raster fallback stays for unsupported features (filters, masks, text).
- **Source beats:** x3SZ 13:31-21:30 (vectors stay sharp, convert to native paths, icon assets, ungroup), XJIr 2:15-5:06, n0g4 9:50-12:41.
- **Depends on:** nothing (pen paths / `PathVertex` exist; `importToPool.ts:13` lists svg as a raster image today).
- **Perf weight:** medium (parse once at import).
- **Likely files:** new pure `src/core/svgImport.ts`, `src/engine/media/importToPool.ts`, `src/store/editor.ts`.
- **Verification:** gates + `scripts/verify-svg-import.mjs` (path commands incl. relative + arcs, transforms, groups, colours, malformed input fails soft).

## B38 - Liquid-glass material ⬜ (browser)
- **Delivers:** a glass material on any shape: backdrop blur of the composite BELOW the shape inside its outline (rounded corners follow the shape), refraction / bump of that backdrop, brightness, an inner highlight, an edge light sweep (rotating conic highlight on the stroke), outside-only shadow; plus track-matted adjustment layers (an adjustment clipped to a shape). Reuse the adjustment-layer multipass (`matteSrcTex` + `ADJUST_SHADER`) rather than a new pipeline where possible.
- **Source beats:** n0g4 0:00-0:20 (glass hook), 1:34-9:23 (refraction, frosted blur, light sweep), 14:15-17:26; x3SZ 0:22 (frosted card).
- **Reference replication (Nov 2026):** needed by r06 f366-472 (frosted pill over a photo); ref gap #17. See `refs/GAP-MATRIX.md` in the task artifacts.
- **Depends on:** B11c-gpu (overlay blend for the hairline stroke) helps but is not required.
- **Perf weight:** **heavy** (an extra scene copy + blur per glass layer; cap the count, reuse the blur pyramid).
- **Likely files:** `src/engine/renderer.ts`, `src/core/effects/adjustmentComposite.ts` (CPU twin), shape material types/UI.
- **Verification:** gates + CPU twin harness + a `gpu:glass` headless-Chrome pixel test (backdrop blurred only inside the outline, untouched frames byte-identical).

## B39 - Editor ergonomics ⬜
- **Delivers:** an in-app eyedropper on colour rows (the browser EyeDropper API where available, fall back to sampling the preview canvas); relative / arithmetic numeric entry in `DragInput` (`+400`, `-20`, `*2`, `/2` relative to the current value; plain numbers stay absolute); copy easing only (paste the in/out ease of one keyframe onto selected keyframes of any property).
- **Source beats:** x3SZ 1:06-2:06 + 11:29-12:30 and XJIr 31:51 (eyedropper), n0g4 19:55-22:30 + XJIr (relative entry "+400"), PdHYC 15:14-15:57 (copy curve between layers).
- **Depends on:** nothing.
- **Perf weight:** light.
- **Likely files:** `src/ui/components/DragInput.tsx` (+ a pure `parseNumericEntry`), `src/ui/panels/Inspector.tsx` colour rows, `src/store/editor.ts` keyframe clipboard, `src/ui/context-menu/menuDefinitions.ts`.
- **Verification:** gates + `scripts/verify-numeric-entry.mjs` and an ease-paste harness.

## B40 - Property links (pick-whip) ⬜
- **Delivers:** link any animatable property to another layer's property (pick-whip drag or a picker), stored as an expression; the expression scope gains read access to other layers' resolved properties (by layer id / name), evaluated deterministically and cycle-checked.
- **Source beats:** n0g4 5:15-7:46 + 17:26-19:55 (master shape drives its stroke / shadow copies).
- **Depends on:** nothing (the Anchoring panel already maps a few transform channels; expressions see only their own value, `expressions/worker.ts:284-322`).
- **Perf weight:** medium (dependency order between layers).
- **Likely files:** `src/expressions/*`, `src/core/interpolation.ts`, `src/ui/panels/Inspector.tsx`.
- **Verification:** gates + `verify:expressions*` extension (link reads, cycles rejected, frame purity).

## B41 - Background gradient fixes ⬜ (browser)
- **Delivers:** fix the background renderer packing only 4 colour stops while the panel allows 6 (stops 5-6 silently dropped, `renderer.ts:40,5236` vs `BackgroundPanel.tsx:798`) - raise the packed count or cap the UI; add a 4-corner (bilinear, mesh-like) gradient type for Apple-style soft backgrounds.
- **Source beats:** n0g4 40:42-42:13 (4-colour gradient background), every kinetic-type card (style bible §7).
- **Depends on:** nothing.
- **Perf weight:** light (background shader uniforms).
- **Likely files:** `src/engine/renderer.ts` (BG shader + packer), `src/ui/panels/BackgroundPanel.tsx`, `src/core/types.ts`.
- **Verification:** gates + a CPU twin of the background gradient + `gpu:*` pixel check of a 6-stop and a 4-corner gradient.

## B42 - 2.5D debug view + italic serif faces ⬜
- **Delivers:** an orbit / custom view of the 2.5D scene for checking layer depth (camera-independent, viewport-only, not rendered); bundle true italic faces for the accent-word look (e.g. Playfair Display Italic 400/700 and one display italic serif, OFL woff in `public/fonts` + `engine/fonts.ts` manifest with style 'italic').
- **Source beats:** PdHYC 8:21-9:02 (custom 3D view to debug depth); MpaGgpw9Qys 0:00-0:36 + style bible §7 (italic high-contrast serif accent words; today the canvas synthesises an oblique Playfair).
- **Reference replication (Nov 2026):** needed by r02 f102-181, f196-252, f779-832 need the true italic serif; that part moves to B52 (font library); the debug view is not needed by the refs. See `refs/GAP-MATRIX.md` in the task artifacts.
- **Depends on:** nothing (2.5D scope only, per the no-full-3D rule).
- **Perf weight:** light.
- **Likely files:** `src/ui/panels/Camera3DView.tsx`, `src/engine/fonts.ts`, `public/fonts/`.
- **Verification:** gates; fonts: `verify:*` for the manifest entry + headless screenshot of an italic accent.

## B43 - text raster bounds for oblique / overhanging glyphs ✅ (headless-GPU verified)
- **Delivers:** the text rasterizer pads its measured box by the glyph overhang (actualBoundingBoxLeft/Right) plus the synthetic oblique shear (about 0.2 x line height), so no glyph is clipped; applies to the whole-layer path and the per-glyph stamp path (animators, accent words).
- **Source beats:** videos/sample-01 cold open (S05): the accent word "free" in Playfair Display, fontStyle italic, renders its "f" with the left hook cut off (shows as "1ree"). Worked around in the sample by keeping that word upright.
- **Reference replication (Nov 2026):** needed by r02 f102-181, f196-252, f779-832 (italic overhangs on 'second', 'spends', 'Aren't louder.'); ref gap #16. See `refs/GAP-MATRIX.md` in the task artifacts.
- **Depends on:** nothing; B42 (true italic faces) reduces but does not remove it (real italics overhang too).
- **Perf weight:** light.
- **Likely files:** `src/text/` raster/measure code, the per-glyph stamp path.
- **Verification:** gates + headless screenshot of "free project file" with an italic accent on "free" (no clipped pixels at the box edge).
- **Built (wave 2, Nov 2026):** `textAtlas.renderTextToCanvas` pads the raster symmetrically by the measured ink overhang
  (Canvas `actualBoundingBox*` per line or per glyph with tracking, half the stroke, the B36 stamp shear, 1 px slack on both
  axes once padded), then scans the padded raster's border and redraws with a larger pad if a face's metrics under-reported
  its ink (Instrument Serif italic). The raster stays centred on the measured box, so the layout, `measure_text`, glyph slots
  and the layer position do not move; corner pins still map the box. Upright text with no overhang keeps pad 0 / 0 and its
  old raster. Applies to the whole-layer path and the per-glyph stamp path (animators, accent words).
- **Verified:** `gpu:text-bounds` 20/20 against the pinned pre-B43 renderer (b7e9ba3): layout identical; every italic case
  keeps more ink than before and stays within 2% of an unclipped Canvas-2D reference; the pinned ink stops short (defect
  reproduced: stamps "jiffy" +21%, accent word "free" +1.3%, Playfair "f" hook); no ink on any padded raster's border; 7
  upright cases byte-identical. Regression: `gpu:text-paint`, `gpu:text-kinetic`, `gpu:fonts`.

---

## Agent / MCP gaps (B44-B49, from the Nov 2026 MCP audit)

Source: [`docs/MCP-AUDIT.md`](./MCP-AUDIT.md) - three pieces (kinetic title, lower third, logo reveal) built end to end through the FlashFX MCP server (`mcp/examples/build-*.mjs`). Small blockers were fixed in the audit itself (project save / import, image import, get_layer, measure_text, configureParticles, masks on animated text, black first frame, clean screenshots). These are the bigger ones. Every batch keeps the agent manifest in sync (`AGENT_ACTIONS` + a feature, `verify:agent-manifest`) and extends `gpu:mcp` when it adds an MCP tool.

## B44 - One stacking model (track order vs layer array) ⬜
- **Delivers:** `editor.reorderLayers` (used by the agent AND by the UI's Bring to Front / Send to Back, `menuDefinitions.ts:400`) only reorders `composition.layers`, but `resolveFrame` stacks by track order (`interpolation.ts` getStructuralCache: highest track order on top, ties by in-point), so the call has no visible effect when layers sit on separate tracks (every newly created layer does). Make reorder move the layers' tracks (reuse `reorderClipToTrackPosition` semantics in one history command), keep array order and track order consistent, and expose `agent.bringToFront` / `sendToBack` / `setStackIndex`.
- **Source beats:** MCP audit F10 (lower third: shapes created after the texts could not be sent behind them; worked around by creating back to front).
- **Reference replication (Nov 2026):** needed by all 7 refs (pipeline): every collage / card stack is built back to front until this lands. See `refs/GAP-MATRIX.md` in the task artifacts.
- **Depends on:** nothing.
- **Perf weight:** light.
- **Likely files:** `src/store/editor.ts` (reorderLayers, reorderClipToTrackPosition), `src/core/interpolation.ts` (only to confirm the sort), `src/ui/context-menu/menuDefinitions.ts`, `src/agent/*`.
- **Verification:** gates + `scripts/verify-stack-order.mjs` (bring-to-front / send-to-back change the resolved draw order; undo restores; timeline tracks stay valid) + `gpu:mcp` check.

## B45 - Text layout correctness for agents ✅ (Nov 2026, wave 1B, headless-GPU verified)
**Delivered:** (a) glyph stamps are point-mode 1-glyph rasters placed per laid-out line inside the layer canvas, so fixed / fixedWidth boxes and left / centre / right alignment land exactly where the static text draws (lines that start below a fixed box are clipped like the raster); the line width now drops the trailing letter spacing like the raster. Centred type-on / delete re-layout is an option, `TextLayer.reflowHidden` (hidden glyphs take no space, each line re-aligns to its visible glyphs; off by default, as in After Effects), plus a `delete-char` preset. (b) every reveal preset starts its offset at minus its window, so every unit (the first included) is hidden up to the start frame (type-on, pop-in, cascade, slide, rise-line, blur-in, tumble fixed). (c) `agent.createProject { clipLength: "comp" }` / `editor.setDefaultClipLength("comp" | "default")`: new layers span the composition for the session (sessionStorage survives a dev reload). Legacy single-line projects resolve byte-identically (checked against the pre-batch resolver over 909 frames); the only intended change there is centred / right text with letter spacing, whose stamps sat half a spacing off the raster. **Verify:** `verify:text-glyph-motion` (every reveal preset hides everything at and before its start frame and is settled at its end, incl. one-glyph and multi-line text; fixed / fixedWidth left / centre / right placement = the static layout; reflow keeps a centred type-on centred), `verify:agent-manifest`, `gpu:text-kinetic` (clipLength, fixedWidth left box stamps on the plain text, type-on / blur-in draw nothing at f19 / f20). **Limit:** a line that starts inside a fixed / fixedWidth box (fixedWidth boxes are 200 px tall) but overflows its bottom is clipped by the static raster and drawn whole when animated.

- **Delivers:** (a) per-glyph stamps honour `layoutConfig.boundingBox` fixed / fixedWidth and horizontalAlign (today an animated or accent-styled text in a fixed-width box lands at the box top, partly outside its mask); (b) range-selector reveal presets (type-on, blur-in, likely others built on `revealOffset`) hide the first unit before startFrame (today it shows); (c) an agent option on `agent.createProject` (or per call) so new layers span the comp instead of the UI's 4-second clip (today the agent must stretch every layer's outPoint or it vanishes at 4 s).
- **Source beats:** MCP audit F9, F12, F13 (lower third texts misplaced in a fixed-width box; caption and tagline first glyph visible before their reveal; lower third vanished at frame 120 of 150).
- **Reference replication (Nov 2026):** needed by r01 f403-487 (centred type-and-delete re-layout), r02 f35-57, f88-94, f174-186, f249-285, f367-393, f779-798, f1280-1388 (reveals show their first glyph early); ref gap #9. See `refs/GAP-MATRIX.md` in the task artifacts.
- **Depends on:** nothing (B36 multi-line stamps can reuse the box placement).
- **Perf weight:** medium (stamp placement path).
- **Likely files:** `src/core/interpolation.ts` (expandTextGlyphs), `src/core/textAnimatorPresets.ts`, `src/agent/runtime.ts`, `src/store/editor.ts` (defaultClipFrames caller option).
- **Verification:** gates + extend `verify:text-glyph-motion` (fixedWidth left / right placement, first glyph hidden before start for every reveal preset) + `gpu:text-kinetic` screenshot.

## B46 - Agent authoring ergonomics ✅ (Nov 2026, wave 1A)
**Delivered:** `editor.setKeyframes(layerId, path, [{ frame, value, ease }], merge?)` - one undo step, per-segment ease = linear / hold / spring / any named ease / CSS keyword / cubic-bezier quad (pure builder `core/keyframeSpecs.ts`; a `[0, 0]` handle is stored as `[1e-6, 0]` so CSS ease-out is not read as "unset"); errors leave nothing applied. `editor.addShapeLayer({ type, x, y, width, height, fill, stroke?, strokeWidth?, radius, name, points?, innerRatio? })` - one undo step, no stroke by default, returns the id. `agent.measureString` (no layer). `getState()` adds `background`, `tracks` and per-layer `trackId` / `animProps`. **Verify:** `verify:anim-props` (eases evaluate to the exact named / bezier curves incl. overshoot, merge / replace, validation), `gpu:anim-props` (one undo step each, rejects), `gpu:mcp` (setKeyframes over real MCP stdio), `verify:agent-manifest`.

- **Delivers:** `agent.setKeyframes(layerId, path, [{ frame, value, ease }])` where ease is a cubic-bezier quad, a named ease or "hold", applied per segment in ONE undo step (today `setKeyframeInterpolation` writes one handle pair to every target, so per-segment eases need one call per segment); `agent.addShape({ type, x, y, w, h, fill, stroke?, radius, name })` with clean defaults (no 1 px grey stroke); `agent.measureString({ text, fontFamily, fontSize, fontWeight, letterSpacing })` without a layer (today: create probe layers, measure, delete); `getState()` adds the background stack (ids, types) and tracks.
- **Source beats:** MCP audit F14, F16, F21, F22.
- **Reference replication (Nov 2026):** needed by all 7 refs: 261 tracked moves fitted to per-segment cubic-beziers (r01 63, r02 36, r03 71, r04 24, r05 31, r06 18, r07 18); ref gap #1, the top-ranked gap. See `refs/GAP-MATRIX.md` in the task artifacts.
- **Depends on:** nothing.
- **Perf weight:** light.
- **Likely files:** `src/agent/runtime.ts`, `src/agent/featureManifest.ts`, `mcp/flashfx-mcp.mjs`, `mcp/AUTHORING.md`.
- **Verification:** gates + `verify:agent-manifest` + `gpu:agent-runtime` / `gpu:mcp` checks for each new action.

## B47 - Animatable effect parameters ✅ (Nov 2026, wave 1A)
**Delivered:** glow intensity / radius / threshold / colour and shadow distance / angle / blur / scale / colour keyframable through `layer.animProps` (paths `glow.intensity`, `shadow.lightDistance`, ...), resolved in `computeGlow` / `computeShadow` (static fast path unchanged; the legacy numbers stay the base, no migration needed). **Verify:** `verify:anim-props` + `gpu:anim-props` (glow halo brightens and turns blue on screen; keyed == static twin byte-identical at 6 frames).

- **Delivers:** glow (intensity, radius, colour, threshold) and drop shadow (offset, blur, opacity, colour) as `AnimatableProperty` with a legacy-number migration, resolved per frame, keyframable via `editor.addKeyframe` ("glow.intensity"), Inspector stopwatches.
- **Source beats:** MCP audit F15 (logo reveal: a glow pulse on the landing is not possible; glow is a static number).
- **Reference replication (Nov 2026):** needed by r02 f1410-1450 (glow grows); the blur / effect-stack half of ref gap #2 (r01 r03 r05 r06) is B50. See `refs/GAP-MATRIX.md` in the task artifacts.
- **Depends on:** B33 for the colour interpolation (ship the scalar params without it).
- **Perf weight:** medium (resolve path; keep the static fast path).
- **Likely files:** `src/core/types.ts`, `src/core/interpolation.ts` (computeGlow / computeShadow), `src/project-system/services/validation.ts`, the Inspector effects panel, `src/agent/featureManifest.ts`.
- **Verification:** gates + `scripts/verify-effect-keyframes.mjs` (interpolation, legacy projects byte-identical, frame purity).

## B48 - Full-resolution frame render tool ✅ (Nov 2026, wave 1A, headless-GPU verified)
**Delivered:** `agent.renderFrame(frame?, width?, height?)` and `agent.renderStrip(frames, columns?, tileWidth?, labels?)` render through a reused offscreen `WebGPURenderer` exactly like the exporter (same resolve context, `EXPORT_MOTION_BLUR_SAMPLES`, export mode, full-resolution video decode with scheduler cleanup, images resident), as PNG bytes streamed via `readExport`; MCP tools `render_frame` / `render_strip` write the PNG and return it inline. **Verify:** `gpu:anim-props` (renderFrame PNG == a direct offscreen render, byte-identical; aspect; strip geometry) and `gpu:mcp` (over real MCP stdio: the frame-20 render shows the keyed text colour). **Not done:** a frame-N vs exported-MP4-frame-N comparison (codec tolerance check).

- **Delivers:** `agent.renderFrame(frame, width?, height?)` rendering one frame through an offscreen `WebGPURenderer` at comp size with export-quality motion blur and no DOM, returned as PNG bytes (streamed like exports); MCP `render_frame { frame, path }` and `render_strip { frames, path }` (a contact sheet). Today `screenshot` captures the scaled preview canvas (about 1392 px wide in a 1920 window) with preview motion blur (a few stepped copies).
- **Source beats:** MCP audit F17; needed for frame-by-frame replication of the owner's reference videos (side-by-side diffs).
- **Reference replication (Nov 2026):** needed by all 7 refs (pipeline): pixel-true side-by-sides against the reference frames. See `refs/GAP-MATRIX.md` in the task artifacts.
- **Depends on:** nothing (reuse `initializeOffscreen` + `renderFrameAsync` + readback from the `gpu:*` harnesses).
- **Perf weight:** medium.
- **Likely files:** `src/agent/runtime.ts`, `src/engine/renderer.ts` (offscreen path), `src/codec/exporter.ts` (motion-blur sampling), `mcp/flashfx-mcp.mjs`, `mcp/lib/session.mjs`.
- **Verification:** gates + `gpu:mcp` check: render_frame at frame N equals the exported MP4 frame N within codec tolerance.

## B49 - MCP session speed and robustness (import half ✅ Nov 2026, wave 1B; speed half ⬜)
**Delivered (import half):** `agent.importMedia` (video MP4 / MOV / WebM / MKV, audio MP3 / WAV / M4A / AAC / OGG / FLAC, images) through the same `mediaAssetManager` import the Media Pool uses (persisted, bundled by `export_project`); bytes inline or staged in order with `__ffxAgent.writeUpload(uploadId, offset, base64)` (2 GB cap, `discardUpload`); MCP `import_media {path, place, fit, x, y}` streams the file in 4 MB chunks and places it (`editor.addVideoFromAsset` + `fitLayerToCanvas`, new whitelisted `editor.addAudioFromAsset`). **Verify:** `gpu:mcp` (17 checks) exports an MP4, re-imports it in 32 KB chunks into a new project with a generated WAV, proves `render_frame` decodes the time-correct source frame (f5 grey fade-in text, 0 red px; f25 red text) and that the project re-exports with an AAC track. Speed, partly: MCP `--server auto` (the new default) serves dist/ when it is newer than the sources (the 17-check `gpu:mcp` run: 21 s on dist vs 44 s on dev). **Still open:** first seek / first text batch prewarm on the dev server.

- **Delivers:** warm boot (serve `dist` by default when it is fresher than the sources, reuse the tab across `create_project`); remove the 10 s first `seek` and the 8-10 s first text batch on the dev server (prewarm fonts and the text path during boot); headless video / audio import (`import_media { path }` streaming the file into the asset manager in chunks), so footage-based pieces are agent-buildable.
- **Source beats:** MCP audit F3 (video / audio still UI-only), F19 (timings: create_project 29-34 s, first text batch 8-9 s, first seek about 10 s on dev; steady actions 25-50 ms; 4 s 1080p export 5-12 s).
- **Reference replication (Nov 2026):** needed by r05 f306-346, f585-698 and r07 f191-368, f479-667, f763-817, f824-921, f1053-1200 need video import (hard blocker for an agent-only build); speed matters for all 7 (r03 alone is 106 elements); ref gap #8. See `refs/GAP-MATRIX.md` in the task artifacts.
- **Depends on:** nothing.
- **Perf weight:** medium.
- **Likely files:** `mcp/lib/session.mjs`, `src/agent/runtime.ts`, `src/engine/media/assetManager.ts`, `src/engine/fonts.ts`.
- **Verification:** `gpu:mcp` timing assertions (cold create_project under a budget on dist) + an import_media check (a short MP4 imports, places and exports).

---

## Reference-replication gaps (B50-B61, from the owner's 7 reference videos, Nov 2026)

Source: the frame-by-frame breakdowns of the 7 motion references the owner sent (r01 @yunaviaa.1, r02 @divyansh.fx_, r03 @addxstudio, r04-r07 @dija_motion): 87 shots, 357 elements, 261 tracked moves fitted to cubic-beziers. Timing sheets (`rNN/timeline.json`), breakdowns and the ranked `GAP-MATRIX.md` live in the Foreman task artifacts (`tasks/t_124df7beea/artifacts/refs/`). 238 of 357 elements (67%) are buildable through the agent today. Ranking = refs needing it x how common the technique is (1-5). Top of the list are already-queued rows: B46 (7/7 refs), B33 (5/7), B47 + B50 (5/7), B35 + B51 (4/7). Frame ranges below are 1-based at each reference's native fps. Extruded / inflated 3D letters (r01 f76-300) are NOT queued: 2.5D-only scope, replicate with pre-rendered assets.

## B50 - Keyframable blur + effect-stack parameters ✅ (Nov 2026, wave 1A)
**Delivered:** layer blur `blur.radius` / `blur.strength` / `blur.angle` keyframable (a keyed gaussian at radius 0 drops its two passes; a static blur keeps its legacy behaviour), and any effect-stack param via `effect.<type>.<paramIndex>` (`animProps.effectParams`, evaluated by an optional `paramAt` in `resolveEffectStack` for image and adjustment layers). No blur-pool reallocation per frame (the pool is sized by the canvas, not the radius). **Verify:** `verify:anim-props` + `gpu:anim-props` (soft edge narrows from 24 px to sharp; adjustment invert amount ramps; keyed == static twin byte-identical).

- **Delivers:** `LayerBlur.radius` (and strength / angle) plus the effect-stack params that the refs ramp (radial blur, pixelate block size, RGB split amount, digital glitch strength, saturation / tint) as `AnimatableProperty` with a legacy-number migration, resolved per frame, keyframable through `editor.addKeyframe("blur.radius")` / `("effects.N.params.amount")`, Inspector stopwatches. Same pattern as B47 (do B47 first or together).
- **Source beats:** r01 f168-176 (glitch ramp on the title); r03 f128-164, f1014-1024, f1088-1122, f2804-2979 (cards / logo / pills blur in and out, blur dissolves); r05 f211-217, f579-582, f725-790 (radial blur decay, pixelate, RGB split on the logo); r06 f310-362 (photo saturation ramp).
- **Depends on:** B47 (shared migration + resolve pattern).
- **Perf weight:** medium (keep the static fast path; blur radius changes per frame must not re-allocate the blur texture pool).
- **Likely files:** `src/core/types.ts` (LayerBlur, LayerEffect params), `src/core/interpolation.ts`, `src/core/effects/effectStack.ts`, `src/core/effects/blurFxPack.ts`, `src/project-system/services/validation.ts`, `src/agent/featureManifest.ts`, the Inspector effects panel.
- **Verification:** gates + `scripts/verify-effect-keyframes.mjs` (shared with B47: interpolation, legacy projects byte-identical, frame purity) + a headless pixel check of a blur ramp (gpu:adjustment pattern).

## B51 - Agent cursor + click rig ✅ (Nov 2026, wave 1B)
**Delivered:** `animation-templates/cursorRig.ts` over the template rig (`cursor.ts`, which gained an I-beam icon and an optional icon list; the existing templates are unchanged): `agent.addCursor { icon, x, y, frame, color, size, name }` (a group = the hotspot + arrow / hand / ibeam polygon children), `agent.cursorMoveTo { cursorId, frame, x, y, durationFrames?, ease?, arc? }` (two editable position keys from wherever the cursor is at `frame`, ballistic ease-out = the rig's 1 - (1 - t)^2.6 fitted as cubic-bezier [0.38, 1, 0.76, 1], gentle arc as spatial tangents, default duration from the distance; neighbouring moves keep their curves), `agent.cursorClick { cursorId, frame, ripple?, squash?, rippleColor? }` (scale squash exactly ON the click frame + an expanding "Click ripple" ring layer; returns `responseFrame` = click + 2), `agent.cursorIcon { cursorId, frame, icon }` (hold swap on the frame). Each is ONE undo step through the new generic `editor.applyLayerEdits` store action. Registered in `AGENT_ACTIONS` under feature `templates.cursor`; documented in `mcp/AUTHORING.md` section 8a. **Verify:** `verify:ui-kit` (cursor reaches the target exactly at frame + duration, ballistic + arced path, second move keeps the first frame for frame, squash on the click frame, ripple timing, icon swap on the frame, frame purity) + `gpu:ui-kit` (real runtime + WebGPU renderer: the drawn arrow moves by exactly the target delta and stays, is 0.81 of its height on the click frame, the ring is drawn around the hotspot, the hand shows from the swap frame; every action one undo step, undo removes the ring). **Not done:** overshoot-and-correct moves (pass a `backOut`-style cubic-bezier as `ease` instead), sub-pixel idle noise, a nicer hand / I-beam outline (the icons are the template rig's simple polygons).

- **Delivers:** agent actions over the existing `src/animation-templates/cursor.ts` rig: `agent.addCursor({icon, start})`, `agent.cursorMoveTo(cursorId, frame, x, y, ease?)` (ballistic ease-out by default), `agent.cursorClick(cursorId, frame)` (press squash + optional ripple), `agent.cursorIcon(cursorId, frame, icon)`; all undoable, keyframes editable afterwards. Registered in `AGENT_ACTIONS` + a feature.
- **Source beats:** r03 f1838-1998, f2060-2238, f2340-2526, f2527-2589 (cursor clicks on phone / dashboard UI); r06 f252-314 (hand cursor ballistic move, dwell, click on send).
- **Depends on:** nothing (B46 makes the eases nicer).
- **Perf weight:** light.
- **Likely files:** `src/animation-templates/cursor.ts`, `src/animation-templates/instantiate.ts`, `src/agent/runtime.ts`, `src/agent/featureManifest.ts`, `mcp/flashfx-mcp.mjs`, `mcp/AUTHORING.md`.
- **Verification:** gates + `verify:agent-manifest` + `verify:anim-templates` extension + `gpu:agent-runtime` check (cursor reaches the target at the given frame, click squash on the click frame).

## B52 - Font library + agent font import ✅ (Nov 2026, wave 1B, headless-GPU verified)
**Delivered:** (a) 10 lazy-loaded OFL families: Archivo Expanded 400-800 (Archivo variable instanced at wdth 125 with fontTools), Unbounded 400/700/900 + Nunito 400/700/900 (rounded display), VT323 + Silkscreen 400/700 (pixel), Damion (monoline script: Yellowtail is Apache 2.0, not OFL), Montserrat Alternates 400-800, Inter Tight 400-700, Instrument Serif 400 + true italic, Space Mono 400/700; (b) Inter 500 / 600 (same Inter 3.019 build as 400 / 700) and CSS Fonts 4 nearest-weight matching (`fonts.ts:nearestWeight` / `matchBundledFace`); (c) true italic faces (Playfair Display italic 400 / 700, Instrument Serif italic) picked over the synthesized oblique; (d) `agent.importFont(data, fileName, family?, weight?, style?)` + MCP `import_font {path, family?, weight?, style?}` over `customFonts.ts` (now with weight / style descriptors, format sniffing, bad files rejected), the `fontFamilies` agent catalog, AUTHORING.md section 5 Fonts. Boot still loads exactly the 27 pre-B52 faces; the rest load on first use (the text rasterizer requests them), and export / renderFrame / seek / measureString wait for them. Licences: `public/fonts/LICENSES.md`. **Verify:** `verify:fonts` (13 checks: weight fallback, italic selection, every file's OS/2 weight + italic bit, boot set unchanged, lazy load + cache bust, precomp font preload, format sniff), `verify:text-runs` (+1: an italic Playfair accent run draws the true italic file, a 600 run the 600 file), `gpu:fonts` (9 checks over real MCP stdio: an imported WOFF2 measures like its source face, lazy families / Inter 600 / true italics change advances, render_frame ink widths differ from the fallback). **Not done:** files ship as WOFF, not WOFF2 (text-to-outline parses them with opentype.js, which cannot read WOFF2); imported fonts live in the browser font library (IndexedDB), not inside the `.ffx`; italic overhang clipping stays B43.
- **Delivers:** (a) more bundled families chosen from the refs: a wide grotesque (Archivo Expanded class), a rounded display face, a pixel face (VT323 / Silkscreen class), a monoline script (Yellowtail class), a geometric with alternates (Montserrat Alternates class), Inter Tight; (b) 500 / 600 weights for Inter / Inter Tight with correct weight fallback; (c) true italic serif faces (Instrument Serif Italic / Playfair Display Italic) instead of synthesized oblique (moves the italic part of B42 here); (d) `agent.importFont {path}` + MCP `import_font` over the existing `src/engine/customFonts.ts` so an agent can match a reference face. All fonts OFL, woff2, lazy-loaded.
- **Source beats:** r01 f114-176, f180-302, f340-568, f726-898 (11 text elements: wide titles, rounded "make", pixel "404"); r02 f102-181, f196-252, f779-832 (italic serif accents), f1408-1470 (Inter 500 / 600); r03 f1-3691 (38 text elements in a geometric with curly y / t), f838-987, f3320-3429 (script accents).
- **Depends on:** nothing.
- **Perf weight:** light (lazy loading; keep first paint unchanged).
- **Likely files:** `src/engine/fonts.ts`, `src/engine/customFonts.ts`, `public/fonts/`, `src/agent/runtime.ts`, `src/agent/featureManifest.ts`, `mcp/flashfx-mcp.mjs`, the font picker UI.
- **Verification:** gates + `verify:text-runs` extension (weight fallback, italic face picked over synthesis) + `gpu:text-kinetic` screenshot of an MCP-imported woff2 + `verify:agent-manifest`.

## B53 - Perspective cards (2.5D card render proven + corner pin) ✅ (Nov 2026, wave 1B, headless-GPU verified)
**Delivered:** `npm run gpu:camera-cards` (22 checks, local GPU): rotated / pushed / scaled / anchored cards on the shape, path-shape and precomp (image) pipelines, under the default camera, a moved two-node and an aimed one-node camera, land within 1 px of the `core/camera3d.ts` projection (sub-pixel edge fits, measured worst 0.5 px; the projection itself is cross-checked against a hand-written pinhole); painter's depth order; flat-card parity. **It found and fixed two bugs:** (1) the path pipeline (polygon / pen path / shape morph) had no 2.5D MVP path, so a 3D path shape rendered flat (now `PathUniforms` carries is3D + mvp, 512 bytes); (2) `createCameraLayer` put the eye at -compH with a 50 mm zoom, a ~2.5x punch-in the moment a camera was added (eye now at -zoom, AE default; `verify:scene3d` updated). **Corner pin:** `Layer.cornerPin` (four keyframable vec2 pins, comp px) resolved per frame and drawn through the same mvp vertex path with the B27 homography (`core/cornerPin.ts`, no second solver) on shape, path, text, image, video and precomp layers; persisted; `verify:corner-pin` (11) + GPU checks (pins within 1 px; pinned text == the flat text warped on the CPU). **Agent:** `editor.cameraMove(cameraLayerId, frame, to {position, pointOfInterest, zoom, orientation}, durationFrames?, ease?)` (one undo step, `core/cameraMove.ts`, `verify:camera-move` 6) and `editor.setCornerPin(layerId, corners | null)`; card paths `transform.rotationX/rotationY/positionZ` keyed with `setKeyframes` (clear error on a 2D layer); getState flags `is3D` / `cornerPin`; documented in `mcp/AUTHORING.md` section 8b. **Not done:** camera depth-of-field blur and per-glyph 3D text animators are not pixel-proven; corner pin has no Inspector UI (agent only), masks on a pinned layer stay in its unpinned space, glyph stamps are not pinned; no in-app eyeball of the camera UI.

- **Delivers:** (a) a headless WebGPU harness `gpu:camera-cards` that renders rotated 3D cards (rotationX / Y, depth) through the real renderer and checks their corners against `core/camera3d.ts` projection (closes the "M2 GPU wired, never checked" hole); (b) corner pin (4-point homography, the B27 maths) for text / shape / precomp layers; (c) `editor.toggleLayer3D` + `editor.addCameraLayer` already exist - add `agent.cameraMove(frame, {position, pointOfInterest, zoom}, ease)` so a perspective scene is one call per beat.
- **Source beats:** r01 f205-290 (card orbit), f599-616 + f697-717 (note card Y flip + keystone), f725-898 (404 trapezoid stack); r03 f1782-2000, f2056-2238, f2281-2526, f2980-3125 (phones / dashboards in perspective, screen scrolling in a tilted phone); r05 f21-32, f370-399, f432-462 (text cards lean back / yaw); r07 f676-817, f824-921 (cards swing in rotationY).
- **Depends on:** nothing (precomp textures exist for "screen inside a phone").
- **Perf weight:** medium.
- **Likely files:** `src/core/camera3d.ts`, `src/core/mat4.ts`, `src/engine/renderer.ts` (card path), `src/core/tracking/` (homography), `src/agent/runtime.ts`, `scripts/gpu-camera-cards.mjs`.
- **Verification:** gates + `verify:camera3d` + new `gpu:camera-cards` (pixel corners within 1 px of the projection) + `verify:corner-pin`.

## B54 - Pixel-block dissolve / build-on ✅
- **Delivers:** a seeded pixel-block transition for any layer (block size px, order random / directional / from-centre, in or out, duration) as a reveal mask resolved per frame, plus an "8-bit sparkle" generator (stepped random squares around a target box, accent colour). Frame-pure (mulberry32), agent-reachable as presets.
- **Source beats:** r01 f300-316 (card dissolves out in ~16 px blocks), f326-358 (builds on); r07 f5-55 (lime squares flicker around "Video editors!"), f926-975 (blocks around "Use my code").
- **Depends on:** nothing (masks / matte coverage exist).
- **Perf weight:** medium.
- **Likely files:** `src/core/maskReveal.ts`, `src/core/maskCoverage.ts`, `src/animation-templates/`, `src/agent/featureManifest.ts`.
- **Verification:** gates + `scripts/verify-pixel-blocks.mjs` (coverage per frame follows the seeded schedule, scrubbing is byte-identical) + headless render check.
- **Built (wave 2, Nov 2026):** `Mask.blocks` (seeded block pattern on a rectangle region: size, seed, order random /
  directional / center, angle, jitter, in / out, keyed progress), evaluated per pixel in the mask WGSL (`mask_blocksEval`,
  a 2-slot run) with the CPU twin in `core/pixelBlocks.ts` + `core/maskCoverage.ts`; persisted through validation.
  `agent.pixelBlockReveal` (one undo step) and `agent.pixelSparkle` (`animation-templates/pixelSparkle.ts`: a group of
  hold-keyed squares crawling in a ring around a box); feature `masks.pixel-blocks`; recipes `pixel-dissolve`,
  `pixel-sparkle`; `mcp/AUTHORING.md` section 7.
- **Verified:** `verify:pixel-blocks` 20/20; `gpu:pixel-blocks` 6/6 through the MCP: the GPU mask equals the CPU twin
  block by block (400 / 400 blocks at f5, f20, f26, f35), dissolve 400 -> 177 -> 85 -> 0 blocks, every block uniform
  inside, scrubbing back renders the identical set, the sparkle puts 2661 lime px in the ring and 0 on the box.
- **Re-verified + extended (2026-11-26, on `17531c2`):** `gpu:pixel-blocks` 11/11: build-on (`direction: "in"`) now proven
  too, GPU == CPU twin square for square for a 30 deg directional sweep stepped on twos (f17 holds f16) and a centre-out
  sweep at 7 frames each; blocks are only ever added; the `pixel-dissolve` and `pixel-sparkle` recipes run end to end
  through `apply_recipe` (card 55696 -> 26028 -> 0 white px; 2783 lime px around the box, 0 on it).

## B55 - Word roll / slot swap ⬜
- **Delivers:** a text primitive for a vertical word list that steps or rolls (one row per step, hold or eased), with a mask window, per-row colour / opacity (centre bright, neighbours dim) and in-place word swap inside a sentence (the line re-flows around the new word). Agent action `agent.addWordRoll({words, steps:[{frame}], ease})`.
- **Source beats:** r03 f1205-1260 (students to staff to faculty in place); r04 f290-350 (colour-name list steps one 157 px row at f298, 311, 321, 331).
- **Depends on:** B33 for per-row colour animation (ship the roll without it).
- **Perf weight:** light.
- **Likely files:** `src/core/textAnimator.ts`, `src/core/textRuns.ts`, `src/animation-templates/`, `src/agent/runtime.ts`.
- **Verification:** gates + `scripts/verify-word-roll.mjs` (row offset per frame, hold steps exact, re-flow width).

## B56 - Animatable text on path ⬜
- **Delivers:** `TextPathBinding.margin` (today a plain number) as an `AnimatableProperty` plus path-shape keyframes on the bound MotionPath honoured by the glyph placement, so a word unfurls along a curl, rolls back up, or rides the edge of an opening mask.
- **Source beats:** r05 f300-348 (text on arcs above / below the eye-shaped portal bends as the mask opens), f702-724 + f823-855 ("MADE BY" / "DIJA_MOTION" unfurl from a dot and roll back).
- **Depends on:** nothing.
- **Perf weight:** light.
- **Likely files:** `src/core/textPath.ts`, `src/core/types.ts`, `src/core/interpolation.ts`, `src/core/motionPath.ts`, `src/agent/featureManifest.ts`.
- **Verification:** gates + `verify:text-kinetic` extension (glyph positions along an animated margin and a morphing path, frame-pure).

## B57 - Effects on text / shape / precomp layers + layer-local warp ✅ (headless-GPU verified; mesh warp not built)
- **Delivers:** the `effects?: LayerEffect[]` stack on text, shape and precomp layers (today only `ImageLayer` / `AdjustmentLayer` carry it), rendered by sampling the layer's own texture, plus a layer-local bulge / mesh warp effect with an animatable centre and radius that does not touch what is behind.
- **Source beats:** r01 f168-176 (glitch on the title text); r05 f466-578 ("hope i make it out of here" bulges and warps over footage).
- **Depends on:** B50 for animated params; reuses the precomp RTT path for text / shapes.
- **Perf weight:** **heavy** (per-layer RTT for non-image layers).
- **Likely files:** `src/core/types.ts`, `src/engine/renderer.ts`, `src/core/effects/effectStack.ts`, `src/core/warp/`, the Inspector effects panel.
- **Verification:** gates + `verify:effects` + `verify:warp` + a headless pixel check on a text layer (gpu:adjustment pattern; layers below stay byte-identical).
- **Built (wave 2, Nov 2026):** precomp layers carry `effects?: LayerEffect[]` (resolved per frame with B50 keyed params into
  `ResolvedPrecomp.effects`, run by the image pipeline's warp / spatial / colour slots on the precomp texture); text / shape /
  video / lottie layers get a stack through `agent.applyLayerEffects` (precompose + stack; `editor.setLayerEffects` is now an
  agent action too; the editor's effect-stack actions accept precomps). `bulge` takes `[amount, centreX, centreY, radius]`
  (radius 0 = the old centred bulge; CPU twin `core/effects/layerEffects.ts`). `digitalGlitch` on a premultiplied source shifts
  coverage with the slices. Precompose fixes found on the way (pre-existing): the precomp layer was placed at (0, 0) (its
  centre on the top-left corner, so everything precomposed moved), the new sub-comp drew the default opaque background,
  precomp textures (premultiplied) were composited as straight alpha (darkened edges), and a nested render overwrote the
  parent's shared background uniforms. Not built: a free-form mesh warp (bulge / twirl / wave / ripple cover r05's beat).
- **Verified:** `verify:layer-effects` 9/9 (parser, bulge twin == the original centred bulge to 1e-12 for 1-param stacks,
  positioned bulge only inside its radius, precomp stack resolution + keyed params, persistence), `verify:precomp` 16/16,
  `gpu:layer-effects` 6/6 through the MCP: precompose + identity stack == the plain frame (max delta 1), the glitch changes
  the title and no row above / below it, the text stays editable inside the precomp, keyed amount 0 at f0 == plain, the
  positioned bulge changes pixels only inside its circle; `gpu:camera-cards` 22/22 (precomp card + corner pin).
- **Re-verified + extended (2026-11-26, on `17531c2`):** CPU twin of the slice glitch (`digitalGlitchSlices` / `hash21f32`
  in `core/effects/layerEffects.ts`: 40 bands, re-roll every 2 frames, ~amount/2 bands slide, each by its own fixed shift
  <= amount x 0.1 UV). `verify:layer-effects` 12/12 (3 new twin checks). `gpu:layer-effects` 8/8: on black, each glitched
  27 px band equals the plain title shifted by the twin's shift (22 inked bands at f4 / f6, 7 slid, 15 still, worst mean
  |dG| 0.01/255), and the `glitch-burst` recipe runs end to end through `apply_recipe` (clean at f30 / f38, glitched at
  f33, 0 px changed above the word).

## B58 - Gradient-blob field generator ⬜
- **Delivers:** a seeded generator layer of soft animated colour blobs (count, palette, blur, drift speed, lumpy top-edge "cloud floor" mode) so blurred-glow backgrounds are one layer instead of hand-placed blurred ellipses.
- **Source beats:** r06 f97-372 (blue to white billowing cloud floor under the prompt bar). r03 and r07 hand-build similar glows today.
- **Depends on:** nothing (generativePattern / procedural modules can host it).
- **Perf weight:** medium.
- **Likely files:** `src/procedural/`, `src/core/types.ts`, `src/agent/featureManifest.ts`.
- **Verification:** gates + `scripts/verify-blob-field.mjs` (seeded, frame-pure) + headless render.

## B59 - Script / logo write-on ⬜
- **Delivers:** stroke-order write-on for filled script glyphs and logos: derive a centreline (skeleton) from the outline, trim it over time and use the stroked centreline as the reveal matte of the filled shape.
- **Source beats:** r03 f1022-1034, f3431-3442, f3581-3595 (the "ly" monogram and script accent words write on).
- **Depends on:** nothing (Trim Paths + track mattes exist).
- **Perf weight:** medium.
- **Likely files:** `src/core/pathOps.ts`, `src/core/strokeOutline.ts`, `src/core/shapeModifiers.ts`, `src/core/trackMatte.ts`.
- **Verification:** gates + `verify:pathops` extension (centreline coverage at t = 0, 0.5, 1).

## B60 - Cloner per-instance sources ✅ (headless-GPU verified)
- **Delivers:** the renderer draws `ResolvedCloner.instanceSources` (already resolved for data binding) so each copy can be a different image, plus an agent option `sources: [layerId...]` on the cloner (instance i uses source i mod n).
- **Source beats:** r04 f432-529 (ring of different photo tiles spawning along the arc, one full 357 deg turn f448-518).
- **Depends on:** nothing.
- **Perf weight:** medium.
- **Likely files:** `src/cloner/`, `src/core/interpolation.ts` (stamp expansion), `src/agent/featureManifest.ts`.
- **Verification:** gates + `verify:cloner-render` extension (instance i draws source i mod n).
- **Built (wave 2, Nov 2026):** `ClonerLayer.sources?: string[]` (persisted, strings only) -> `ResolvedCloner.sourceLayerIds`;
  the cloner expansion in `resolveFrame` stamps `sources[i mod n]` for instance i (instance transforms unchanged: the main
  `sourceRef` layer still drives distribution + stagger), and hides every listed layer. The renderer needed no change
  (cloners render as stamps of resolved layers, so any layer type works: shapes, images, text, video). Agent:
  `agent.setClonerSources` (one undo step; `[]` = one source), listed under feature `cloner.mograph`; AUTHORING section 8.
- **Verified:** `verify:cloner-sources` 6/6 (cycling, identical instance transforms, hidden sources, unknown ids skipped,
  empty list = old behaviour, persistence), `gpu:cloner-sources` 4/4 through the MCP (8 copies render red / green / blue /
  logo image in order, the sources' own spot is empty, one undo returns to one source).

## B61 - Liquid drip / melt text ⬜ (browser, low priority)
- **Delivers:** letters that melt into glowing drips running down and pooling, as a seeded drip-path generator (per-glyph drip origins, gravity curve, pool) rendered as stroked pen paths with glow.
- **Source beats:** r05 f110-210 ("ideas" melts into rainbow neon drips).
- **Depends on:** B50 / B47 for animated glow.
- **Perf weight:** **heavy**.
- **Likely files:** `src/core/textOutline.ts`, `src/core/shapeModifiers.ts`, `src/procedural/`.
- **Verification:** gates + `scripts/verify-drip.mjs` (seeded drip paths, frame-pure) + headless render.

## B62 - Agent shape morph ✅ (Nov 2026, wave 1A; owner's F2 format: heavy morphs)
**Delivered:** `PathKeyframe.ease` (named ease or cubic-bezier quad, overshoot allowed) and `PathKeyframe.align: 'auto'` (re-index the next pose to the start point + winding with the least squared travel, so rect -> circle does not twist); absent = the B8b linear index-0 morph, byte-identical. `core/shapeOutline.ts` builds bezier outlines (rounded rect, ellipse in 4 kappa arcs, star, regular polygon, free points), all starting at the top and running clockwise. Store action `setShapeMorph(layerId, poses, align?)` converts any shape layer to a path with the morph in one undo step (fill, stroke, materials, transform kept); agent action + `shapes.morph` feature; persistence of ease / align in `validation.ts`. **Bug fixed on the way:** `pathTessellation.earClip` stalled on rings with a collinear vertex (its inclusive point-in-triangle test blocks every ear) and filled only one triangle - a square starting at its top-middle filled half; resampled morph rings carry many collinear points. `cleanFillRing` drops the duplicated closing point, duplicates and collinear points before ear clipping (same filled region). **Verify:** `verify:shape-morph` (13 checks: outline geometry, legacy byte-identity, eases incl. overshoot, hold, alignment recovers shifted / reversed rings, frame purity, full fill area of every morph frame) + `gpu:anim-props` (morph renders byte-identically to static-path twins; square corner -> star tip -> circle on screen; one undo step).

## Replica findings (B63-B67, from rebuilding r02 r04 r06 r07 through the MCP, Nov 2026)

Found while rebuilding four of the owner's references frame by frame (artifacts `replicas/rNN/notes.md`, `gaps.json`). Each was
worked around through agent actions in the replica builds; the workaround is listed so the fix can be checked against it.

## B63 - Shape render correctness ✅ (Nov 2026, headless-GPU verified)
- **Delivers:** fixes for seven shape defects: (1) the SDF circle / rounded-rect stroke is centred on the edge but clipped at the
  shape bounds, so the outer half is cut (rings get flat sides, pill outlines lose their ends); (2) a rectangle whose width with
  borderRadius exceeds ~2048 layer px draws pointed lens-shaped ends; (3) a circle with non-uniform `transform.scale` renders as a
  uniform circle at the smaller scale (AUTHORING says this is the ellipse path), static or keyed; (4) a `setShapeMorph` ellipse pose
  with width != height renders with wrong, larger geometry and drops a radial gradient to flat colour; (5) borderRadius is not
  clamped to min(w, h) / 2; (6) a shape `materialConfig` with a radial colour-to-transparent layer renders nothing; (6b) `setShapeMorph` with a single pose, or
  with ease `hold` on the first pose, renders nothing (two plain poses work); (7)
  `addShapeLayer { type: 'polygon' }` has no sides option and makes a rectangle.
- **Source beats:** r02 f26-66, f305-416, f833-1278 (rings, pill outlines), f422-674 (hexagons); r06 f96-334, f462-500 (prompt bar,
  wipe bands, dome); r07 f1-190, f668-1200 (radial glow blobs).
- **Workarounds in the replicas:** `editor.convertShapeToPath` for rings; black pill under a white pill for outlines; big rounded rects
  built at half size with scale 2; stadium rects instead of ellipses; solid circles + gaussian blur instead of radial materials; a
  6-point star with innerRatio 0.866 for a hexagon.
- **Verification:** gates + `verify:shape-*` extension (stroke coverage outside the fill, ellipse from scale, radius clamp) + a
  `gpu:anim-props`-style headless pixel check of each case against its path-shape twin.

- **Built (Nov 2026):** (1) the SDF quad is padded by half the stroke + a 2 px AA margin (`core/shapeSdf.ts`
  `shapeSdfParams`, the renderer's `quadPad`), so strokes are never cut; an unstroked rectangle keeps its exact quad
  (byte-identical). Circles draw at their true radius (the old 1.1x margin was read as the radius: every circle was 10 %
  too large). (2) Corner radii scale with the layer's world scale and (5) clamp to half the short side: the "> 2048 px lens
  ends" were an unscaled radius on a pill under a 0.5 null. (3) `CircleShape.radiusY` (keyframable `shape.radiusY`): an
  ellipse, drawn by a robust closest-point ellipse SDF (CPU twin `ellipseDistance`); a non-uniform layer scale also gives
  an ellipse; `addShapeLayer` circle w != h makes a true ellipse at scale 1. (4) The morph ellipse "wrong, larger geometry"
  was the old stretch scale inherited by the morph (fixed by 3), and path / morph / polygon fills now take gradient
  materials per pixel in the path shader (shared `FILL_WGSL`). (6) The "radial material renders nothing" config was
  written in 0..1 units (layer opacity 1 %, stops at 0..1 %): materials are now read tolerantly (0..1 fractions,
  missing ids / opacities / positions, RGBA array colours). (6b) A single-pose / hold sunburst (16 wedges through one
  centre) made the ear clipper stall with 0 triangles: an unfinished ear clip now falls back to earcut. (7)
  `addShapeLayer polygon` takes `sides` (alias `points`).
- **Verified:** `npm run verify:shape-render` 10/10 (in `npm test`); `npm run gpu:shape-render` 18/18 on the fixed tree,
  1/18 on the pre-B63 tree (every defect reproduced; the one pass compares two empty frames); plain rects, rounded rects
  and path fills byte-identical before / after (a star differs by 1 level on 7 px).

## B64 - Text paint ✅ (Nov 2026, engine session 26 Nov, headless-GPU verified)
- **Built:** (1) the text resolver ignored `content.spans.N.style.strokeWidth` (it read only `animOverrides.strokeWidth`, default 0),
  so outline-only text drew nothing and a stroke on filled text never showed: `core/interpolation.ts:textStrokeWidth` now takes a keyed
  or non-zero override, else the span style (old projects: style width 0, byte-identical). (2) On the glyph-stamp path (animators,
  accent words, text on a path) every 1-glyph raster built the gradient over its own box, so the ramp restarted in each letter (the
  "missing crossbars" / "no top-to-bottom ramp" reads): `ResolvedText.fillFrame` gives each stamp the whole text box at the glyph's
  home slot (`engine/textAtlas.ts:buildTextGradient` offset, folded into the raster cache key). The whole-layer raster was already right
  at 90 / 180 / 270; the crossbar drop itself did not reproduce on the current branch (coverage within 1% of the solid twin).
- **Verified:** `npm run gpu:text-paint` (render_frame pixels: coverage at 180 deg = solid twin on both paths, 90 / 270 ramps, stroke-only
  outline drawn and thinner than the fill); `gpu:text-kinetic` 11/11 unchanged.
- **Delivers:** outline-only text (transparent fill + `strokeColor` / `strokeWidth`) renders its stroke; a linear gradient fill at any
  angle keeps every glyph stroke (angle 180 drops the horizontal crossbars of T and f today) and angle 90 / 270 ramps top to bottom.
- **Source beats:** r02 f264-366 (outlined question marks); r04 f355-431 (statement text gradient #151d24 to #306181).
- **Workarounds in the replicas:** light solid fill instead of an outline; flat colour instead of the gradient.
- **Verification:** gates + `verify:text-runs` extension + `gpu:text-kinetic` screenshot (crossbar pixels present, stroke-only glyph
  coverage > 0).

## B65 - Agent video clip timing ⬜
- **Delivers:** `editor.moveClipInTime` moves video layers (today it returns ok and the inPoint stays 0); `import_media` of a video no
  longer re-packs earlier video clips back to back; a shape used as a track matte over a video mattes it in render_frame / export.
- **Source beats:** r07 f191-368, f479-667, f763-823, f1053-1200 (webcam card, screen recording, demo previews, selfie card).
- **Workarounds in the replicas:** each clip at frame 0 on its own track, padded with a frozen first frame up to the shot start, hold
  opacity until the shot, outPoint at the shot end (reload-safe); square-cornered
  webcam card instead of a matte.
- **Verification:** gates + `gpu:mcp` extension (two clips imported, the first keeps its timing; moveClipInTime shifts the decoded
  source frame; matte coverage pixel check).

## B66 - Motion blur from parent transforms ⬜ (browser)
- **Delivers:** export / render_frame motion blur samples the full world transform (parent chain included), so a layer moved or zoomed
  by a null gets the same smear as when the motion is keyed on the layer itself.
- **Source beats:** r02 f6-16 ("Attention" zooming in from ~5x), f150-154, f232 (whips).
- **Verification:** gates + headless pixel check: a parented layer and its unparented twin with identical world motion render the
  same blurred frame.

## B67 - Agent authoring ergonomics (replica friction) ✅ (Nov 2026, engine session 26 Nov, headless-GPU verified)
- **Built:** `core/keyframeSpecs.ts:canonicalEase` (easings.net / AE names -> canonical, also in setShapeMorph, cursor and camera moves);
  `agent.placeText` (ink centre / baseline / box, measured with `engine/textAtlas.ts:getTextInkMetrics`; chosen over a createQuickText
  flag because placement must happen after styling and font loading); `core/effectDefaults.ts:defaultGlowFor` (text / shape first
  glow = own colour, threshold 0; Inspector toggle and `enableLayerEffect` share it); `agent.setTrimStartAngle` +
  `core/shapeModifiers.ts:pathFractionAtAngle`; AUTHORING notes (spaces, placement, outline text, rings).
- **Verified:** `verify:anim-props` 19/19 (aliases = canonical curves, glow default, clock-angle fractions), `verify:agent-manifest`
  11/11 (125 actions), `gpu:text-paint` (rendered ink centre within 1 px of y, baseline row, green glow halo, 12 o'clock arc).
- **Delivers:** `setKeyframes` accepts the breakdown names (`easeIn`, `easeOut`, `easeInOut`, `easeOutCubic` ...); a `createQuickText`
  option to place text by ink centre or baseline (today y = the line-box centre, so mixed-case words sit ~0.15 x size high); glow
  defaults visible on coloured text (white glow at threshold 0.6 vanishes on green); a trim start-angle option; AUTHORING note that
  text layout ignores leading / trailing spaces (padding does not move text).
- **Verification:** gates + `verify:agent-manifest` + `verify:anim-props` extension (alias names resolve to the same curves).

## B68 - Export fails on a video clip ✅ (browser, launch-relevant)
- **Delivers:** the real exporter (`agent.exportMp4` / File > Export Video) completes on comps with video layers. Today it aborts with
  `A valid external Instance reference no longer exists.` whenever r07's stand-in flower clip (538x958 H.264, scale 2.0-2.5, keyed
  position) is in the comp, about 80 s in. Bisected on the saved project: all 5 clips fail (also at 540 px wide, also with the clips
  hidden by opacity, with a negative `video.startOffset`, with head-padded clips); no clips ok; webcam only ok; poster only ok;
  flowers only fails, and replacing the flower clip with a still still fails, so another clip (screen recording or selfie) also
  triggers it. `render_frame` of the same frames works. Suspect: the export path closes a `VideoFrame` that is still bound
  (`frameScheduler.evictOldestForExport` / `importExternalTexture`); cause not confirmed.
- **Repro:** `artifacts/replicas/r07/project.ffx` (import_project, then export_mp4); r07 shipped its replica.mp4 by rendering every
  frame with render_frame (`replicas/r07/render_mp4.mjs`) because of this.
- **Verification:** gates + `gpu:mcp` extension: export a comp with a scaled, keyed 540x960 H.264 clip end to end; decoded frame at
  t matches render_frame(t).
- **Built (wave 2, Nov 2026):** the exporter and `render_frame` own their video frames (`src/engine/video/exportFrameSource.ts`
  + pure planner `exportFrames.ts`): exactly the frames the current comp frame needs are held, each clip decodes through one
  forward mediabunny cursor (`videoDecoderPool.openExportReader`, at most 3 per asset), and the shared preview `frameScheduler`
  is never read, filled or pruned by an export (its playback prefetch and open-frame cap used to close / race export frames and
  multiply live decoders). Video inside precomps is decoded too (`collectExportVideoDecodes` walks nested frames). A software
  retry keeps the first failure in its message.
- **Verified:** `verify:export-frames` 6/6 (planner + simulated linear export: each clip frame decoded once, held = need),
  `verify:export-math` 14/14, `gpu:export-video` 5/5: five 540x960 H.264 clips scaled 2.0 -> 2.5 and position-keyed export
  through `export_mp4` (150 frames, 19 s) with exported frames == `render_frame(t)` (mean abs diff 1.8-2.0 / 255, exact frame
  alignment), and the real repro `replicas/r07/project.ffx` exports end to end (1200 frames, 111 s; f600 diff 1.22 / 255).

## Second-batch gaps (B74-B80, from the r08-r11 breakdowns, Nov 2026)

Mapped against the branch after waves 1A + 1B (`refs/GAP-MATRIX.md` in the task artifacts, "Ranked open gaps across all 11
references"). The ids proposed there as "B69-B74" collided with the replica rows B69-B73 above and were renumbered here:
conic-gradient-fill = B74, text-counter = B75, design-tool-ui-kit = B76, text-style-keyframes = B77, freeform-mask-feather = B78,
footage-person-matte = B79, outline-imported-fonts = B80.

## B74 - Conic gradient fill on shapes ✅ (headless-GPU verified)
- **Delivers:** a conic (angular) gradient fill type on shape layers (rect / circle / path) with keyframable start angle and centre, so a hue-wheel ring spins by keying one number; agent-reachable.
- **Source beats:** r08 f145-1057, f1082-1477 (spinning hue colour-wheel ring in every section).
- **Verification:** gates + CPU twin of the conic colour at a pixel + headless pixel check (hue at 12 / 3 / 6 / 9 o'clock).
- **Built (wave 2, Nov 2026):** material layer type `conic` (start `angle` in degrees, optional `centerX` / `centerY`) ->
  `gradientType 2` in `resolveShapeFill`; the shape gradient shader's `gradientT` and its CPU twin `core/fillSampler.ts` sweep
  clockwise from the start angle (0 = 12 o'clock) around the centre; works for fills and strokes (`strokeMaterialConfig`);
  the Material panel offers Conic. The start angle is static: spin the wheel by keying the layer rotation (same result for a
  wheel / ring around its centre). Feature `shapes.conic-gradient`; AUTHORING section 6.
- **Verified:** `verify:conic-gradient` 5/5 (resolver mapping, hue at 12 / 3 / 6 / 9, radius-independent + seamless, start
  angle + centre, linear / radial unchanged); `gpu:conic-gradient` 3/3 through the MCP (GPU wheel colours at the four clock
  points, GPU == CPU twin at 16 angles within 0.9 / 255, keyed rotation spins it 90 deg).

## B75 - Styled number counter ✅ (headless-GPU verified)
- **Delivers:** a counter binding on a text layer: from / to, decimals, separators, compact suffix (10K, 1.2M), prefix / suffix text, ease, start / end frame; the text keeps its own font, style and colour; frame-pure.
- **Source beats:** r08 f330-440, f653-684, f893-924, f1196-1335, f1480-1492.
- **Verification:** gates + `verify:*` harness (formatted string per frame, scrubbing byte-identical).
- **Built (wave 2, Nov 2026):** `TextLayer.counter` (`core/textCounter.ts`: from / to, frame range, ease name or cubic-bezier,
  stepFrames, decimals, separator, decimal mark, compact K / M / B with rounding that never shows "1000K", prefix / suffix,
  spanIndex), applied in `resolveFrame` by rewriting the counter span per frame (`withTextCounter`, same object when absent);
  persisted through validation. `agent.setTextCounter` (one undo step, returns sample strings), feature `text.counter`,
  recipe `count-up`, AUTHORING section 5.
- **Verified:** `verify:text-counter` 8/8 (formatting, compact, easing / stepping / clamping, prefix / suffix, only the counter
  span rewritten, per-frame resolve + identical scrub, persistence); `gpu:text-counter` 3/3 through the MCP (an italic
  Instrument Serif counter at f0 / f15 / f30 is pixel-identical to the same layer typed by hand: 0 px differ).

## B76 - Design-tool UI kit ⬜
- **Delivers:** cursor icons for a design app (pen, crosshair, rotate, direct-select) on the B51 rig, a selection box with corner handles that tracks a target layer's bounds over time, anchor squares on path points, and a number tooltip (dX / dY / W / H / angle) whose value follows the target; agent actions; one undo step each.
- **Source beats:** r11 every shot (f7-1067).
- **Verification:** gates + `verify:*` harness (box tracks the target bounds per frame, tooltip text = measured delta).

## B77 - Text style keyframes ✅ (headless-GPU verified)
- **Delivers:** hold keyframes on a text layer's font family / weight / style (the face switches on the key frame, layout re-flows); agent-reachable.
- **Source beats:** r10 f674-735.
- **Verification:** gates + `verify:*` harness (resolved face per frame).
- **Built (wave 2, Nov 2026):** `TextLayer.styleKeys` (`core/textStyleKeys.ts`: hold keys of full faces, missing fields
  inherited from the previous key, optional spanIndex) applied in `resolveFrame` before layout (same hook as B75); persisted;
  each key carries a full face so the font walk loads it. `agent.setTextStyleKeys`, feature `text.style-keys`, AUTHORING 5.
- **Verified:** `verify:text-style-keys` 5/5; `gpu:text-style-keys` 3/3 through the MCP (keyed faces at f5 / f15 / f25 are
  pixel-identical to the same faces set by hand; the frames differ from each other).

## B78 - Soft freeform matte ⬜ (browser)
- **Delivers:** a blurred (or feathered) shape used as an alpha track matte keeps its blur in the matte, so a soft-edged shape reveals the layer below.
- **Source beats:** r10 f604-611.
- **Verification:** gates + headless pixel check of the soft matte edge ramp.

## B79 - Person matte on footage ⬜ (browser, heavy)
- **Delivers:** an AI person segmentation matte on a video layer. Out of wave 2 scope; fallback a pre-keyed stand-in clip.
- **Source beats:** r09 f256-296.

## B80 - Outline text robustness ⬜
- **Delivers:** `editor.outlineTextLayer` works on imported fonts and keeps every contour of multi-part glyphs (i, j, !, :).
- **Source beats:** r11 (all letter edits).
- **Verification:** gates + `verify:*` harness on the outline contours.

