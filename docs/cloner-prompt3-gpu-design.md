# Cloner — Prompt 3 GPU Rendering: Design (for review before any renderer changes)

Status: **design-first**. Nothing in `src/engine/renderer.ts` or the core `Layer`
union has been changed. The only code landed for Prompt 3 is the pure, verified
CPU prep in [`src/cloner/instanceMatrix.ts`](../src/cloner/instanceMatrix.ts)
(`composeInstanceMatrix`, `packInstanceBuffer`) — proven by `npm run verify:cloner`.

This document is the reviewable design for Deliverables 2–6. On approval I'll wire
it in as described. **None of it is runtime-verifiable in this environment (no
WebGPU/browser)** — it's browser-tested, like the filter batches were.

---

## 0. Reality vs. the prompt's assumptions (what's net-new here)

The prompt says to *reuse* existing instancing / precomp-RTT / scrub signals. In
this codebase those don't exist, so each is built fresh (grounded in what *is* here):

| Prompt assumes | Actual state | Consequence |
|---|---|---|
| Existing GPU instancing (particle buffers) | **None.** Every draw is `p.draw(…, 1, …)`; no `drawIndexed`, no `instance_index`, no `stepMode:'instance'` | Build the **first** instanced pipeline |
| `mat4` model-matrix convention to match | **None.** Vertex shaders compose transforms inline (2D, Y-down) | `instanceMatrix.ts` matches the inline math; matrix convention introduced here |
| Precomp / adjustment-layer render-to-texture to reuse | **Neither exists.** Only per-layer blur/glow isolation (`layerTex`/`sceneTex`/`blurFxTex`, `ensureBlurTextures`, `renderer.ts:3670+`) | Build a **new** reusable "render source once → cache texture" from that infra |
| Precomp textures are premultiplied | Content pipelines use **straight** `src-alpha` (`renderer.ts:2690`); only RTT composites use premultiplied `one`/`one-minus-src-alpha` (`renderer.ts:2887`) | Blend handling corrected in §7 |
| Renderer-exposed scrub/proxy signal | `isScrubbing` is **private** to `playback.ts:30`; the `4/8/16` quality knob only drives `motionBlurSamples` (`renderer.ts:2555`) | Plumb a new `setInteractive()` setter, mirroring `setMotionBlurSamples` |
| Cloner is a renderable layer | `ClonerLayer` is a **standalone module type**, not in the `Layer` union, not resolved, never reaches the draw loop | Scene-graph integration is a prerequisite (§6) |

Everything below is designed to be the *smallest correct* addition on top of the
real renderer, not a parallel system.

---

## 1. Deliverable 1 — instance buffer (DONE, verified)

[`instanceMatrix.ts`](../src/cloner/instanceMatrix.ts):

- `composeInstanceMatrix(t)` → column-major 4×4 affine, `world = T(pos)·R(rotZ)·S(scale)·local`.
  Rotation sign matches the renderer's inline `rotated = (x·cos − y·sin, x·sin + y·cos)`
  (Y-down CCW), so an instanced draw reproduces the non-instanced path.
- `packInstanceBuffer(instances)` → interleaved `Float32Array`, `INSTANCE_FLOAT_COUNT = 20`
  per instance: `[ mat4 (16, col-major) | r, g, b, opacity ]`, stride 80 B.
- Buffer is sized strictly from the (already `renderCount`-capped) array length →
  this is also the Deliverable-5 GPU-level cap defense.

Matches WGSL `struct InstanceData { modelMatrix: mat4x4<f32>, colorTint: vec4<f32> }`.
Uploaded as an **instance-step vertex buffer** (see §2), the house-consistent choice
(the renderer already uses vertex buffers, e.g. `pathVertexBuffer`; it has no storage-buffer
read path in the vertex stage today).

---

## 2. Deliverable 2 — instanced shape path (the single-draw-call core)

**Geometry to instance.** Start with the SDF-quad shapes (rect / circle / star) — the
existing shape pipeline draws a fixed 6-vertex quad and evaluates the fill as an SDF
in the fragment shader (`shapeBindGroup` + `p.draw(6)`, `renderer.ts:3633`). All clones
share the *same source shape*, so the per-shape SDF params come from the source's shape
uniform (bound once), and only transform+tint vary per instance. This makes the whole
cloner a single `draw(6, N)`. (Tessellated pen-paths via `pathVertexBuffer` are a
follow-up — same instance buffer, `drawIndexed(count, N)` — noted in §8.)

**New pipeline `clonerShapePipeline`** — a variant of the shape pipeline with a second,
instance-step vertex buffer:

```
vertex buffers:
  [0] none needed — base quad from @builtin(vertex_index) (as the shape vs already does)
  [1] instance buffer, arrayStride = 80, stepMode = 'instance', attributes:
        @location(0..3) vec4<f32>  // modelMatrix columns 0..3
        @location(4)    vec4<f32>  // colorTint (rgb, opacity)
bindGroup(0): source shape uniform (SDF params) + resolution   // shared by all instances
blend: shapeBlend (see §7)
```

WGSL (new `CLONER_SHAPE_SHADER`, sketch):

```wgsl
struct VSOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) tint: vec4f };

@vertex
fn vs(@builtin(vertex_index) vi: u32,
      @location(0) m0: vec4f, @location(1) m1: vec4f,
      @location(2) m2: vec4f, @location(3) m3: vec4f,
      @location(4) tint: vec4f) -> VSOut {
  var quad = array<vec2f,6>(vec2f(0,0),vec2f(1,0),vec2f(0,1),vec2f(0,1),vec2f(1,0),vec2f(1,1));
  let p = quad[vi];
  let local = (p - vec2f(0.5)) * u.sourceSize;          // source shape's own size
  let model = mat4x4<f32>(m0, m1, m2, m3);              // per-instance TRS
  let world = (model * vec4f(local, 0.0, 1.0)).xy;
  let ndc = vec2f((world.x / u.resolution.x) * 2 - 1, 1 - (world.y / u.resolution.y) * 2);
  var o: VSOut; o.pos = vec4f(ndc, 0, 1); o.uv = p; o.tint = tint; return o;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4f {
  let fill = evalShapeSDF(in.uv, u /* source shape params */);   // reuse existing SDF fill logic
  // Straight-alpha content (matches renderer.ts:2690); tint+opacity applied together:
  return vec4f(fill.rgb * in.tint.rgb, fill.a) * vec4f(1,1,1, in.tint.a);
}
```

`evalShapeSDF` is factored out of the existing shape fragment shader — **reuse, not
reimplement** (Deliverable-2 requirement). Single `pass.setPipeline(clonerShapePipeline);
pass.setVertexBuffer(1, instBuf); pass.draw(6, instanceCount)`.

---

## 3. Deliverable 3 — texture-stamp fallback (complex sources)

For a source that isn't a simple SDF shape (image, text, or — once they exist — a
precomp): **render the source once → cache the texture for the frame → stamp N times.**

**New reusable source-RTT.** There's no precomp RTT to call, but the machinery exists:
`ensureBlurTextures` already allocates full-frame color targets and the loop at
`renderer.ts:3689+` already renders an isolated layer into `layerTex`. Generalize that
into a small helper:

```
renderSourceToTexture(sourceRef, frame) -> GPUTextureView   // cached in a per-frame Map keyed by sourceRef
```

- Allocate a source texture (reuse `ensureBlurTextures`' size/format/usage conventions).
- Render the source layer once via the existing per-layer draw fn into it (the same
  `d.fn(pass)` mechanism the blur path uses).
- Cache by `sourceRef` in a `Map` cleared at the **start of each `renderFrame`** — so N
  stamps reuse one render (Deliverable-3 "once per frame" requirement; the acceptance
  counter reads 1, not N).

**New pipeline `clonerStampPipeline`** — identical instance-buffer layout and vs to §2
(the shared instancing core), but:
- The vs maps the unit quad by the model matrix using a **unit source size** = the source
  texture's dimensions.
- The fs **samples the source texture** instead of `evalShapeSDF`:

```wgsl
@fragment
fn fs(in: VSOut) -> @location(0) vec4f {
  let src = textureSample(srcTex, srcSampler, in.uv);   // premultiplied (RTT convention, §7)
  return vec4f(src.rgb * in.tint.rgb * in.tint.a, src.a * in.tint.a);   // premultiplied tint+opacity
}
```

Same `draw(6, instanceCount)`. **Limitation (documented):** identical clones — same look,
different transform/tint. Per-instance *content* variation (data-bound text/images) is the
deferred third path (§4, §8).

**Shared core, two thin variants** — as the prompt insists: identical instance buffer,
identical `instance_index`/instance-attribute consumption, identical draw shape. The only
differences are geometry source-size and fragment (SDF eval vs texture sample) + blend
state (§7). Build `clonerInstancedCore` once; §2 and §3 are two fragment/bind variants.

---

## 4. Deliverable 4 — auto-selection

Pure function, memoizable per cloner-config (decision is a function of source *type*):

```ts
type ClonerRenderPath = 'instanced-shape' | 'texture-stamp' | 'per-instance'; // 3rd reserved
function selectClonerRenderPath(sourceLayer: Layer): ClonerRenderPath {
  if (sourceLayer.type === 'shape' && isSdfShape(sourceLayer)) return 'instanced-shape';
  // image / text / (future precomp) / non-SDF vector → flatten once, stamp:
  if (/* data-bound source */ false) return 'per-instance'; // deferred — not handled this prompt
  return 'texture-stamp';
}
```

`'per-instance'` is returned but **not handled** yet (throws/falls back to a single stamp
with a `console.warn`) — the clean extension point the prompt asks for; no half-built path.

---

## 5. Deliverable 5 — renderCount at the GPU level

Already enforced by `packInstanceBuffer` sizing from the array length (§1). Additionally,
the instance buffer is (re)allocated to `max(existingCapacity, instanceCount)` and the draw
uses `instanceCount = instances.length` — never a distribution's theoretical count. Buffer
growth follows the renderer's existing "grow-and-reuse" convention (as `pathVertexBuffer`
does). A hard ceiling (e.g. `MAX_CLONER_INSTANCES`) rejects absurd values defensively.

---

## 6. Scene-graph integration (the prerequisite) — exact diff

To make a cloner render, it must reach the draw loop. Minimal, additive plan:

1. **`core/types.ts`** — add `ClonerLayer` to the `Layer` union (import from `src/cloner`).
   Consequence: every `switch (layer.type)` with exhaustive handling needs a `case 'cloner'`.
   Grep target: `layer.type ===` / `switch (layer.type)` across `core/`, `store/editor.ts`,
   `engine/`, `ui/`. Most can delegate to a no-op or a thin resolver.
2. **`core/factory.ts`** — `createClonerLayer` (wrap `src/cloner/factory.ts:createDefaultCloner`
   into a full `Layer` with `visible`/`locked`/`parentId`/`trackId`).
3. **`core/interpolation.ts`** — in the resolve pipeline, resolve a `ClonerLayer` by calling
   `computeInstanceTransforms(cloner, frame, ctx)` with `ctx.evaluateSourceTransform` wired to
   the existing `evaluateNumber`-based source-layer evaluation, producing a
   `ResolvedClonerLayer { path: ClonerRenderPath, instances: InstanceTransform[], sourceRef }`.
4. **`engine/renderer.ts`** — in the `draws[]` build loop (`renderer.ts:3480+`), when a resolved
   layer is a cloner: (a) `texture-stamp` → `renderSourceToTexture` (cached), then push a stamp
   draw; (b) `instanced-shape` → push an instanced-shape draw. Both upload `packInstanceBuffer`
   to a per-cloner instance buffer and issue one `draw(6, N)`. Cloner draws slot into the same
   `scenePass` accumulation as other layers (no blur/glow interaction in v1).
5. **`store/editor.ts` / UI** — creating/selecting a cloner + an inspector panel: **out of scope
   here** (later prompt); tests construct cloner layers directly.

This is the largest single change and the main reason for design-first review — it touches the
`Layer` union and many switches. I'll do it as one reviewable commit separate from the pipeline.

---

## 7. Premultiplied alpha — corrected for THIS renderer

The prompt assumes premultiplied source textures; reality is mixed. Pinned rules:

- **Instanced-shape path**: the shape SDF fill is **straight alpha** (matches the content
  pipelines' `blendState`, `renderer.ts:2690`: `color src-alpha / one-minus-src-alpha`). Apply
  tint to rgb and opacity to alpha, then let that blend state composite:
  `finalRGBA = vec4(fill.rgb * tint.rgb, fill.a * tint.a)`. Use **`shapeBlend = blendState`**
  (straight), the same one shapes already use — do NOT switch to premultiplied here.
- **Texture-stamp path**: the source texture comes from an RTT render. If we render it with the
  **premultiplied** composite convention (`renderer.ts:2887`, `one/one-minus-src-alpha`) — which
  is the correct convention for an intermediate target — then the sampled color is premultiplied,
  and we must: `finalRGBA = vec4(src.rgb * tint.rgb * tint.a, src.a * tint.a)` and draw with the
  **premultiplied** blend state `premultipliedOver`. Multiplying premultiplied rgb by `tint.a`
  keeps rgb and alpha consistent → no dark/light fringing at translucent edges.
- **Decision to confirm:** render the source-RTT premultiplied (recommended, matches the existing
  composite passes) vs. straight. This choice dictates the stamp fs + blend exactly as above. I'll
  default to premultiplied unless you say otherwise.

Golden-image test (acceptance #6) targets overlapping translucent stamps specifically.

---

## 8. Deliverable 6 — LOD / scrub degradation

- **Signal:** add `renderer.setInteractive(active: boolean)` (mirrors `setMotionBlurSamples`,
  `renderer.ts:2558`); `playback.ts` calls it in `scrubTo` (`playback.ts:154`, sets `isScrubbing`)
  and clears it on a **debounced** scrub-end (~120 ms) — reusing playback's existing scrub state,
  not a new detector.
- **Deterministic reduction:** when interactive AND `instanceCount > threshold`, render every
  `k`-th instance by index (`k = ceil(count / budget)`) — never a random subset, so nearby frames
  don't flicker. This is a CPU-side slice of the packed buffer (stable, reproducible).
- **Per-path thresholds (profile-driven, not shared):** the instanced-shape path is one draw call
  → high threshold (may not degrade at all); the texture-stamp path costs per-stamp texture
  sampling → lower threshold + optionally a **half-res source-RTT proxy** while interactive.
- **Restore:** on debounced scrub-end, re-render full count / full-res (one clean frame, no
  per-movement flashing).

---

## 9. Browser test plan (maps to the 6 acceptance criteria)

None are runnable here; this is the manual/instrumented plan for in-browser validation:

1. **Instanced correctness** — 10×10 shape cloner; overlay the Prompt-1 grid coords; confirm 1 draw
   call via `GPUDevice` timing / a draw counter (not 100).
2. **Stamp once-per-frame** — 8–12 precomp/image cloner; a counter on `renderSourceToTexture` for
   that source reads **1/frame** regardless of N.
3. **Auto-selection** — assert `selectClonerRenderPath()` returns `instanced-shape` for a shape and
   `texture-stamp` for an image/text (unit-testable *now*, pure — I can add this to the harness once
   `selectClonerRenderPath` lands as a pure function).
4. **Scrub budget** — scrub across both cloners; frame time under the renderer's target (16/33 ms);
   measured, not "feels smooth".
5. **LOD engage/disengage** — during scrub with high N, confirm reduced-count/proxy path is used and
   full quality returns after the debounce (no mid-scrub flashing).
6. **Alpha** — golden-image compare of overlapping translucent instances; no edge fringing.

Note #3's `selectClonerRenderPath` is pure and **can** be verified in `verify-cloner.mjs` — I'll add
it there when it lands, so at least the routing logic has automated coverage.

---

## 10. Open decisions for you

1. **§6 scene-graph integration** — OK to add `ClonerLayer` to the core `Layer` union now (the big,
   many-switch change), or keep the cloner behind an adapter a while longer?
2. **§7 source-RTT premultiplied** vs straight — I recommend premultiplied (matches existing composites).
3. **§2 scope** — start instanced-shape with SDF shapes only (rect/circle/star), pen-path vector as a
   fast follow? (Recommended.)
4. **§8 thresholds** — pick concrete per-path instance thresholds now, or tune after first profile?

On your answers I'll implement in this order: **selectClonerRenderPath (pure, testable) → source-RTT
helper → clonerInstancedCore + two variants → scene-graph wiring → LOD**, landing scene-graph and
pipeline as separate reviewable commits.
