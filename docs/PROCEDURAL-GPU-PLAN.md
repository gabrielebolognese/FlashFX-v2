# FlashFX — GPU Procedural Pattern Engine (waves, mosaics, kaleidoscopes, plasma…)

## 0. Goal

A **first-class, GPU-rendered, performance-optimized procedural animation engine**: full-frame
generative patterns — waves, moving mosaics, kaleidoscopes, plasma, noise fields, ripples, spirals,
interference — as an animated **layer** the user drops in, parameterizes, and keyframes. Per-pixel
fragment shading at full resolution (trivially 60fps), evaluated from a time uniform so it scrubs
frame-accurately.

This is distinct from the existing `src/procedural/` module (a **CPU transform/grid/tile loop** that
moves *layers* — not pixels). That is a category mismatch and will not be extended.

---

## 1. Grounding — verified against the renderer

- **Shaders are inline WGSL template-strings in `src/engine/renderer.ts`** (~4576 lines; no `.wgsl`
  files). Every pipeline is built once at init and stored on `GPUState`; per frame it fills one big
  uniform buffer (one aligned slot per layer) and dispatches per layer via **dynamic offset**. This is
  the pattern to copy — never build pipelines per frame.
- **Render model:** per-layer transformed quads drawn into a scene texture, then `BLIT_SHADER` →
  swapchain (`renderer.ts:4228`). `image/particle/fieldSampled/lottieIcon/precomp` all composite as a
  textured quad through the image pipeline. A GPU generator can instead draw its **own quad whose
  fragment writes color directly** — no source texture needed.
- **Time is already a uniform:** `frame.frameNumber` feeds `effectTime` (`renderer.ts:3676`, index
  const `IMAGE_EFFECTTIME_FLOAT=125`), commented "seeds procedural/noise effects." `seconds =
  frameNumber / frameRate`. Frame-driven ⇒ **frame-pure** (byte-identical scrub).
- **A WGSL toolkit already exists** in `renderer.ts` (~871–987), reusable by any new shader we add in
  that file: `hash21`, `valueNoise`, `fbm` (5 octaves), `voronoiCenter` (Worley 3×3), `hexCenter`,
  `rgb2hsv`/`hsv2rgb`, `segDist`, `patternCoverage`. **Gap:** no true simplex/Perlin gradient noise
  (only value-noise + fbm) — we'll add `snoise2`/`gerstner` helpers.
- **Generative patterns already exist as *effects*** (`renderer.ts:1291–1353`, ids 146–162: plasma,
  clouds/fbm, perlinNoise, fractalNoise, voronoiPattern, cellularPattern, checkerboard, dots, stripes;
  kaleidoscope `:1504` + mosaic `:1516` as warps). Limits: ≤7 float params, one UI slider, and they
  composite **over** a layer — great as modifiers, wrong as a rich standalone source. We reuse their
  math, not their framing.
- **The clean architecture to mirror is `src/core/material.ts`:** `resolveShapeFill()` flattens config
  → a flat `ResolvedFill` struct whose float layout **mirrors frozen WGSL constants** (`FILL_MAX_*`),
  packed by `packFill` (`renderer.ts:4466`), kept in sync by index-comment discipline. Our config →
  uniform packing copies this exactly.
- **Effect-registry discipline:** `EFFECT_TYPE` frozen numeric ids (`core/effects/effectRegistry.ts`)
  interpolated into the WGSL `switch` so TS and shader can't drift. We mirror it for pattern-type ids.

---

## 2. Decision

**Build a new `generativePattern` GPU layer type with a dedicated pattern render pipeline.** Rejected
alternatives: (a) extend `src/procedural/` — category mismatch; (b) CPU Canvas2D render (particle/
fieldSampled route) — documented 50–200ms/frame, fails "performance optimized"; (c) effect-only — capped
params + composite-over, not a standalone engine.

Reuse: the existing WGSL utils (§1), the `material.ts` resolve-to-flat-struct architecture, the
frozen-id discipline, and the fullscreen-effect pipeline idiom (`renderer.ts:3020–3066`) as the exact
template for pipeline/bind-group/uniform creation.

---

## 3. Architecture

### 3a. Data model — `GenerativePatternLayer`
A layer carrying an opaque `configJSON` (mirrors `FieldSampledLayer`/`ParticleLayer`):
```ts
interface PatternConfig {
  type: 'waves' | 'plasma' | 'kaleidoscope' | 'mosaic' | 'voronoi' | 'clouds' | 'rings'
      | 'spiral' | 'checkerboard' | 'interference' | 'gradientSweep' | 'warp';
  scale: number; speed: number; rotationDeg: number; complexity: number; // fbm octaves / mirror count
  warp: number; contrast: number; seed: number;                          // pattern knobs
  palette: PatternStop[];   // color ramp (reuse material gradient stops), 2–8 stops
  paletteMode: 'linear' | 'smooth' | 'posterize';
}
```
Keyframeable knobs (`scale/speed/rotation/warp/contrast`) can be `AnimatableProperty`s in a later phase;
Phase 1 keeps them in `configJSON` (static per frame, animated via the `time` uniform).

### 3b. Pure resolve module — `src/procedural-gpu/`
- `types.ts` — `PatternConfig`, `PatternType`, frozen `PATTERN_TYPE` id map (mirrors `EFFECT_TYPE`).
- `resolve.ts` — `resolvePattern(config): PatternUniforms` → a **flat Float32Array-ready struct** whose
  layout mirrors WGSL constants (copy `material.ts:packFill`). Pure, harness-testable.
- `presets.ts` — named presets per type (`Ocean Waves`, `Neon Plasma`, `Hex Mosaic`, `Kaleido Bloom`…).
- `palette.ts` — reuse `material.ts` gradient-stop flattening for the color ramp.

### 3c. WGSL pattern library — a `PATTERN_SHADER` const in `renderer.ts`
- **Vertex:** reuse the image quad vertex stage (`renderer.ts:817–851`) — emits `uv` (0..1) + aspect.
- **Fragment:** `switch(patternType)` producing a scalar field `v ∈ [0,1]` from `uv`, `time`, and packed
  params, then `color = palette(v)`. Reuse `hash21/valueNoise/fbm/voronoiCenter/hexCenter`; add
  `gerstnerWave`, `snoise2`, `kaleido(uv, n)` (polar mirror), `mosaicCell`, `spiral`. Kept in sync with
  TS via interpolated `case ${PATTERN_TYPE.waves}:` etc.
- Alpha from a `coverage`/opacity param so patterns can be partial overlays.

### 3d. Render pipeline (the GPU plumbing, per the research seam)
- `PATTERN_UNIFORM_ALIGN`/`FLOATS` constants; `patternPipeline` + `patternUniformBuffer(ALIGN*MAX_LAYERS)`
  built once alongside the image pipeline (~`renderer.ts:2825`).
- A `patternLayers` bucket (`renderer.ts:3326`); per-slot uniform fill = `resolution`, transform floats,
  `time = frame.frameNumber`, packed `PatternUniforms`; `draws.push({fn})` doing
  `setPipeline(patternPipeline); setBindGroup(0,bg,[ALIGN*slot]); draw(6)` (`renderer.ts:3786`).
- Composites through the existing premultiplied blend + scene/blit machinery, and carries
  blur/shadow/glow by setting the `d.blur/shadow/glow` descriptors like any other layer.
- **No texture bind** ⇒ buffer-only bind group (cheap, can be per-frame like `shapeBindGroup`).

### 3e. Layer-type integration checklist (9 touch points — mirrors how `fieldSampled` was added)
1. **`core/types.ts`** — `GenerativePatternLayer` iface (base fields + `pattern: { configJSON }`); add
   to `Layer` union (`:854`), `TrackType` (`:857`), `ResolvedGenerativePattern` payload (~`:1340`),
   `ResolvedLayer.pattern?` + `layerType` union (`:1381`,`:1393`).
2. **`core/factory.ts`** — `createGenerativePatternLayer(...)` (mirror `createFieldSampledLayer` `:605`).
3. **`core/interpolation.ts`** — `resolveFrame` branch (mirror fieldSampled `:1130`) → `{configJSON,
   localFrame}` + `layerType:'generativePattern'`.
4. **`engine/renderer.ts`** — import; **new `patternLayers` bucket + `PATTERN_SHADER` + `patternPipeline`
   + dispatch** (§3c/3d). (This is the one place that diverges from the fieldSampled canvas-texture
   template — a real GPU pass, not an OffscreenCanvas.)
5. **`project-system/services/validation.ts`** — `case 'generativePattern':` in `validateLayer`
   (mirror `:489`). **CRITICAL** — else silently stripped on save/load.
6. **`store/editor.ts`** — `layerTypeToTrackType` case (`:550`); `addGenerativePatternLayer` action decl
   + impl (mirror `addFieldSampledLayer` `:1859`).
7. **`ui/panels/CanvasToolbar.tsx`** — `'addGenerativePattern'` action + ToolDef (group `advanced`).
8. **`ui/panels/GenerativePatternPanel.tsx`** (new) + register in `Inspector.tsx`/`store/inspector.ts` —
   the params UI (type picker, sliders, palette editor). Mirror `FieldSamplingPanel`.
9. **`ui/panels/timeline/TrackArea.tsx`** — clip color + `layerTypeToTrack` case.

---

## 4. Pattern catalog (the "full scale")

Each is a scalar field → palette; all animate off `time` and are expressible from the toolkit + a few
new helpers:
- **Waves** — summed Gerstner/sine wavefronts (ocean/ripple); `warp` bends them, `speed` scrolls.
- **Plasma** — layered sines + fbm (already exists at `:1311` — port + enrich).
- **Kaleidoscope** — polar mirror `n`-fold of an underlying noise/gradient (warp exists at `:1504`).
- **Mosaic / Voronoi / Hex** — `voronoiCenter`/`hexCenter` cells, per-cell color from `hash`, animated
  cell drift; `mosaic` warp exists at `:1516`.
- **Clouds / Nebula** — domain-warped fbm with a nebula palette.
- **Rings / Ripples** — concentric `sin(dist·scale − time)` from a moving center.
- **Spiral / Tunnel** — `atan2 + log(r)` swirl.
- **Checkerboard / Grid** — animated `patternCoverage` grid/diagonal.
- **Interference / Moiré** — two rotated gratings multiplied.
- **Gradient Sweep** — animated angle gradient (palette showcase).
- **Warp** — feedback-style domain warp of any of the above.

Palettes come from the material gradient-stop system (reuse), so every pattern ships palette presets
(Ocean, Sunset, Neon, Mono, Aurora…).

---

## 5. Performance & determinism

- One fragment pass, full-res, per pattern layer — pure ALU, no texture reads (except optional feedback).
  Pipeline built once; one uniform slot; buffer-only bind group. 60fps at 4K is expected.
- **Frame-pure:** the shader reads `time = frameNumber/fps` only — no `Date`/RNG — so scrub/export are
  byte-identical (the house rule that also governs the cloner).
- No per-frame allocations (one `writeBuffer` per frame, dynamic-offset dispatch), matching the image/
  shape pipelines.

## 6. Testing

- **Pure**, harness-tested (`verify:pattern`): `resolvePattern(config)` produces the exact float layout
  (indices match the WGSL constants), presets are valid, palette flattening matches material's, and a
  built `GenerativePatternLayer` survives the `validation.ts` round-trip (the strip-guard).
- **GPU/WGSL is browser-only** — the shader math, pipeline wiring, and visual result cannot be verified
  in this environment; they need a Chromium/WebGPU pass. The plan minimizes that risk by copying the
  exact, working effect-pipeline idiom and reusing shipping WGSL utils.

## 7. Phasing

- **Phase 1 — engine + 4 patterns end-to-end:** the `generativePattern` layer type (all 9 touch points),
  the `patternPipeline` + `PATTERN_SHADER` with **waves, plasma, kaleidoscope, mosaic**, a palette from
  material stops, and a basic panel (type picker + core sliders). `verify:pattern` for the pure resolve
  + round-trip. Browser-verify rendering.
- **Phase 2 — full catalog + palettes + rich UI:** remaining pattern types, palette editor + presets,
  per-type param panels, add-button/inspector polish.
- **Phase 3 — polish:** keyframeable `scale/speed/rotation/warp` as `AnimatableProperty`s; seamless-tile
  mode; a "blend with layer below" variant (as an effect too); motion blur; profiling/LOD.

Files: new `src/procedural-gpu/**`, `scripts/verify-pattern.mjs` + `package.json`; touches
`core/types.ts`, `core/factory.ts`, `core/interpolation.ts`, `engine/renderer.ts` (the big one — new
pipeline + shader), `project-system/services/validation.ts`, `store/editor.ts`, `store/inspector.ts`,
`ui/panels/CanvasToolbar.tsx`, `ui/panels/Inspector.tsx`, new `ui/panels/GenerativePatternPanel.tsx`,
`ui/panels/timeline/TrackArea.tsx`.

## 8. Risks

- **GPU/WGSL unverifiable here** — the renderer changes (new pipeline, shader) and every visual need a
  browser/WebGPU pass; I'll write them against the exact working templates but they are the untestable
  part. Recommend building Phase 1 behind the add-button and validating in Chromium before Phase 2.
- **`renderer.ts` shader bloat** — the pattern shader is large; keep it one well-sectioned `PATTERN_SHADER`
  const with the frozen-id discipline so TS/WGSL can't drift.
- **The strip-guard** (`validation.ts`) — easy to forget; it's step 5 and the round-trip harness guards it.
