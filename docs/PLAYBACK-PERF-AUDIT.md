# FlashFX - video/image playback performance audit

A full audit of how video + image playback works today, what causes the lag (especially on long
videos), and a ranked fix plan. Produced by a 6-agent audit (4 code + 2 research) + synthesis,
Sep 2026. Findings are grounded in the actual code with file:line.

## TL;DR - the single biggest cause

Long-video **scrubbing and seeking**. On the live `mediabunny` backend, every scrub position outside a
16-frame forward window forces a **seek to the nearest keyframe + decode-forward through the whole GOP**
to show one frame, at **full resolution**, with **no decoded-frame cache** for backward moves, and the
scrub path is **not rAF-coalesced** - so one fast drag across a long clip fires many full-GOP reseeks and
full-composition resolves back-to-back on the main thread. That is the "drag the playhead -> freeze ~1s
-> snap" lag. Long/high-bitrate clips have larger GOPs (250-300 frame keyframe intervals are typical for
screen/social exports), so nearly every arbitrary scrub position on a long clip pays a full
keyframe-to-target walk.

## The recurring theme: the fix machinery is built but INERT

The most important insight for effort estimation - several high-value levers already exist and are just
disconnected:

- **Proxy downscale is a no-op stub.** `frameScheduler` correctly detects >1080p assets and calls
  `setProxyMode(assetId, 0.5)` on scrub, but `mediabunnyController.setProxyMode` (:203-206) only stores
  the number and does nothing. 4K footage decodes + uploads at full 3840x2160 (~33 MB/frame) even while
  scrubbing at 25% preview quality. The dormant legacy backend has a real implementation to mirror.
- **`retainOnly` (orphan-texture leak fix) is dead code** - written at `videoTextureCache.ts:46`, never
  called. Orphaned 4K textures linger to the 24-texture cap (~800 MB VRAM).
- **The decoded-frame LRU was lost** in the mediabunny migration - the legacy worker had a 4-frame cache
  (`videoWorker.ts:472-478`); the live path keeps only one open sample per cursor, so backward/oscillating
  scrubs re-walk the GOP every time.
- **Scrub cancel + keyframe positions are stubbed** - `cancelFrame` is a no-op and `getKeyframes` returns
  `[]` on the mediabunny path, though the data is available via mediabunny's `getKeyPacket`.

## How playback works today (brief)

- **Decode**: on-demand via mediabunny cursors (2 per asset, 16-frame forward window). A far target =
  cursor reopen (keyframe seek + GOP decode-forward). Legacy mp4box+WebCodecs worker exists behind
  `localStorage.ffx_video_engine='legacy'`. Animated GIF/WebP via `ImageDecoder`.
- **Prefetch**: `frameScheduler` looks ahead only 6-7 frames (~200 ms), hard-locked below the 8-open-frame
  hardware cap (holding more open `VideoFrame`s stalls the decoder output pool).
- **Present**: classic clock holds the last texture on a decode miss (freeze + A/V drift); drop-to-newest
  (`getPresentableFrame`) exists only on the opt-in audio-master path.
- **Resolve**: `resolveFrame` (interpolation.ts:1089) re-resolves the ENTIRE composition every frame and
  every scrub sample - no per-layer memo; linear keyframe scans; precomps recursively re-resolve static
  sub-comps; cloners allocate per-instance every frame.
- **Textures**: video frames convert YUV->RGBA and upload at source resolution; pattern/lottie layers mint
  a new `GPUTexture` every frame into an unbounded map (VRAM growth -> device loss on generative playback).

## Root causes (ranked)

1. **GOP-walk seeks with no decoded-frame cache** (mediabunnyController.ts:15-17,118-135,156-186) - the
   dominant scrub/seek lag; worse the longer the GOP.
2. **Proxy path inert** (mediabunnyController.ts:203-206) - full-res decode/upload during low-res scrub.
3. **Scrub not rAF-coalesced** (playback.ts:174-183, TrackArea.tsx:261-264) - a fast drag multiplies the
   GOP-walk cost by the mousemove rate; superseded decodes still run (cancel is a no-op).
4. **Full-composition re-resolve every frame** (interpolation.ts:1089) - the CPU floor for long TIMELINES
   (many clips, dense keyframes, nested precomps), distinct from long VIDEOS.
5. **Tiny non-adaptive prefetch + freeze-on-miss** (frameScheduler.ts:16-29) - heavy footage drains the
   ~200 ms cushion; classic clock freezes instead of dropping to newest.
6. **GPU/texture leaks + unbounded growth** (videoTextureCache retainOnly uncalled; renderer.ts:2799/4017/
   4027 unbounded pattern/lottie textures) - long-session / generative device-loss hazard.
7. **Decoder-pool exhaustion with many clips** - mediabunny assets map has no cap; open hardware decoders
   scale with distinct assets toward the browser ~16-decoder ceiling (black frames).
8. **Length-linear load stalls** - URL/Supabase assets buffer the whole file (`fetch().blob()`) and >512 MB
   chunked assets concatenate every chunk before the first frame decodes.

## Ranked fix plan

### Quick wins (low effort, high leverage - do first)
1. **rAF-coalesce `scrubTo`** + debounce the exact-frame decode to when the playhead settles (~150-300 ms).
   Reuse the `onFrameReady` rAF-coalesce pattern (playback.ts:38-45) + `PROXY_SETTLE_DELAY_MS`. Cuts a fast
   drag from many full-GOP reseeks to ~1-2. **[high impact / low effort / long-video]**
2. **Add a 3-4 entry decoded-frame LRU** on the mediabunny path (port videoWorker.ts:472-478; use
   `cache/lruCache.ts`). Backward/oscillating scrubs become cache hits instead of GOP walks. **[high/low]**
3. **Call `retainOnly(liveLayerIds)` once per rendered frame** - the function already exists, just uncalled.
   Stops orphaned 4K textures leaking. **[medium/low]**
4. **Bound pattern/lottie textures** with an LruCache / stable per-layer key (copy the particle path) instead
   of the unbounded `imageTextures` map. Stops per-frame VRAM growth -> device loss. **[medium/low]**
5. **Binary-search keyframe intervals** in `evaluateProperty` (interpolation.ts:241) instead of the linear
   scan. Drop-in win on densely-keyed long timelines. **[medium/low]**
6. **Drop-to-newest on the classic clock** - use `getPresentableFrame` (framePresentation.ts) on the default
   path so a decode miss shows the freshest frame instead of freezing. **[medium/low]**

### Structural (medium effort, the real scrub fix)
7. **Keyframe-snap-then-refine on far seeks** - show the nearest decodable keyframe instantly (1 decode)
   while the exact frame decodes forward; refine on settle. Expose keyframe positions
   (mediabunny `getKeyPacket`; mirror legacy `getNearestKeyframeBefore`). **[high/medium/long-video]**
8. **Implement the real CanvasSink 0.5 proxy** behind the already-wired `setProxyMode` - decode+upload at
   half-res during scrub, full-res on settle. NOTE: cuts pixel/upload cost but NOT the GOP walk, so pair it
   with #7. **[high/medium/long-video]**
9. **Drop-to-newest + adaptive lookahead** - widen the prefetch window when decodes are cheap (proxy/all-
   intra), keep it narrow for 4K long-GOP, staying under the open-frame cap. **[medium/medium/long-video]**
10. **Global decoder budget + idle-cursor teardown**, and size the cursor pool to layers-per-asset instead
    of a fixed 2. Adapt the existing `MAX_ACTIVE_WORKERS=8` LRU (bypassed on mediabunny). **[medium/medium]**
11. **Separate the thumbnail/filmstrip decode lane** from playback (dedicated sink, `samplesAtTimestamps`),
    persist sprite sheets to OPFS. Prevents the "thumbnail decode storm" starving playback. **[medium/medium]**
12. **Stream URL assets by HTTP range**; lazy range-read chunked local assets instead of concatenating.
    Extends the existing lazy `BlobSource` approach. **[medium/medium/long-video]**

### Heavy (high effort - the definitive long-video fix + the CPU floor)
13. **Frame-keyed resolve memoization / dirty-layer skip** - memoize `ResolvedLayer` by (layerId, frame),
    invalidate on edit, skip unchanged layers + static sub-comps. Repurpose the existing RenderTree
    dirty-tracking (currently discarded via `markAllClean`). **[high/high/long-timeline]**
14. **Background all-intra / short-GOP low-res proxy file on import, persisted to OPFS** - what every desktop
    NLE ships. Transcode originals in a worker so every seek is ~1 decode; edit against the proxy, relink to
    full-res for export. mediabunny has the encoder/muxer; project-system already persists to IndexedDB.
    **[high/high/long-video - the definitive seek fix]**
15. *(Optional)* **Zero-copy `importExternalTexture`** on the playback hot path (reserve the pooled owned
    texture for paused/effects/last-frame-hold). **[low/medium]**

## Best-practice references (from the research)
- **Keyframe-aware seeking** (seek to nearest keyframe, decode forward) is the industry norm; random
  per-frame decode is pathological on long-GOP footage.
- **Proxy / preview media** (low-res, all-intra or short-GOP) is how Premiere/Resolve/FCP make long 4K
  scrub instantly; the web equivalent is a WebCodecs-transcoded proxy in OPFS.
- **Adaptive scrub quality** (low-res while dragging, full-res on pause) + **filmstrip sprite caching**.
- **`requestVideoFrameCallback` / WebCodecs streaming** + **`importExternalTexture`** zero-copy upload.
- **mediabunny** provides CanvasSink (scaled decode), `getKeyPacket` (keyframe seek), `samplesAtTimestamps`
  (filmstrips), and a WebCodecs encoder (proxy generation) - most of what's needed is in the lib already.

## Suggested sequencing
Ship the **6 quick wins first** (a day or two, mostly reconnecting inert code) - they remove most of the
felt scrub lag and the VRAM leaks immediately. Then **#7 + #8** together for the far-seek freeze on 4K.
Then **#13** (resolve memo) for long-timeline CPU, and **#14** (background proxy) as the definitive
long-video seek fix.
