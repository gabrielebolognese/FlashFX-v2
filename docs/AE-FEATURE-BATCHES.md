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
| B2 | Graph Editor Pro (speed graph, influence, hotkeys) | ▶ **next** | light |
| B3 | Spatial position keyframes (motion-path bezier, dots, roving, separate dims) | ⬜ | light |
| B4 | Motion-blur finishing (comp shutter angle/phase/samples) + Smoother/Wiggler | ⬜ | medium |
| B5 | Time remapping & speed ramps + frame-mix + exponential scale | ⬜ | medium |
| B6 | Optical-flow retiming & pixel motion blur | ⬜ | **heavy** |
| B7 | Procedural motion expressions (offset loop, inertial bounce, lag) | ⬜ | light |
| B8 | Shape motion completion (trim/repeater/offset/wiggle/morph audit) | ⬜ | light |
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

## B2 — Graph Editor Pro ▶ NEXT
**Delivers:** a **Speed Graph** view (velocity over time) alongside the existing Value Graph; **AE-style influence handles** (influence % + speed, the intuitive dial) layered over the raw bezier handles; numeric velocity/influence entry; **F9 / Shift+F9 / Ctrl+Shift+F9** easy-ease hotkeys wired to the current keyframe selection. **Categories:** 1. **Depends on:** B1. **Perf:** overlay/UI only; no render cost. **Likely files:** `InterpolationGraph.tsx`, `App.tsx` (keydown), `store/editor.ts` (an ease-selected-keyframes action + selection→targets mapping), maybe `core/keyframeEase.ts` (velocity readout helper). **Verify:** extend `verify:easing` (influence↔handle mapping, velocity computation) or a new `verify:graph-velocity`.

## B3 — Spatial position keyframes
**Delivers:** spatial interpolation on ordinary position keyframes (Linear / Auto-Bezier / Continuous / Bezier) with **draggable spatial tangents** on the position path in the viewport; **per-frame motion-path spacing dots** (the velocity/arc X-ray); **roving keyframes** (constant spatial velocity across waypoints); **Separate Dimensions** (independent X/Y/Z curves). **Categories:** 1. **Depends on:** B1. **Perf:** viewport overlay + pure eval; keep the per-frame dot sampling capped. **Likely files:** `core/types.ts` (spatial tangents on Keyframe; a `dimensionsSeparated` flag), `core/interpolation.ts`, `AnimatedPathsOverlay.tsx` / a new editable position-path overlay, `store/editor.ts`. **Verify:** `verify:spatial-keyframes` (arc-length constant velocity for roving, spatial bezier sampling, separate-dims independence).

## B4 — Motion-blur finishing + keyframe assistants
**Delivers:** **composition-level shutter angle / shutter phase / samples** in Composition Settings, threaded into the renderer's velocity blur (per-layer shutter already exists); **The Smoother** (round jittery keyframe data) and **The Wiggler** (inject controlled organic tremble) keyframe assistants. **Categories:** 1. **Perf:** shutter/samples directly scale blur cost — expose and cap samples per quality tier. **Likely files:** `core/types.ts` (`CompositionSettings.shutterAngle/Phase/samples`), `engine/renderer.ts`, `Toolbar.tsx` comp settings, `core/keyframeOps.ts` (+ smoother/wiggler pure ops), `store/editor.ts`. **Verify:** `verify:keyframe-assistants` (smoother reduces variance, wiggler is seed-deterministic).

## B5 — Time remapping & speed ramps
**Delivers:** a **time-remap** property for footage/precomp layers; **speed ramps** (eased time curves — fast↔slow↔fast); freeze-frame, reverse; **frame-mix frame blending**; the **Exponential Scale** assistant (perceptually-even zooms). **Categories:** 2 (+ Cat-1 tail). **Perf:** frame-mix is cheap; optical-flow slow-mo is split to B6. **Likely files:** `core/types.ts` (timeRemap), `core/interpolation.ts` / `engine/timeline.ts`, video decode scheduler, `store/editor.ts`. **Verify:** `verify:time-remap` (remap curve → source-frame mapping, exponential-scale monotonic zoom).

## B6 — Optical-flow retiming & pixel motion blur
**Delivers:** motion-estimated in-between frames for **buttery slow-motion** (Twixtor/Kronos look) and **pixel/rendered motion blur** added to sharp footage. **Categories:** 2, 1. **Perf:** **HEAVY** — GPU optical-flow; needs its own profiling + LOD/preview-quality gating. **Likely files:** new `engine/video/opticalFlow.*` (WGSL), renderer hooks. **Verify:** `verify:*` for the flow-vector math where pure; browser-gated for the GPU pass.

## B7 — Procedural motion expressions
**Delivers:** complete the expression motion vocabulary — `loopOut/loopIn('offset')`, an **inertial bounce / spring** expression (auto overshoot-and-settle on any keyframes), `posterizeTime`, `valueAtTime`-based **lag/delay/follow** (secondary motion). **Categories:** 6, 1. **Depends on:** B1. **Perf:** worker-evaluated already; pure. **Likely files:** `expressions/worker.ts`, `expressions/types.ts`. **Verify:** `verify:expressions-motion` (offset loop continuity, bounce decay, lag offset).

## B8 — Shape motion completion
**Delivers:** audit + fill the shape-layer motion set — trim paths (draw-on), repeater (animated radial/grid arrays), offset paths, wiggle transform/paths, dashed & animated strokes, gradient strokes, merge/boolean, pucker & bloat, shape **morph**. **Categories:** 4. **Perf:** SDF/vector — reuse existing shape renderer. **Verify:** `verify:shape-motion` for any new pure geometry ops.

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
