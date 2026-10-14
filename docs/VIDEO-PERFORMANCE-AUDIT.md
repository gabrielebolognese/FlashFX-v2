# Video Performance Audit (2026-10-14)

Scope: why adding a *real* video to the timeline makes playback lag, and what to
improve across the video subsystem. Produced from a 5-way parallel code audit
(decode + scheduling, texture upload + GPU cache, playback clock + frame loop,
renderer per-frame cost, memory + multi-clip + legacy backend). Every item cites
`file:line`. No code was changed to produce this document.

The decode architecture is fundamentally sound: streaming forward cursors (not
seek-per-frame), a bounded decode queue, bounded frame caches, correct
`VideoFrame.close()` discipline, persistent reused GPU textures, a bounded LRU,
and no synchronous GPU readback on the hot path. The lag is not one broken
subsystem; it is a small number of concrete costs layered on top of that good
base. They are ranked below by impact.

## Status (updated 2026-10-14)

- **P0 - DONE** (`f031d26`): rotation moved to the GPU sampler.
- **P1b - DONE** (committed): drop-to-newest present policy during playback, decoupled from the audio-master flag.
- **P2a - DONE** (committed): prefetch only assets with a live renderer requirement (on-screen/in-time/visible) instead of every imported asset, plus a per-frame `frameBoundary()` that prunes requirements for layers no longer drawn.
- **P2c - PARTIAL (safe subset) DONE**: the expensive per-frame work the audit flagged - text `measureText` (canvas word-wrap + per-line measurement, run every frame per text layer) - is now memoized by the proven `textCacheKey` (complete by construction, incl. `fontEpoch`). The *full* "skip re-resolving static layers" was found UNSAFE as a shared cache: `resolveFrame` mutates resolved layers per frame (`interpolation.ts` ~1703/1735/1748 reassign `transform`, ~1854 sets `consumedAsMatte`), so a shared static `ResolvedLayer` would cross-frame-contaminate / freeze. A full version needs per-frame cloning (marginal gain for simple layers) or more surgical sub-result caches; left as a browser-verified follow-up.
- **P1a - DEFERRED** (user decision): on inspection it is NOT the drop-in the item below implies. Video draws through the shared *image* shader whose binding is `texture_2d`; `texture_external` can't share it, so video needs its own pipeline + a duplicated shader. And `importExternalTexture` is stateless (valid only for the current frame/task), which collides with the renderer's hold-last-frame-on-miss present policy (`renderer.ts` ~4148) - the external path needs per-layer `VideoFrame` retention (re-import on miss), re-introducing the decoder-output-slot pressure the scheduler avoids. ~200 lines of delicate, browser-unverifiable GPU + frame-lifecycle code with a black-video failure mode. Do it with a browser in the loop (or behind a default-off flag).

---

## TL;DR root cause

"Real video lags, test clips don't" is explained by **P0**: the orientation fix
(`f31b330`) rotates every decoded frame of **portrait / phone footage** on the
**main thread**, per frame, while landscape (rotation 0) footage early-returns
untouched. Real phone video is almost always flagged rotated; landscape test
clips are not, so the regression is invisible in testing and bites real content.

On top of that regression sit two structural costs that tax **all** video
(**P1a** per-frame full-res texture copy+convert instead of a zero-copy external
texture, **P1b** the default present policy stalls on any decode miss because the
smooth follower is gated behind a flag that ships OFF), plus a cluster of
multi-clip / per-frame-CPU scaling issues (**P2**).

---

## P0 - REGRESSION: per-frame CPU rotation of portrait footage on the main thread

`src/engine/video/mediabunnyController.ts:247-274` (`applyRotation`), invoked on
every decoded frame at `:212` (fresh decode), `:176` (cache hit), `:382`
(export). Introduced by commit `f31b330` (the short-form orientation fix).

For any clip with container rotation 90/180/270 (portrait phone video), every
presented frame does: `ctx.clearRect` + `ctx.drawImage(frame, ...)` rasterizing a
full ~1080x1920 frame into a 2D canvas (`:262-266`), then `new VideoFrame(rotCanvas, ...)`
(`:270`) which copies the whole canvas synchronously (the ctor-copy is noted in
the code's own comment at `:68-69`). That is a full-frame canvas composite plus a
full-frame pixel copy, **on the main thread** (the mediabunny path dispatches
synchronously - `videoDecoderPool.ts:199`), competing directly with React and the
render loop. At 30fps portrait that is tens of MB/s of blocking memcpy + canvas
raster every frame.

- The **cache-hit** path is worse: it builds `new VideoFrame(cachedBitmap)` (`:176`,
  one full copy) and then `applyRotation` copies **again** - two full-frame copies
  for a single displayed frame.
- Landscape / rotation-0 clips early-return byte-identical at `:249` -> zero added
  cost. This is precisely why the lag only shows on "real video".
- `rotCanvas` is a single shared surface (`:256-258`); two portrait assets of
  different sizes interleaving reallocate it each frame.

**Fix (highest leverage): stop baking rotation into pixels on the CPU.** Carry the
90/180/270 orientation as a flag and rotate at GPU sample time: upload the coded
(un-rotated) frame to the texture untouched, pass the orientation to the video
WGSL, and rotate UVs in the shader (the quad is already sized to the
rotation-corrected display dimensions). The renderer already has a video rotation
uniform slot and MVP transform (`renderer.ts:4164`), though that slot is the
user's *layer* rotation and a *separate* source-orientation input is needed.
Alternative if a bake is required: do it as a one-time GPU blit into the
persistent video texture instead of OffscreenCanvas + `new VideoFrame`. Either
removes one (cache-hit: two) full-frame main-thread copies per frame for all
portrait clips. Browser-gated: the UV-rotation direction needs an in-browser
eyeball (same failure mode as the original orientation fix - a one-line sign flip
if sideways).

Interim safe mitigation (no visual change, verifiable without a browser): upload
the rotated canvas/ImageBitmap directly via `copyExternalImageToTexture` instead
of wrapping it in `new VideoFrame` first (removes one copy), and cache the
**post-rotation** bitmap so cache hits stop re-rotating (removes the double copy
on re-presentation). Does not remove the single per-frame bake during pure
forward playback - only the GPU path does that.

---

## P1a - Per-frame full-resolution copy + color-convert into an rgba8unorm texture

`src/engine/video/videoTextureCache.ts:75-82` (per-layer `rgba8unorm`
`createTexture`) + `:108-112` (`copyExternalImageToTexture` per new frame),
sampled as a plain texture at `renderer.ts:4176`.

Each newly presented frame does a full-resolution GPU copy plus a YUV->sRGB->8-bit
conversion into an intermediate texture: ~8MB/frame @1080p, ~33MB @4K, per layer,
at 30-60fps (~0.5-2 GB/s of copy bandwidth). This is the universal per-frame tax
on all real video playback, independent of rotation.

The design is otherwise correct: the texture is **reused** (reallocated only on a
dimension change, `:69-85`) - the classic alloc-per-frame bug is **not** present;
and uploads are guarded to only fire when the held frame index changes
(`renderer.ts:4121`), so a paused frame and multi-pass effects reuse one texture.

**Fix:** on the common (non-flow) draw, use `device.importExternalTexture({source: videoFrame})`
and sample with `texture_external` + `textureSampleBaseClampToEdge` in WGSL.
Zero-copy, YUV->RGB in the sampler on sampled pixels only, no intermediate
texture, no per-frame copy. Caveat: a `GPUExternalTexture` is valid only for the
current task and cannot be a render attachment, so the optical-flow pre-pass
(`renderer.ts:3625-3663`, which needs texA/texB as both sampled and target) must
keep the copy path - gate `importExternalTexture` to the common path, fall back to
copy for flow. This also subsumes the gamut/8-bit quantization cost
(`videoTextureCache.ts:76`, no `colorSpaceConversion` set).

---

## P1b - Default present policy stalls real video on any decode miss

`src/engine/playback.ts:237` passes `presentLatest = useMaster`, and
`audioMasterClock` defaults to **false** (`src/store/preview.ts:58`). So the
default path takes the exact-frame branch (`renderer.ts:4121-4146`): it demands
the exact source frame and, on a miss, drops to newest only within the tight
`PRESENT_MAX_DISTANCE`, otherwise holds the current texture = visible
stall/stutter whenever decode cannot hit the exact frame. The smoother "show
newest decoded <= target, drop the rest" follower (`renderer.ts:4108-4120`) is
reachable only with the experimental audio-master flag on.

**Fix:** use the drop-to-newest present policy on the wall-clock path during
playback too (decouple it from the audio-master flag). Browser-gated behavior
change but small and high value. (Note the time-based playhead already skips
frames correctly and never accumulates lag - `playback.ts:224-228`; this is only
about which decoded frame is shown on a miss.)

---

## P2 - Multi-clip / per-frame-CPU scaling

### P2a - Prefetch iterates ALL imported assets, not on-screen ones; cursor budget thrashes past ~6 clips
`src/engine/video/frameScheduler.ts:312-329` prefetches every **registered**
asset each tick; registration happens at **import** (`assetManager.ts:247,457,581`),
not at timeline placement - so imported-but-unplaced and off-screen/out-of-time
clips are prefetched (falling back to a naive comp->source map at `:376-387`).
mediabunny opens one cursor (a live `VideoDecoder`) per stream, pool 2/asset
(`mediabunnyController.ts:16`), global cap `MAX_TOTAL_CURSORS=12` (`:31`). With >6
prefetching assets, `enforceCursorBudget` (`:280-294`) tears down the LRU cursor
every tick and the next tick reopens it -> iterator teardown + GOP re-walk from a
keyframe (`:316-336`), constantly. This is the "many clips lag".
**Fix:** gate prefetch/registration on timeline-active + visible clips; prune
requirements when a clip leaves range; scale cursor/pool budgets to the
simultaneously-visible count.

### P2b - Cross-asset frame memory thrash (8 open frames x N assets vs one 512MB budget)
`frameScheduler.ts:25` `MAX_OPEN_FRAMES_PER_ASSET=8`, `:18`
`MEMORY_BUDGET_BYTES=512MB` global, `estimateFrameSize` `:419-424`. ~66MB/asset
@1080p, ~264MB @4K; ~2 prefetching 4K assets (or ~7-8 1080p) exceed the global
budget and `enforceMemoryBudget` (`:461-506`) evicts frames the per-asset cap just
filled and the next tick re-needs -> evict-then-need thrash. **Fix:** make the
byte budget per-asset-aware (proportional to active clips) or lower the per-asset
open cap when many assets are active; account for 4K explicitly.

### P2c - Whole-composition resolveFrame recomputed every forward frame (static layers included)
`src/core/interpolation.ts:1098` `resolveFrame` re-evaluates every property of
every layer every call (transforms, text measurement `:690`, masks, effects,
motion-blur back-sampling). The frame cache (`src/engine/timeline.ts:35-52`) is
keyed by frame number, so monotonic forward playback misses every frame. A "video +
static graphics" comp fully re-resolves the static layers 30x/s for no change.
**Fix:** per-layer "is-animated" short-circuit (cache a resolved layer with no
keyframes/expressions/parented motion, reuse across frames); keep only the video
and genuinely-animated layers on the hot path.

### P2d - Resolve + synchronous GPU submit serialized inline in the rAF tick (no pipelining)
`playback.ts:196-241` -> `renderCurrentFrame` runs `engine.evaluate(frame)` (full
CPU resolve) immediately followed by the synchronous `renderer.renderFrame()`
(`renderer.ts:3829-3860`: `renderTree.syncFromLayers`, text-atlas pin, encode +
submit) in one callback. Decode is prefetched ahead, but resolve(N) and render(N)
are not - frame N's CPU resolve cannot overlap frame N-1's GPU work; when
resolve+encode exceed the frame budget, rAF slips and frames drop. **Fix:**
pipeline - resolve N+1 during/after submit of N, or move resolve to a worker; at
minimum split resolve and submit across microtasks.

### P2e - Per-tick React re-render fan-out tied to currentFrame
`src/store/timeline.ts:47-52` writes `currentFrame` every played frame.
Always-mounted Viewport overlays subscribe and re-run every frame:
`TransformOverlay.tsx:255` (recomputes geometry `:297-309`), `MotionPathOverlay.tsx:16`,
`MaskOverlay.tsx:64`, `BoundingBoxesOverlay.tsx:15`, `PenToolOverlay.tsx:76` (all
mounted unconditionally, `Viewport.tsx:387-405`), plus Inspector / KeyframeTimeline /
InterpolationGraph / TrackArea panels. React reconciliation runs on the same
frames you are rendering video on. (The `<FrameCounter>` isolation at
`Viewport.tsx:576-579` shows the hazard is known.) **Fix:** drive the
playhead/overlays from an imperative subscription into refs/DOM instead of a store
`set`, or gate overlay recompute behind `!isPlaying`.

### P2f - Standalone audio eager-decodes full PCM and never evicts
`src/engine/media/assetManager.ts:486-488` (`decodeAudioData` whole file,
synchronous) retained forever at `:512`; same on project open (`:812-814,836`);
`generateWaveform` runs over full channel data on the main thread (`:498,521-526`).
Video PCM is LRU-bounded (`residentVideoPcm` / `MAX_RESIDENT_VIDEO_PCM`, `:92,961-971`);
standalone audio got no such bound. Many/long audio clips = N full synchronous
decodes at open (stall) + multi-GB resident PCM never released (OOM). **Fix:** give
standalone audio the same lazy + LRU treatment as video PCM; move waveform
generation off the main thread / make it lazy.

---

## P3 - Lower-impact, still worth doing

- **Per-frame bind group + texture view per video layer.** `renderer.ts:4176`
  (`createView()`) + `:4182` (`createBindGroup`) inside the per-frame video loop,
  though inputs do not change frame-to-frame. Driver validation + GC churn at
  60fps. **Fix:** cache view + bind group per layerId; invalidate on texture
  identity change (generation counter in `VideoTextureCache`) or flow-warp
  substitution.
- **GPU upload cache keyed per layer, not per (asset, frameIndex).**
  `videoTextureCache.ts:17,61`. N layers showing the same clip/frame (split clips,
  PIP, duplicates) each upload independently = Nx the P1a bandwidth. **Fix:** key
  textures by `assetId:frameIndex` with a shared-texture tier.
- **Full O(layers) audio reconcile every rAF tick, with per-frame `<video>.currentTime` seeks.**
  `playback.ts:243-251` -> `audioPlayback.ts:320` -> `evaluateAndSchedule` (`:92-140`)
  + `reconcileVideoAudio` (`:151-189`) calls `videoAudioPlayer.syncToPlayhead` for
  every video layer every frame; `syncToPlayhead` sets `el.currentTime` on drift
  >80ms (`videoAudioPlayer.ts:96`) - a real `<video>` seek mid-playback. Under load
  (where drift grows because the main thread is busy) this becomes a corrective
  seek storm, a feedback loop with P2c-e. **Fix:** reconcile on a coarser cadence,
  early-out when the active-layer set is unchanged, rate-limit the drift re-seek.
- **Scrub cache only 4 frames.** `mediabunnyController.ts:25` `FRAME_CACHE_SIZE=4`.
  Oscillating/backward scrub wider than 4 frames (`BACK_TOL=1`, `:18`) re-walks the
  GOP each step. **Fix:** enlarge the per-asset decoded-bitmap cache to 8-12 (they
  hold no decoder slot, so safe) and/or widen `BACK_TOL` / keep a short backward
  cursor.
- **Only 2 cursors per asset.** `mediabunnyController.ts:16`. A 3rd concurrent
  stream on one asset (split clip in 3 regions, or two layers + the scrub
  keyframe-snap index) evicts the LRU cursor and forces a reseek. **Fix:** size the
  per-asset pool to the actual concurrent-stream count + 1, bounded by the global
  budget.
- **Decode cache-hit rebuilds a VideoFrame from the cached ImageBitmap every call.**
  `mediabunnyController.ts:176`. **Fix:** upload directly from the cached ImageBitmap
  for non-rotated clips, skipping the VideoFrame round-trip.

---

## P4 - Minor / cleanup

- **Fresh video import still eagerly full-decodes audio PCM for the waveform**
  (`assetManager.ts:250` -> `extractVideoAudio` `:528-532`), one-at-a-time (serialized
  `_audioExtractChain` `:111`) and dropped afterward, but a full multi-GB decode per
  import. The reload path was already made lazy (`ensureWaveform` `:923-938`); fresh
  import should match it.
- **Sticky global 2D-canvas upload fallback.** `videoTextureCache.ts:102-137`
  (`usedDirectUpload` sticky-false). One `copyExternalImageToTexture` throw degrades
  the whole session to the slower drawImage-to-canvas upload. **Fix:** scope the
  fallback per-asset/per-format and periodically retry the direct path.
- **Legacy videoWorker is a live, flag-gated fallback** (`videoDecoderPool.ts:20-23`,
  `localStorage.ffx_video_engine='legacy'`), bundled as a chunk. MP4-only, no scrub
  keyframe-snap, higher latency; no leak. It will never reach parity with mediabunny.
  **Decision:** keep as documented rollback or delete to drop a worker chunk + a
  large divergent code surface. Low priority.
- **`createView()` allocated every frame** also in `tryFlowWarp` (`renderer.ts:3647-3648`),
  which also does its own separate `device.queue.submit()` (`:3652-3658`) when flow
  retiming is on. Fold into the main encoder; cache the view.
- **Small O(n) scheduler scans** (`frameScheduler.ts:147,369,442,467` `registrations.find`;
  `376,444,473` spread+filter) run every prefetch/eviction. Index by assetId if layer
  counts grow. Low impact now.

---

## Recommended sequence

1. **P0** - fix the rotation regression (GPU UV rotation). This is the reported
   bug and the biggest single win for real portrait footage. Browser-gated eyeball.
2. **P1b** - flip the default present policy to drop-to-newest. Small, high value
   for stutter on decode misses.
3. **P1a** - `importExternalTexture` on the common path. Removes the universal
   per-frame copy+convert; the largest win for all footage.
4. **P2a/P2b** - gate prefetch on visible clips + per-asset-aware memory budget.
   Fixes multi-clip lag.
5. **P2c/P2d** - static-layer resolve short-circuit + pipeline resolve/submit.
6. **P2e** - move the playhead off the per-frame store write.
7. **P2f** - lazy + bounded standalone audio PCM (also an OOM fix).
8. **P3/P4** - as capacity allows.

Everything touching WebGPU output (P0, P1a, P1b, P2d, P3 bind-group/view) is
browser-gated: it passes `tsc`/`lint`/`build`/`test` here but needs an in-browser
eyeball on `editor.flashfx.app`, since there is no WebGPU runtime in the dev
environment.
