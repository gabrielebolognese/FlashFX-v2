# FlashFX architecture

How a browser renders After-Effects-class motion graphics in real time, keeps it byte-identical while
you scrub, and exports it frame-for-frame - plus the AI pipeline that outputs editable scenes.

This is a technical tour for people who like rendering, graphics, and systems. It is honest about what
is solid and what is still early (see [Known limits](#known-limits)).

---

## The shape of the problem

A motion-graphics tool is not a video trimmer. Every frame is a *composition*: dozens to thousands of
layers, each with keyframed transforms, effects, masks, parenting, expressions, physics and procedural
instancing, composited in order on the GPU. Two properties make it hard in a browser:

1. **It must be real time.** 60fps preview of a GPU-composited scene, from TypeScript, with no native
   runtime.
2. **It must be frame-pure.** The timeline scrubs *non-sequentially* - you jump to frame 900, back to
   120, scrub to 455. The image for a given frame must be identical no matter how you got there, and it
   must match the exported file exactly. That rules out "evolve state over time" shortcuts that most
   real-time graphics code leans on.

FlashFX is built around those two constraints.

## Layered architecture

```
src/core/     pure domain model - no React, no DOM, no WebGPU. Types, interpolation, scene graph,
              cloner math, captions, silence detection, overrides. Runs in workers; unit-harnessable.
src/engine/   the runtime - WebGPU renderer, timeline + playback clock, the WebCodecs video subsystem,
              caches (LRU, render tree). Most subsystems are isolated Web Workers.
src/store/    Zustand stores. editor.ts owns the Composition and is the mutation API; undoable edits go
              through a command pattern (history.ts). Components call actions, never reconstruct state.
src/ui/       React presentation. Panels, layout, a data-driven context-menu system. Subscribes to
              stores with selectors.
```

The rule that keeps it sane: **pure logic lives in `core/` and feature modules, free of React / DOM /
WebGPU**, so it can run in workers and be verified without a browser. The renderer and stores are the
only places allowed to touch the GPU and the framework.

## The resolve pipeline

The heart is a single pure function:

```ts
resolveFrame(composition, frame, ctx?) -> RenderFrame
```

It takes the composition and a frame number and returns a flat, GPU-ready description of that frame:
every layer resolved to concrete transforms, colors, effect params, masks and payloads. It evaluates
keyframes (linear / bezier / hold / spring), walks the scene graph for parenting, applies layout and
anchoring, expands cloners into per-instance stamps, recurses into precompositions at a time-remapped
local frame, and samples fields - all as a deterministic function of `(composition, frame)`.

`resolveFrame` is the contract between "the document" and "the pixels." The renderer never reaches back
into the editor state; it only draws a `RenderFrame`. The exporter calls the *same* function, so the
exported file is produced by the same code path as the preview.

Performance notes that matter at thousands of layers:

- a per-frame `Map<id, Layer>` and a structural cache (keyed on the layers reference) turn repeated
  `O(N)` lookups into `O(1)`;
- module-level scratch buffers (layout offsets, a measureText `OffscreenCanvas`) avoid per-layer
  allocation;
- the precomp recursion saves/restores that module-level state across the call, and a cycle +
  depth guard (a `visited` set) prevents infinite nesting.

## Frame-purity (the non-negotiable)

Because the timeline scrubs randomly and preview must match export, every procedural system has to be a
pure function of the frame:

- **Randomness is seeded.** The house PRNG is `mulberry32`; the cloner's Random effector hashes
  `(seed, index)`. `Math.random()` and `Date.now()` are *banned* in the pure paths - a lint/review rule,
  not a suggestion.
- **Particles** reseed per frame from keyframe snapshots, so `seekToFrame` is order-independent.
- **Physics** (Rapier 2D) is *baked* to a cache and sampled per frame, rather than stepped live during
  scrub.
- **Expressions** are evaluated for a specific frame (see below).

The payoff: scrub anywhere, in any order, and the frame is identical - and the export matches the
preview pixel for pixel.

## The WebGPU compositor

`WebGPURenderer` rasterizes one resolved frame. `navigator.gpu.requestAdapter()` with **no WebGL
fallback** - it is GPU-first by design.

- **Two paths.** A *fast path* composites the whole scene in a single render pass when no effects need
  isolation. A *multipass path* kicks in for layer blur, glow, shadow, motion blur, track mattes and
  effect stacks: the layer is rendered into its own texture, the effect runs, and the result is
  composited back into the scene with a **premultiplied-over** blend.
- **Pooled render targets.** Scene / layer / shadow / glow / blur textures are pooled and resized in
  place, so a heavy frame does not thrash allocations.
- **Effects are a frozen registry.** ~100 GPU effects (color / blur-glow / distortion / stylize /
  keying / LUT grading) are authored in WGSL and dispatched by a numeric type id packed into a per-layer
  uniform. Adding an effect is a registry row plus one WGSL `case`, in one of three disjoint stages
  (warp pre-sample, spatial post-sample, per-pixel color).
- **The same renderer draws preview and export.** Export just targets an offscreen device and an
  `OffscreenCanvas`, waits for the GPU queue to drain, and hands the finished frame to the encoder.

## MoGraph: the cloner

The cloner is the piece most "web editors" do not have. One logical layer expands into N instances as a
**pure function of `(params, index)`** at render time - grid / radial / path / field distributions, with
a hard instance cap. On top sits an ordered **effector stack** (random / falloff / step / time / target)
with add / multiply / override blend modes, and per-instance **timing stagger** (`sourceLocalTime =
frame - delayForIndex(i)`), so each instance can run the source animation at its own offset. Path mode
reuses the motion-path arc-length sampler; the source layer's own keyframes are evaluated per instance
at its staggered local frame. All pure, all seeded, all frame-identical. The CPU builds column-major
instance matrices and interleaves an instance buffer for the (in-progress) GPU-instanced draw path.

## Expressions

Properties can be driven by code. The expression engine runs **sandboxed in a Web Worker**, so a
runaway or malicious expression cannot block the main thread or touch the page. The pure `resolveFrame`
reads a synchronously-cached value and the worker evaluates asynchronously - a deliberate trade (the
export path's determinism story for expressions is one of the areas still being hardened).

## The video subsystem

Naive WebCodecs usage *looks* fine and then freezes: a decoded `VideoFrame` keeps occupying a slot in
the hardware decoder's small output pool (~16-24) until you `.close()` it, so holding a lookahead window
of frames chokes the decoder and playback stalls while audio keeps going. FlashFX's pipeline is built
around that reality:

- demux + decode via **mediabunny**, behind a per-asset controller with a small pool of long-lived
  forward decode cursors (sequential playback advances one `next()` = one decode; only a backward/large
  jump reseeks);
- a **present-on-clock scheduler** with a hard per-asset open-frame count cap and played-first eviction;
- a `videoTextureCache` that uploads frames to WebGPU with a bounded LRU;
- integer source-frame addressing (`timeForIndex = firstTs + (i + 0.5)/fps`) so frame selection is exact
  and deterministic.

## Export

`exportToMp4` renders every frame through the same `resolveFrame` + `renderFrameUnsafe` as the preview,
captures the `OffscreenCanvas` into a `VideoFrame`, and encodes **H.264 / AAC** via WebCodecs into an
MP4 (mp4-muxer). Audio is mixed offline (`OfflineAudioContext`) with the same scheduling math as live
playback, so A/V stays in sync. Because the render path is shared, the file is what you saw - track
mattes, effects, precomps and all. (An ongoing "export trustworthiness" effort hardens the edges: fps
resampling, aspect-fit, and the audio-reaches-the-file cases.)

## The AI pipeline

The goal is the opposite of text-to-video: produce an **editable scene**, not a black-box clip.

```
prompt -> Director (plans a structured scene) -> deterministic compiler (plan -> real layers,
          keyframes, effects, cloners) -> commit as ONE undo step
```

The compiler is deterministic: the same plan produces the same scene. The output lands in the timeline
as an ordinary composition you can open and tweak, with a cost estimate and a single `Ctrl+Z` to revert.
Model access is bring-your-own-key or a managed proxy; the app ships with no key.

## Testing without a test runner

There is intentionally no test framework. Pure, self-contained logic (a `core/**` leaf, an effect's
math, the cloner distribution, export math) gets a tiny acceptance harness in `scripts/verify-*.mjs`
that **bundles the real TypeScript with esbuild and asserts with `node:assert`**. ~108 of them run via
`npm test`, auto-discovered, and gate CI. It is a deliberate choice: the pure core is the part worth
proving, and a harness that bundles the shipping code catches real regressions (wrong arg counts,
properties that do not exist) that a mock-heavy suite would miss.

The other gate is the type system: `tsconfig` has `"include": ["src"]`, so **everything under `src/` is
type-checked whether or not it ships**, with `noUnusedLocals` / `noUnusedParameters` /
`noFallthroughCasesInSwitch`. `npm run build` is the reachability gate (it bundles only what is reachable
from `main.tsx`).

## Known limits

Honesty section. This is pre-launch and actively developed:

- **WebGPU only.** Chromium-based browser required; no WebGL fallback.
- Some GPU paths are newer than others and verified in-browser rather than by harness (shaders can only
  be proven at runtime).
- The GPU-instanced cloner draw path and some compositor features are staged; the CPU/resolve side is
  done and the GPU upgrade is in progress.
- Expression determinism on the export path, and a few export edges (fps/aspect/audio), are being
  hardened.
- 3D is intentionally out of scope - FlashFX is 2.5D (cards in space + camera), not a full 3D engine.

If you find a rough edge, an issue with a repro is genuinely useful.
