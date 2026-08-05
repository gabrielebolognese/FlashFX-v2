# Video Playback Freeze — Root Cause & Fix

## Symptom
During playback the video picture **freezes** (or stutters badly on 4K) while **audio
keeps playing** and the playhead keeps moving. Prior perf work (resolveFrame cache,
playhead isolation, decoder LRU cap, teardown) did not fix it — it targeted the wrong layer.

## Root cause (decoder output-pool stall)
The visual comes entirely from the **WebCodecs** decoder pool; the hidden `<video>` element
is used **only for audio**. A decoded `VideoFrame` transferred worker→main-thread **still
occupies the hardware decoder's output-frame pool slot until `.close()` is called**, and that
pool is small (~16–24 frames).

`frameScheduler` retained decoded frames bounded **only by a 512 MB byte budget** — no
frame-count cap. At ~8 MB per 1080p frame, that's ~60 open frames before eviction. During
playback it prefetched **30 ahead** (`LOOKAHEAD_NORMAL`) and kept played frames behind the
playhead, climbing to ~50–60 open frames — far past the decoder pool. The decoder stopped
emitting, `getFrame()` returned null every tick, and the renderer held the last texture
forever → **frozen picture**. The 512 MB guard never fired (the pool chokes at ~24 frames ≈
200 MB, under budget), so nothing ever closed frames to relieve it → permanent stall. (For
4K, the byte budget trips first at ~15 frames → evict/recover churn → the "stutters" variant.)

Audio was unaffected because it runs on the `<video>` element's independent media clock —
hence audio-plays-while-video-freezes.

## Fix (this change)
Match the ring-buffer model production browser editors use (see below):
- **Per-asset open-frame COUNT cap** (`MAX_OPEN_FRAMES_PER_ASSET = 12`), enforced on every
  decoded-frame inject, closing evicted frames so the decoder pool is freed and it keeps
  emitting. Eviction policy is a pure, tested function `selectFramesToEvict`
  ([frameEviction.ts](../src/engine/video/frameEviction.ts)): **evict already-played frames
  first** (behind the playhead, oldest first), then the frames farthest ahead — a tight ring
  around what's on screen. Proven by `npm run verify:framecap` (6 checks).
- **Smaller look-ahead** — `LOOKAHEAD_NORMAL 30→10`, `LOOKAHEAD_FAST 60→18` — so the decoder
  never decodes/emits more frames ahead than its pool holds.
- **Smaller worker decoded-frame cache** — `DECODED_CACHE_MAX_FRAMES 8→6` — since those open
  frames share the same decoder pool as the scheduler buffer.

Net: open frames per decoder drop from ~60 to ≲12–14, comfortably under the pool limit, so
the decoder keeps emitting and `getFrame()` returns frames → the picture advances.

**Verify in browser** (can't run WebCodecs here): play a 1080p and a 4K clip — the picture
should track the playhead smoothly without freezing; watch the decoder doesn't stall after
~1 s.

## How Canva / CapCut Web do it (research → target architecture)
Every production WebCodecs editor converges on the same model (sources below):
1. **Audio is the master clock.** Poll `AudioContext.currentTime` (offset by `outputLatency`
   for "reaching the ears"); video is a **passive** follower that never tracks time itself.
2. **Decode is decoupled from render.** The decoder callback just **queues** frames into a
   small **ring buffer (~5–10)** kept filled *ahead* of the playhead; a separate rAF loop
   displays them and **closes** each after use.
3. **Display the latest decoded frame ≤ current time, drop the rest.** Frame drops are normal;
   **video is never allowed to block/hold** waiting for an exact frame — that is exactly what
   produces a freeze.
4. Chunk-based load (e.g. 30 s audio / 300 s video segments) bounds memory on long clips.

FlashFX now matches (2) and (3) via the count cap + eager close. The remaining gap is (1): the
visual runs on a **rAF wall-clock** while audio runs on the `<video>` element's own clock —
two independent clocks resynced within an ~80 ms drift window (`videoAudioPlayer.ts`). That's
acceptable for v1 but the **correct long-term architecture is to make audio the single master
clock** and drive video frame selection from it (and ideally decode audio via WebCodecs /
Web Audio rather than a second hidden `<video>`, removing the split-brain + the extra decoder
per asset). That's a larger, separate rework — the count-cap fix unsticks the freeze now.

**Sources:** [webcodecsfundamentals.org — playback pattern](https://webcodecsfundamentals.org/patterns/playback/) ·
[web.dev — CapCut WebCodecs/WASM case study](https://web.dev/case-studies/capcut) ·
[web.dev — audio output latency & A/V sync](https://web.dev/articles/audio-output-latency) ·
[Chrome — WebCodecs best practices](https://developer.chrome.com/docs/web-platform/best-practices/webcodecs)
