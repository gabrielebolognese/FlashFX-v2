# Field Sampling Engine — Performance Audit

## 1.1 CPU/GPU Boundary Violations

| File | Line | Violation | Fix |
|------|------|-----------|-----|
| `fields.ts` | 16 | `new Float32Array(width * height)` allocated per frame inside `rasterizeField()` — at 600x800 = 480,000 floats = 1.9MB per frame | Move SDF to persistent GPU texture, never re-rasterize per frame |
| `fields.ts` | 62 | `new OffscreenCanvas(width, height)` + `getContext('2d')` called inside `rasterizeGlyph()` which runs per frame | Rasterize glyph once at init/config-change, cache result |
| `fields.ts` | 77 | `for (let i = 0; i < width * height; i++)` — 480K iterations per frame on CPU reading pixel data | Move to GPU texture sample |
| `fields.ts` | 84-116 | `applyDistanceTransform()` — brute-force O(N * R^2) with R=16, N=480K = catastrophic per-frame cost (runs nested triple loop: height * width * 33*33 = ~522 million iterations) | Replace with GPU JFA or run only at init |
| `fields.ts` | 118-142 | `rasterizeNoise()` — per-pixel simplex noise with octave loops, 480K * 4 octaves = 1.9M noise evaluations per frame on CPU | Move noise entirely to WGSL compute shader |
| `fields.ts` | 144-178 | `rasterizePath()` — creates new OffscreenCanvas + Canvas2D + getImageData + distance transform PER FRAME | Cache path SDF, regenerate only on config change |
| `fields.ts` | 213-238 | `rasterizeComposite()` — recursively rasterizes multiple fields then combines with CPU loop (doubles/triples the per-frame cost) | All field combination in GPU compute shader |
| `samplers.ts` | 12-26 | `generateSamples()` returns `FieldSample[]` — dynamically-sized array of objects allocated per frame | Move sampling to GPU compute shader |
| `samplers.ts` | 29-53 | `sampleGrid()` — JS for loop with `cols * rows` iterations (at cellSize=4: 150*200=30K iterations) + `samples.push()` per iteration | GPU compute shader dispatches workgroups |
| `samplers.ts` | 55-116 | `sampleScanlines()` — nested loops iterating every pixel on every scan line + object allocation | GPU compute shader |
| `samplers.ts` | 118-162 | `sampleOffsetBundle()` — 30 copies * 80 segments = 2400 iterations + `computeOffsetPath()` allocating new arrays | GPU compute shader |
| `marks.ts` | 3-23 | `renderMarks()` uses Canvas 2D to draw potentially tens of thousands of marks individually | Replace with GPU instanced draw |
| `marks.ts` | 33-40 | `renderDots()` — `ctx.arc()` called per sample in a loop (10K-30K draw calls per frame) | Single instanced GPU draw call |
| `marks.ts` | 55-65 | `renderDashes()` — `ctx.moveTo/lineTo` per sample, then one `ctx.stroke()` (better, but still CPU path building) | GPU instanced quads |
| `renderer.ts` | 32 | `new OffscreenCanvas(width, height)` created when configHash changes — not per frame, but still on main thread | Move to worker |

## 1.2 WebGPU Resource Lifecycle Problems

The current implementation does NOT use WebGPU at all. It uses Canvas 2D API entirely on the main thread. There are zero GPU resources to audit — the entire system is CPU-bound Canvas 2D rendering, which is the fundamental architectural failure.

## 1.3 SDF / Field Rasterization

| Issue | Status |
|-------|--------|
| Glyph SDF computed on main thread? | YES — `rasterizeGlyph()` in `fields.ts:61` runs synchronously on main thread |
| Runs every frame? | YES — `renderFieldLayer()` calls `rasterizeField()` unconditionally per frame |
| Stored as CPU Float32Array? | YES — `FieldGrid.data` is a CPU-side `Float32Array` that is never GPU-uploaded |
| Distance transform is O(N*R^2)? | YES — brute-force nested loops in `applyDistanceTransform()`, not JFA |

## 1.4 Instanced Draw Call Correctness

The system does NOT use instanced draw calls. It uses Canvas 2D `arc()`/`moveTo()`/`lineTo()` in a loop — the most CPU-intensive possible approach. There is no GPU rendering pipeline whatsoever.

## 1.5 Main Thread Blocking

`renderFieldLayer()` in `renderer.ts` is called synchronously from the main WebGPU renderer's frame callback. It performs:
1. JSON.parse of config (allocation)
2. Full field rasterization (hundreds of millions of CPU ops for distance transform)
3. Full sample generation (tens of thousands of iterations)
4. Full Canvas 2D mark rendering (tens of thousands of draw calls)

All of this blocks the main thread for potentially 50-200ms per frame.

## 1.6 Memory Leak Audit

| Issue | Status |
|-------|--------|
| OffscreenCanvas in `rasterizeGlyph()` | LEAK — new canvas created per call, never freed |
| OffscreenCanvas in `rasterizePath()` | LEAK — new canvas created per call, never freed |
| `RendererEntry` cleanup | PARTIAL — `removeLayer()` exists but `OffscreenCanvas` has no explicit destroy |
| Float32Array allocations | PRESSURE — `new Float32Array(480K)` per frame causes massive GC pressure |

## Summary

The system is architecturally broken: it performs ALL computation (field rasterization, sampling, mark rendering) on the CPU main thread using Canvas 2D API, with zero GPU acceleration and massive per-frame allocations. The fix requires a complete rewrite to GPU compute + instanced rendering in a Web Worker.
