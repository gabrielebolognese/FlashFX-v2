# FlashFX Feature Build Plan — Batches

The implementation plan for [`AFTER-EFFECTS-PREMIUM-FEATURES.md`](./AFTER-EFFECTS-PREMIUM-FEATURES.md). Its 28 research categories are re-cut here into **batches**: each batch is a coherent, dependency-ordered chunk sized to what can realistically be built **deeply and bulletproof in a single prompt**, then verified and shipped.

## How this works

- **One batch per prompt.** You run `/next-batch` to see the current batch, then reply **go** to build it. Nothing is implemented until you say go.
- **Audit before building.** Every batch starts by verifying what already exists in the editor (this codebase already has a lot — shape layers, masks, expressions, 2.5D camera, particles, cloner, precomp, text animators, per-layer motion blur, color-correction, physics bake, field sampling). We build only the genuine gaps and fix what's broken — never duplicate.
- **Verified, not vibes.** Each batch ends green on the standing gates — `tsc` (0 errors) · `lint` (125-problem baseline) · `build` · `npm test` — and adds a `scripts/verify-*.mjs` harness for any pure logic it introduces. Then commit + push.
- **Batches can split.** If a batch proves bigger than one prompt once we're in it, we split it (e.g. "B19a / B19b") rather than cram — bulletproof beats broad. This document is the source of truth; completing a batch flips its status here.

## Performance principles (why the ordering is what it is)

1. **Foundations before dependents.** Shared infrastructure is built once and reused. The big one is **B11 (effect-stack framework + adjustment layers)** — most finishing/stylise/glow/glitch/color batches depend on it, so they compose through one ordered GPU post-pipeline with a shared render-to-texture / ping-pong pool instead of each effect inventing its own passes.
2. **Perf-heavy features get their own batch.** Anything GPU-compute-bound or motion-estimation-bound (particles, optical-flow retiming, tracking, denoise, true 3D objects) is isolated so it gets full attention and its own profiling, never lumped with light work.
3. **Frame-purity is non-negotiable.** The timeline scrubs non-sequentially; every new evaluator must be a pure function of `(state, frame)` (house `mulberry32` for any randomness — no `Date`/`Math.random`). This keeps caching (`renderTree`, LRU) valid.
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
| B4b | Keyframe assistants — The Smoother + The Wiggler | ✅ | light |
| B5a | Time-remap model + speed ramps + Exponential Scale (pure + UI) | ✅ | medium |
| B5b | Frame-mix frame blending (two-frame cross-dissolve via resolve-time expansion) | ✅ | medium |
| B6a | Optical-flow retiming foundation (pure + mode + UI; GPU pass deferred) | ✅ | medium |
| B6b | Optical-flow GPU estimator + warp pre-pass (WebGPU, browser-gated) | ✅ | **heavy** |
| B7 | Procedural motion expressions (offset loop, inertial bounce, lag) | ✅ | light |
| B8a | Path modifier operators — trim / offset / roughen (pure, resolve-time) | ✅ | light |
| B8b | Shape morph + pucker/bloat + keyframable path (resample/correspondence/interp) | ✅ | medium |
| B8c | Dashed strokes + gradient strokes on pen paths (render, browser-gated) | ▶ **next** | medium |
| B8d | In-shape Repeater operator (per-copy transform accumulation) | ⬜ | medium |
| B9 | Kinetic typography completion (type-on, cascades, decode, path text) | ⬜ | light |
| B10 | Masks / track mattes / roto completion | ⬜ | medium |
| B11 | ★ Effect-stack framework + adjustment layers + blend-mode audit | ⬜ | medium (foundation) |
| B12 | Glow & light finishing (bloom, deep-glow, light wrap, glints) | ⬜ | medium |
| B13 | Stylise & cinematic finish (chromatic ab., lens distort, grain, halftone) | ⬜ | medium |
| B14 | Glitch & datamosh (RGB split, pixel-sort, VHS, block glitch) | ⬜ | medium |
| B15 | Color grading (wheels/curves/HSL, LUT loading, film looks) | ⬜ | medium |
| B16 | Light rays, flares & beams (lens flare, Saber-like beams, god-rays) | ⬜ | **heavy** |
| B17 | Tiling & generative simulations (motion tile, caustics, wave/radio, cell) | ⬜ | medium |
| B18 | 3D scene completion (DOF/bokeh, lights & shadows, parallax, focus pull) | ⬜ | **heavy** |
| B19 | Particle system polish (emitters, physics, trails, fire/smoke/confetti) | ⬜ | **heavy** |
| B20 | Generative geometry (3D stroke, plexus, flowing surfaces) | ⬜ | **heavy** |
| B21 | Physics dynamics (collisions, stacking, springs/ropes, soft-body) | ⬜ | **heavy** |
| B22 | 3D objects & extrusion (extruded text/logos, materials) | ⬜ | **heavy** |
| B23 | Destruction generators (shatter, card dance) | ⬜ | medium |
| B24 | Deformation & warp (puppet, liquify, turbulent displace, ripple, roughen) | ⬜ | medium |
| B25 | Character rigging (rubber-hose limbs, IK, joystick controllers) | ⬜ | **heavy** |
| B26 | Transitions & preset system (save/browse, drag-drop, MOGRT-like controls) | ⬜ | light |
| B27 | Tracking & match-move (point/planar track, corner pin, stabilize) | ⬜ | **heavy** |
| B28 | Keying (chroma/luma key, spill suppression, edge refine) | ⬜ | medium |
| B29 | Footage cleanup & beauty (denoise, deflicker, skin retouch) | ⬜ | **heavy** |
| B30 | Practical VFX compositing (stock element add/screen workflow, light leaks) | ⬜ | light |
| B31 | Audio-reactive & data-driven (audio→keyframes, visualisers, data binding) | ⬜ | medium |
| B32 | Motion-design principle rigs (anticipation, follow-through, squash & stretch) | ⬜ | light |

---

## B1 — Easing engine core ✅ DONE
**Delivers:** true Penner family + Back/Elastic/Bounce eases; `Keyframe.easing`; one canonical `segmentProgress` shared by renderer + graph editor; fixed the render-read-both-handles-off-start bug and the `handle||default` zero-clobber. **Categories:** 1. **Files:** `core/easings.ts`, `core/keyframeEase.ts`, `core/interpolation.ts`, `core/types.ts`, `InterpolationGraph.tsx`, `store/editor.ts` (`setKeyframeEasing`), `menuDefinitions.ts`. **Verify:** `verify:easing` (19 checks).

## B2 — Graph Editor Pro ✅ DONE
**Delivered:** **Speed Graph** toggle (read-only velocity-over-time curve — the derivative of the value curve, with its own value/s scale, a zero line, and keyframe ticks) beside the Value Graph; the numeric handle strip now shows the **AE Keyframe-Velocity model** — **Influence %** and **Speed (value/s)** for the In and Out sides (round-trip-safe converters in `core/keyframeEase.ts`); **F9 / Shift+F9 / Ctrl+Shift+F9** easy-ease hotkeys on the current keyframe selection; `setKeyframeInterpolation` now clears any named ease so Linear/Ease/F9 correctly override an elastic/bounce. **Files:** `core/keyframeEase.ts` (influence↔handle helpers), `InterpolationGraph.tsx`, `App.tsx` (F9), `store/editor.ts`, `menuDefinitions.ts` (exported ease constants), new `ui/panels/keyframeSelection.ts` (shared selection resolver). **Verify:** `verify:easing` (now 22 checks — incl. influence↔handle round-trip). **Deferred:** dragging on the Speed Graph itself (read-only for now).

## B3a — Spatial motion path ✅ DONE
**Delivered:** ordinary position keyframes now travel a **curved path through space** (arc-length-parameterized cubic bezier, so eased time = constant speed along the arc), separate from temporal easing. `Keyframe.spatialIn/spatialOut/spatialMode`; a pure `core/positionPath.ts` (bezier + arc-length reparam + auto-tangents); `interpolation.ts` uses it for any position segment carrying tangents (every other vec2 property is untouched). Keyframe context menu → **Motion Path: Smooth (Auto Bezier)** / **Linear** (`setKeyframeSpatialMode`, auto-computes smooth tangents from neighbours). The "Show Motion Paths" overlay draws the curved path for all layers and **per-frame spacing dots** for the selected layer (capped at 240) — the velocity/weight X-ray. **Verify:** `verify:spatial-path` (7 checks — endpoints, constant-speed arc-length, straight-vs-curved, auto-tangent smoothness). **Categories:** 1.

## B3b — Motion-path tangent handles + roving ✅ DONE
**Delivered:** **draggable spatial tangent handles** on the selected layer's position path (`PositionPathOverlay.tsx`) — plain drag keeps the handle mirrored (smooth), Alt-drag breaks it (independent); Auto→Bezier on first drag; one undo entry per drag (batched `updateLayerProperty` + `commitDrag`). **Roving** via `roveKeyframesAcrossTime` (redistributes the middle position keyframes' frames by arc length so speed is constant along the whole path — a keyframe-assistant retiming, no eval change), on the "Motion Path (Spatial)" context group alongside Smooth/Linear. Engine helpers `segmentArcLength` + `framesFromCumLengths` in `core/positionPath.ts`. **Verify:** `verify:spatial-path` (now 11 checks — adds arc-length + roving distribution). **Categories:** 1. **Deferred:** Separate Dimensions → B3c (a data-model change, kept separate to stay bulletproof).

## B3c — Separate dimensions ✅ DONE
**Delivered:** **Separate Dimensions** — position can split into independent X / Y scalar curves (`AnimatableProperty.separated` + `keyframesX`/`keyframesY`), each with its own keyframes/timing/easing. `evaluateProperty` branches on `separated` so ALL read-sites (inspector, overlays, snapping, renderer) get the separated position for free — no call-site refactor. `toggleSeparateDimensions` (motion-preserving: split bakes byte-identical per-axis curves, re-couple merges the union of frames) + `addSeparatedKeyframe`; pure split/merge/eval in `core/separateDimensions.ts`; round-trips through `validation.ts`. Inspector shows a Separate/Combine toggle + independent X/Y rows when separated; the combined Position track is hidden from timeline/graph while separated (per-axis timeline/graph editing = a later follow-up — edit X/Y in the Inspector), and spatial motion-path handles are combined-mode only (mutually exclusive). **Verify:** `verify:separate-dims` (7 checks — split preserves motion byte-stable, independence, merge/round-trip). **Categories:** 1. **(B3 fully complete.)** **Categories:** 1 (*Separate Dimensions*). **Depends on:** B1/B3a (✅). **Perf:** light — pure eval; a data-model change touching the Transform model, the position evaluator, the inspector position row, the keyframe timeline/graph property extraction, and serialization/validation (so it round-trips). **Likely files:** `core/types.ts` (separated position representation / `dimensionsSeparated` flag + `positionX`/`positionY` props or equivalent), `core/interpolation.ts`, `store/editor.ts` (separate/re-couple action that bakes the current path into per-axis keyframes), `Inspector.tsx` + `keyframeSelection.ts`/`InterpolationGraph.tsx`, `project-system/services/validation.ts`. **Verify:** `verify:separate-dims` (X and Y evaluate on independent curves/timings; separate→re-couple round-trips the sampled motion).

## B4a — Composition motion-blur finishing ✅ DONE
**Delivered:** composition-level **Shutter Angle** (global streak master; per-layer shutter is now a relative factor, so existing projects render identically — verified), **Shutter Phase** (0 centres / − trails / + leads, via a new `u.phase` sample offset in the blur shader), and **Samples** (full-quality target, still scaled down by preview quality) — all in Composition Settings. Pure maths in `core/shutter.ts`; `ResolvedMotionBlur.phase`; `computeMotionBlur` takes the comp shutter; renderer BlurU `_pad`→`phase`; `getMotionBlurSamples(quality, base)` threads comp samples in `Viewport` + `ReviewViewport`. **Verify:** `verify:shutter` (5 checks — non-breaking default, global scaling, clamp, phase sign; the WGSL blur is browser-verified). **Categories:** 1.

## B4b — Keyframe assistants (Smoother + Wiggler) ✅ DONE
**Delivered:** **The Smoother** (`smoothKeyframes`) rounds jittery selected keyframe VALUES with a weighted moving average, pinning the endpoints; **The Wiggler** (`wiggleKeyframes`) adds seeded organic tremble (±amplitude) to the interior selected values — deterministic given (selection, amplitude, seed), the menu rolls a fresh seed each apply. Both handle number + vec2 (per component; X/Y wiggle independently). Pure ops in a new leaf module `core/keyframeAssistants.ts` (no `interpolation` import, so it's harnessable — house `mulberry32`); two undoable store actions via `mapKeyframesByPath`; exposed in the keyframe context menu's Multi-Keyframe group ("Smoother (round values)" / "Wiggler…"). Both need ≥3 selected keyframes (bake a held range first for a dense wiggle). **Verify:** `verify:keyframe-assistants` (9 checks — roughness reduction + endpoint pinning; seed-determinism, amplitude bound, per-component vec2). **Categories:** 1. **(B4 fully complete.)** Motion Sketch (live gesture capture) intentionally deferred — a distinct interaction feature, not a keyframe-array op.

## B5a — Time-remap model + speed ramps + Exponential Scale ✅ DONE
**Delivered:** animated **Time Remap** on video layers — `VideoLayer.video.timeRemap` (an `AnimatableProperty` whose value is SOURCE seconds). `resolveVideoLayer` now routes through a pure `core/timeRemap.ts` (`linearSourceSeconds` / `sourceFrameFromSeconds`, byte-identical to the old constant-rate path) and, when a remap curve is present, evaluates it — superseding playbackRate/reverse/freeze. **Speed ramps** come for free by easing the remap curve (B1 easing + graph editor); freeze = flatten, reverse = descend. Enabling seeds an identity curve (2 keyframes) so nothing changes until shaped (`setVideoTimeRemap`, motion-preserving). **Exponential Scale** added to the pure `core/keyframeAssistants.ts` (`exponentialScaleSelected` — geometric ramp, constant ratio/frame, per-component vec2, linear fallback for non-positive) + `exponentialScaleKeyframes` store action + context-menu item. Inspector video section gets a Remap On/Off toggle + a keyframable "Src s" control; round-trips through `validation.ts`. **Verify:** `verify:time-remap` (7 checks — byte-identical linear mapping, reverse descends, identity seed, exponential constant-ratio/monotonic). **Categories:** 2 (+ Cat-1 tail: Exponential Scale). **Deferred:** frame-mix blending → B5b.

## B5b — Frame-mix frame blending ✅ DONE
**Delivered:** **Frame Mix** for retimed/slowed video — a `video.frameBlend` toggle. `resolveVideoLayer` computes the fractional source position (`frameBlendSplit` in `core/timeRemap.ts` → frameA/frameB/mix), and `resolveFrame` **expands** a frame-blended clip into a second resolved video layer at frameB drawn on top at opacity = mix — a cross-dissolve through the EXISTING image pipeline (the cloner-stamp pattern; a synthetic `id:fb` keys its own decoded texture). **No shader / bind-layout change**, so no risk to the shared render path; when off (default) resolve is byte-identical. `mix` is 0 on an exact frame or at the last frame, so a blend never invents content past the source. Round-trips via `validation.ts`; Inspector video section gets a Frame Mix On/Off toggle. **Verify:** `verify:time-remap` extended (4 frameBlendSplit checks — straddling frames + mix, exact→0, last-frame clamp, before-start/NaN). **Perf:** decodes one extra source frame per blended layer (opt-in). **Categories:** 2, 1. **Browser-gated:** the actual two-frame decode + composite is WebCodecs/WebGPU — the split math is harnessed; the visible blend needs a browser eyeball.

## B6a — Optical-flow retiming foundation ✅ DONE
**Delivered:** the node-verifiable foundation for optical-flow retiming. `video.retimeInterp: 'mix' | 'flow'` (default mix) — a per-clip Interpolation selector (Mix / Optical Flow) in the Inspector, shown when Frame Mix is on and **honestly labelled** that Optical Flow currently previews as Mix until the GPU pass (B6b) is wired. Pure `core/opticalFlow.ts` (`warpT`, `flowFieldKey` — a per-frame-pair/resolution/quality cache key so flow isn't recomputed on scrub, `shouldWarp`); `ResolvedVideo.interp` carries the mode; round-trips via `validation.ts`. **Audit finding:** the engine has NO compute infrastructure, so B6b will do flow as iterative ping-pong FRAGMENT passes + a precomp-style warp pre-pass (reusing the Kawase N-pass + `ensurePrecompTexture` patterns, no shared-render-path change). **Verify:** `verify:optical-flow` (warpT clamp, cache-key distinctness, shouldWarp truth table). **Categories:** 2, 1.

## B6b — Optical-flow GPU estimator + warp pre-pass ✅ DONE (shader browser-verify-pending)
**Delivered:** the **motion-compensated warp** for `interp:'flow'` slow-mo. `engine/video/opticalFlow.ts` holds a single-pass gradient (Lucas-Kanade-style) WGSL shader (`FLOW_WARP_SHADER` + `FLOW_UNIFORM_SIZE`, plain string, no GPU calls → type-checks in CI): per pixel it estimates a small local flow from spatial+temporal luma gradients, samples frameA forward along `t`·flow and frameB backward along `(1−t)`·flow, cross-fades by `t` (identity at t=0/1). `renderer.ts` builds the pipeline **lazily and guarded** (`ensureFlowWarp` — `pushErrorScope('validation')` + async `popErrorScope` disables on a bad shader; try/catch on build) and runs `tryFlowWarp` in its **own encoder+submit** into a pooled per-layer texture (`ensureFlowTexture`, sized to texA's actual pixel dims so the `uv=pos.xy/dims` identity mapping holds); frameB is decoded into a synthetic `${id}:fbw` cache slot. In the video loop the warped view **replaces** the crisp texture at bind slot 2 only when `interp==='flow' && sourceFrameB!=null && blendMix`; **any** failure (texB not decoded yet, pipeline null, exception) returns null → falls back to the crisp frameA. `interpolation.ts` skips the B5b `:fb` cross-dissolve overlay when `interp==='flow'` (the warp already blends both frames in one texture — no double-composite). **Opt-in, off by default** — non-flow video is byte-identical. **Perf:** one extra fullscreen-triangle pass + one decoded-frame texture per active flow layer. **⚠ The WGSL is browser-verify-pending** — WGSL neither compiles nor runs here (tsc/build/harness don't check shader bodies); the flow *look* and shader validity must be confirmed in a WebGPU browser. Safe by construction: guarded init + frame-A fallback means a broken/invalid shader can never break the renderer or existing (mix/off) video. **Files:** `engine/video/opticalFlow.ts` (NEW), `engine/renderer.ts` (`flowWarp`/`flowUniformBuf`/`flowTexPool` fields + `ensureFlowWarp`/`ensureFlowTexture`/`tryFlowWarp` + video-loop swap), `core/interpolation.ts` (`:fb` gated on `interp!=='flow'`). **Verify:** `verify:optical-flow` (pure helpers, unchanged, 3 checks) + all 62 harnesses green; shader is browser-verified. **Deferred to a later batch:** pyramidal/iterative flow (this is single-level → degrades to cross-dissolve for large motion), a flow-field `LruCache`, and **pixel/rendered motion blur on footage** (flow-driven blur pass) — none blocking; can fold into a B6c or the motion-blur batch.

## B6 — Optical-flow retiming & pixel motion blur
**Delivers:** motion-estimated in-between frames for **buttery slow-motion** (Twixtor/Kronos look) and **pixel/rendered motion blur** added to sharp footage. **Categories:** 2, 1. **Perf:** **HEAVY** — GPU optical-flow; needs its own profiling + LOD/preview-quality gating. **Likely files:** new `engine/video/opticalFlow.*` (WGSL), renderer hooks. **Verify:** `verify:*` for the flow-vector math where pure; browser-gated for the GPU pass.

## B7 — Procedural motion expressions
**Delivers:** complete the expression motion vocabulary — `loopOut/loopIn('offset')`, an **inertial bounce / spring** expression (auto overshoot-and-settle on any keyframes), `posterizeTime`, `valueAtTime`-based **lag/delay/follow** (secondary motion). **Categories:** 6, 1. **Depends on:** B1. **Perf:** worker-evaluated already; pure. **Likely files:** `expressions/worker.ts`, `expressions/types.ts`. **Verify:** `verify:expressions-motion` (offset loop continuity, bounce decay, lag offset).

## B8 — Shape motion completion (SPLIT — audit found a foundational gap)
Audit (subagent) verdict: shape **paths are not keyframable** and there is **no per-frame path modifier stack**, so the whole set can't land in one prompt. Also already-built (don't rebuild): **merge/boolean** (`core/pathOps.ts`, destructive + compound, wired), **repeater** (the `src/cloner/` system already does layer-level radial/grid arrays of a shape — an *in-shape* Repeater operator is the only gap), and **gradient stroke** on SDF shapes (only the pen-path tessellation path lacks it). Split:

### B8a — Path modifier operators ✅ DONE
**Delivered:** a non-destructive **path modifier stack** on shape layers, applied at RESOLVE time so the existing polygon tessellator draws the result with **zero renderer change**. Pure ops in `core/shapeModifiers.ts` (leaf; imports only `core/bend`'s `evalCubic`): **Trim Paths** (draw-on — arc-length window with start/end/offset, wraps across the seam on closed paths, full window returns the original vertices byte-identical), **Offset Paths** (parallel inset/outset via outward miter bisector, miter-limit capped, winding-agnostic via centroid orientation), **Roughen** (subdivide + seeded per-normal displacement, frame-pure via house mulberry32). `ShapeModifier` union + `ShapeLayer.modifiers?` in types; `createShapeModifier` factory; `resolveShapeLayer` evaluates the stack (`resolveShapeModifiers` → `applyResolvedModifiers`) — **absent modifiers = byte-identical** (opt-in). Store: `addShapeModifier`/`removeShapeModifier`/`toggleShapeModifier` (undoable); params are AnimatableProperty edited through the generic `updateLayerProperty`/`addKeyframe` on `modifiers.<i>.<param>` dot-paths (so they **keyframe like any property** — animated draw-on/offset/roughen for free). Inspector "Path Modifiers" section (add Trim/Offset/Roughen, per-modifier eye-toggle + delete + param drags + Roughen reseed), shown on polygon shapes. Persistence via `ensureShapeModifiers` in validation.ts (structurally sanitized). **Scope:** polygon (pen-path) shapes only — SDF rect/circle/star modifier support needs a shapeToPathVertices conversion + render-path switch (a browser-verifiable follow-up). **Verify:** `verify:shape-motion` (17 checks: trim boundary/seam-wrap/empty/full, offset exact ±per-side + miter cap + identity, roughen determinism/bound/closed, stack compose + short-circuit). 64 harnesses total. tsc 0, lint 125, build ok.

### B8b — Shape morph + pucker/bloat + keyframable path ✅ DONE
**Delivered:** **animatable pen-path outline (shape morph)** + **Pucker & Bloat**, both pure and resolve-time (no renderer change — the tessellator draws the emitted `PathVertex[]`). In `core/shapeModifiers.ts`: `evalPathKeyframes` (at/beyond a pose → the pose's ORIGINAL bezier vertices byte-identical; strictly between poses → a morph), `morphPaths` (arc-length **resample both poses to a common point count** → index correspondence → lerp, so **different vertex counts morph** — square→triangle works), `resampleToN`, and `puckerBloat` (bows each edge out/in via `amount·sin(π·tLocal)` while anchors stay put — the flower/spike look, not a scale). Model: `PathKeyframe` + `PolygonShape.pathKeyframes?` (optional → static `vertices` unchanged when absent); `PuckerBloatModifier` added to the `ShapeModifier` union + `createShapeModifier`. Resolve: `resolveShapeLayer` evaluates the outline pose FIRST, then the modifier stack. Store: `addPathPose` (snapshot current vertices@playhead, replace any at that frame, sorted) / `removePathPose` (undoable); pucker keyframes via the generic dot-path actions. Inspector: "Path Animation" (Add Pose + pose list) and the Pucker row, on polygon shapes. Persistence: `pathKeyframes` in `ensureShapeGeometry`, pucker in `ensureShapeModifiers`. **Scope/limits:** morph correspondence is index-0 arc-length (a correspondence-offset control is a refinement); poses are snapshots of the editable base `vertices` (re-Add at a frame to update a pose); path-edit tools still edit the base, not per-pose (AE-style per-keyframe path editing is a later refinement). **Verify:** `verify:shape-motion` extended to **29 checks** (pucker sign/anchors, morph endpoints/midpoint/identity, evalPathKeyframes at-pose/between/clamp/hold/different-counts). tsc 0, lint 125, build ok, 64 harnesses.

### B8c — Dashed strokes + gradient strokes on pen paths (render, browser-gated)
**Delivers:** `strokeDash`/`dashOffset` (+ trim-driven animated strokes) and gradient stroke on the `polygon` tessellation path (SDF shapes already have it). **Perf:** shader/tessellation work — browser-verified.

### B8d — In-shape Repeater operator
**Delivers:** AE's per-shape **Repeater** (Copies/Offset/composite Transform accumulation) as a modifier, likely reusing `cloner/distribution.ts` + `instanceMatrix.ts` maths rather than duplicating. **Perf:** medium.

## B9 — Kinetic typography completion
**Delivers:** type-on/typewriter, per-character/word/line **staggered cascades**, blur-in / fade-up, decode/shuffle, **text on a path**, 3D per-character rotation — built on the existing range-selector + text-animator system. **Categories:** 3. **Perf:** Canvas-2D text atlas exists; reuse. **Verify:** extend `verify:textanimator` / `verify:rangeselector`.

## B10 — Masks / track mattes / roto completion
**Delivers:** variable-width mask feather, complete track-matte modes (alpha/luma/inverted), mask-reveal wipes, animated mask shapes, a basic roto/refine-edge cut-out. **Categories:** 5. **Perf:** matte compositing pass; reuse existing mask overlay. **Verify:** `verify:mattes`.

## B11 — ★ Effect-stack framework + adjustment layers + blend-mode audit
**Delivers:** a reusable **ordered per-layer effect pipeline** (stack any effects, each tweakable, saveable as a preset), **adjustment layers** (apply effects to everything beneath), and a full **blend-mode** audit/completion. THE foundation for B12–B17. **Categories:** 20 (+14). **Perf:** one shared render-to-texture / ping-pong buffer pool so stacked effects compose in a single managed pipeline — no per-effect ad-hoc passes; frame-cached. **Likely files:** `core/types.ts` (effect stack), `engine/renderer.ts` (post pipeline), inspector effects UI, `store/editor.ts`. **Verify:** `verify:effect-stack` (order, enable/disable, adjustment-layer scoping — pure config resolution).

## B12 — Glow & light finishing
**Delivers:** cinematic **bloom / deep-glow**, glow modes (inner/outer/bloom), **light wrap**, star glints, light streaks. **Categories:** 10, 14. **Depends on:** B11 (composes in the stack; reuses one blur pyramid). **Perf:** medium — shared downsample pyramid. **Verify:** browser-gated GPU; pure param resolution harnessed.

## B13 — Stylise & cinematic finish
**Delivers:** chromatic aberration, lens distortion + vignette, film grain, halftone/dots, scanlines, posterize/cartoon/cel. **Categories:** 14. **Depends on:** B11. **Perf:** medium.

## B14 — Glitch & datamosh
**Delivers:** RGB/channel split, block & pixel-sort glitch, VHS/scanline degrade, digital noise, displacement glitch. **Categories:** 27. **Depends on:** B11. **Perf:** medium; keep frame-pure (seeded).

## B15 — Color grading
**Delivers:** Lumetri-style **wheels / curves / HSL**, **LUT** (.cube) loading + apply, film-look presets. **Categories:** 21. **Depends on:** B11 + existing color-correction panel. **Perf:** medium — 3D-LUT sample.

## B16 — Light rays, flares & beams
**Delivers:** lens flares (Optical-Flares-like), energy **beams / lightning** (Saber-like), volumetric god-rays. **Categories:** 10. **Depends on:** B11. **Perf:** **HEAVY** — dedicated; scoped, may split.

## B17 — Tiling & generative simulations
**Delivers:** motion tile / offset **seamless scroll**; generative sims — caustics, wave world, radio waves, cell pattern, fractal noise, vegas stroke. **Categories:** 26, 28. **Depends on:** B11 + existing generativePattern engine. **Perf:** medium.

## B18 — 3D scene completion
**Delivers:** depth of field / **bokeh**, lights & shadows, parallax multiplane, **focus pulls**, environment/reflection. **Categories:** 7. **Depends on:** the 2.5D camera system (M0–M3 built). **Perf:** **HEAVY**.

## B19 — Particle system polish
**Delivers:** Particular-grade emitters, air/gravity/turbulence physics, trails/streaks, presets (fire/smoke/sparks/confetti/dust), text/logo dissolve-into-particles. **Categories:** 8. **Perf:** **HEAVY** GPU compute — dedicated + profiled; frame-pure via seeded hashing. Likely splits (emitter core / physics / presets).

## B20 — Generative geometry
**Delivers:** 3D stroke (draws in space), plexus (connected-dot networks), Mir/Tao-like flowing surfaces, node particles. **Categories:** 9. **Perf:** **HEAVY** — GPU instancing/lines; reuse cloner LOD.

## B21 — Physics dynamics
**Delivers:** collisions, stacking/piling, springs/ropes/chains, soft-body jiggle, magnets/attraction. **Categories:** 13. **Depends on:** existing Rapier physics bake. **Perf:** **HEAVY** (bake step, so playback stays cheap).

## B22 — 3D objects & extrusion
**Delivers:** extruded 3D text/logos with bevels, imported models, materials/reflections. **Categories:** 17. **Perf:** **HEAVY** — likely multi-batch; scope carefully.

## B23 — Destruction generators
**Delivers:** shatter (fracture + explode with physics), card-dance (tile-grid assembly driven by a map). **Categories:** 25. **Perf:** medium; frame-pure.

## B24 — Deformation & warp
**Delivers:** puppet mesh warp, liquify smear/push, turbulent-displace jelly/flag, wave/ripple, displacement map, bezier/mesh warp, roughen edges. **Categories:** 12. **Perf:** medium — mesh warp GPU.

## B25 — Character rigging
**Delivers:** rubber-hose bendy limbs, IK/FK posing, joystick/controller pose-swapping, auto-squash. **Categories:** 11. **Perf:** **HEAVY** rig eval; scoped, likely splits.

## B26 — Transitions & preset system
**Delivers:** save/browse **animation presets**, drag-drop **transitions** (whip/zoom/blur/liquid/spin), MOGRT-like control panels, one-click house eases + stagger. **Categories:** 15. **Depends on:** B1, B7. **Perf:** light.

## B27 — Tracking & match-move
**Delivers:** point & **planar tracking**, corner-pin, basic camera solve, warp-stabilize. **Categories:** 16. **Perf:** **HEAVY** — dedicated.

## B28 — Keying
**Delivers:** chroma/luma key, spill suppression, edge refine, screen replacement. **Categories:** 22. **Perf:** medium.

## B29 — Footage cleanup & beauty
**Delivers:** denoise, deflicker, skin/beauty retouch. **Categories:** 23. **Perf:** **HEAVY** — dedicated.

## B30 — Practical VFX compositing
**Delivers:** an add/screen composite workflow for stock elements (fire/smoke/sparks/blood), light leaks. **Categories:** 24. **Perf:** light — mostly blend modes + asset workflow (leans on B11).

## B31 — Audio-reactive & data-driven
**Delivers:** audio→keyframes, waveform/bar/circle **visualisers**, beat/transient sync, data/spreadsheet/JSON binding, animated counters. **Categories:** 18. **Depends on:** existing audio pipeline. **Perf:** medium.

## B32 — Motion-design principle rigs
**Delivers:** anticipation, follow-through/overlapping action, secondary motion, squash & stretch, staggered offset, motion trails/smears/echo — as one-click **applyable behaviours/rigs**. **Categories:** 19. **Depends on:** B1, B7. **Perf:** light.
