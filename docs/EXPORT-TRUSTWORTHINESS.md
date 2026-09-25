# Export Trustworthiness

**Goal:** make the exported MP4 provably match what the user saw in preview - correct video, correct audio, correct timing, correct geometry, no silent losses. "Trustworthy" = a user can hit Export and ship the file without re-checking it.

This plan is the source of truth for export-fix status. Same discipline as `docs/AE-FEATURE-BATCHES.md`: audit first, build only real gaps, pure-harnessed core where possible, gates (`tsc` 0 / `lint` 125 baseline / `build` / `npm test` / em-dash sweep), commit AND push, then flip the row here.

## Founding audit (2026-09-25)

Four parallel read-only audits of the CURRENT code (not docs): codec/mux pipeline, audio mixer, export UI wiring, and preview-vs-export render parity. Key structural finding, and the reason this is fixes-not-rewrite:

- **Export and preview share the SAME pure `resolveFrame(comp, frame, ctx)` and the SAME `renderFrameUnsafe`.** Export calls `renderer.renderFrameAsync(data, 'offscreen')` -> `renderFrame` -> `renderFrameUnsafe`, differing from preview only by `target='offscreen'` and `presentLatest=false`. So track mattes (the just-shipped B10d composite), glow, shadow, layer blur, motion-blur shutter/phase, precomps, cloners, fields, motion paths, frame-blend/time-remap, premultiplied color/alpha, and particle/physics/video determinism ALL already render identically in export. Confirmed by the parity audit.
- The frame loop is frame-pure and off-by-one-correct: renders comp indices `[0 .. durationFrames-1]`, exactly `durationFrames` frames, last frame included. `resolveFrame` is called with the real `{getComposition}` registry so precomps are NOT blank. mp4-muxer timestamps are correct microseconds. There are real anti-corruption guards (frame-count mismatch, empty-frame, sub-1KB blob, captured async encoder errors all throw loudly) plus a real pre-encode memory guard and a real determinate progress bar + working cancel.

So the trust problem is NOT "export is fake." It is a set of specific, rankable defects. The single export path is `ExportModal.tsx` -> `exporter.ts:exportToMp4` (+ `audioMixer.ts`, `exportMath.ts`, `exportMemory.ts`). MP4 / H.264 / AAC only. `ExportSettings` = `{width,height,frameRate,bitrate,codec,includeAudio}` (no range, no alpha, no format).

Line refs below come from the audits and MUST be re-verified against code before each fix (subagent output, point-in-time).

## Status

| Batch | Delivers | Status | Weight |
|-------|----------|--------|--------|
| EX1 | Video layers export correctly: offscreen `videoTextureCache` device init (black/error blocker) + no stale proxy + frame-blend B-frame | ✅ (browser-verify-pending) | medium |
| EX2 | Timing + geometry honesty: fps resample (preserve duration/speed) + aspect-fit letterbox (no stretch) | ▶ **next** | medium |
| EX3 | Audio actually reaches the file: reload/import hasAudio-race fix + AAC-unsupported warn + precomp audio + decode-fail warn + persisted "no audio" notice | ⬜ | medium |
| EX4 | Preview parity: pass `getStyle` (linked styles) + comp-level motion-blur honor + font-ready await + solo/limiter parity | ⬜ | light |
| EX5 | Expressions deterministic in export: synchronous per-frame evaluation (no stale worker cache) | ⬜ (browser) | **heavy** |
| EX6 | Export range: work-area / in-out sub-range (settings + UI + frame loop + audio anchor) | ⬜ | medium |
| EX7 | Robustness + polish: chunked long-comp audio, AAC priming edit-list, color-space tag, filename/normalize, cancel-race, hw-accel hints | ⬜ | light |
| EX-future | Alpha export (WebM/VP9 or ProRes path), image-sequence/PNG + GIF export, animated pitch, video timeRemap audio | ⏸ deferred | **heavy** |

---

## EX1 - Video layers export correctly (the #1 trust blocker) - DONE (browser-verify-pending)

**Why first:** for a video editor, the most common comp contains a video layer, and today that path is the most broken end of export.

**Shipped (2026-09-25):** all three fixes below. The `videoTextureCache` is now a `class` (exported); the SCREEN renderer keeps the shared module singleton, and `initializeOffscreen` gives the EXPORT renderer its OWN `VideoTextureCache` instance bound to its OWN device (`renderer.ts`: new `private videoTex` field, all 10 render-path call sites use `this.videoTex`). This fixes the device mismatch AND a second latent bug found mid-fix: `destroy()` (run by the exporter's `finally`) called `videoTextureCache.destroyAll()` on the singleton, so EVERY export wiped the live preview cache too; the export renderer now tears down only its own instance. The exporter clears the shared scheduler once before the loop (`releaseBufferedFrames`) so preview proxy frames aren't baked in, and pre-decodes the frame-blend B frame via a new pure `collectExportVideoDecodes` (deduped, B only when `blendMix` truthy - matches the renderer's flow-warp gate). Pure selector harnessed in `verify:export-math` (now 10 checks). **Browser-verify-pending:** the GPU device binding + actual video pixels need a founder export of a video comp (not black, full-res, frame-blend present). Fully gated: `tsc` 0 / `lint` 125 / `build` / 108 harnesses / em-dash clean.

**Delivers / findings (codec audit, ranked #1/#4/#5):**
1. **`videoTextureCache` cross-device singleton -> black video OR hard export error.** `videoTextureCache` is a module singleton whose GPU device is set ONLY in `renderer.initialize()` (the screen path, ~`renderer.ts:3014`). Export builds a fresh renderer + its own offscreen device (`exporter.ts:74-75` -> `initializeOffscreen`, ~`renderer.ts:3075-3093`) and never calls `videoTextureCache.init(offscreenDevice)`. Video compositing still routes through the singleton (upload ~`renderer.ts:4106/4113/4130`, `getTexture` ~`4135`) and builds the bind group on the export device (~`4169`). Outcome: either (a) no preview ever ran -> `uploadFrame` early-returns -> `getTexture` null -> video layer skipped -> BLACK, or (b) preview ran -> textures live on the preview device -> cross-device `createBindGroup` THROWS -> export fails. Image/text/precomp use per-renderer caches so they are fine; this is video-specific. **Fix:** init the cache for the offscreen device in `initializeOffscreen` (and restore/teardown correctly so a later preview still works), or make the cache per-renderer. Confirm the singleton's lifecycle before choosing.
2. **Frame-blend / optical-flow B-frame not pre-decoded (`exporter.ts:151`).** The pre-decode loop only decodes `layer.video.sourceFrame`, never `sourceFrameB` (used by frame-blend/retime, `interpolation.ts:703,717`). Renderer reads B via `frameScheduler.getFrame(assetId, sourceFrameB)` and falls back to crisp frameA on null, so frame-blended clips export WITHOUT the blend. **Fix:** also pre-decode + inject `sourceFrameB` when present.
3. **Stale low-res proxy frames baked into export (`exporter.ts:153`).** Export skips re-decode when a frame is already buffered, and never clears the process-wide `frameScheduler` at export start. Proxy (half-res) frames left by preview scrubbing of >1080p assets get composited full size (soft output). **Fix:** clear/segregate the scheduler for export, or always `decodeFrameForExport` (full res) regardless of buffered.

**Files:** `src/engine/renderer.ts` (initializeOffscreen), `src/engine/video/videoTextureCache.ts`, `src/codec/exporter.ts` (pre-decode loop), `src/engine/video/videoDecoderPool.ts`.

**Verification:** mostly GPU/WebCodecs wiring, so browser-gated to VERIFY (founder exports a comp with a video: not black, full-res, frame-blend present). Harness what is pure: if the pre-decode selection is extracted (which source indices to decode per resolved frame, incl. B), a `verify:export-video-frames` can assert the index set. Gates green regardless.

## EX2 - Timing + geometry honesty (stop the two silent "wrong file" lies)

**Delivers / findings (codec #2/#3, UI #1/#2):**
1. **FPS control silently rescales speed + duration.** Loop renders exactly `durationFrames` comp frames (`exporter.ts:47,142`) but stamps them at the user-selected `frameRate` (`frameTimestampUs(frame, frameRate)`), and audio mixes at the same export fps. No resampling. A 30fps/150-frame (5s) comp exported at 60fps becomes 2.5s at 2x speed (audio matches the wrong duration). **Fix (preferred):** resample - preserve real duration `durationFrames/compFps` seconds; output `round(durationSec*exportFps)` frames; for output frame `o`, render comp frame `round((o/exportFps)*compFps)` (clamped). Audio mix stays in real seconds. **Fallback if risky:** lock the export-fps control to comp fps (remove the lie). Pure core `planExportTimeline(durationFrames, compFps, exportFps)` -> harnessed.
2. **Aspect-ratio stretch, no letterbox/crop/warning.** Offscreen canvas is export dims; `resolveFrame` normalizes geometry against COMP dims (`interpolation.ts:1849-1850`); NDC always fills the whole export canvas -> non-uniform stretch when export aspect != comp aspect (all UI presets are 16:9). **Fix:** default to aspect-FIT (letterbox/pillarbox) - render the comp-aspect image into a centered sub-rect of the export canvas, bars cleared to black; expose Fit/Fill/Stretch later. Pure core `computeExportViewport(compW, compH, exportW, exportH, mode)` -> harnessed; renderer viewport wiring browser-gated.

**Files:** `src/codec/exportMath.ts` (pure timeline + viewport), `src/codec/exporter.ts` (loop + timestamps), `src/codec/audioMixer.ts` (duration), `src/engine/renderer.ts` (offscreen viewport rect), `src/ui/panels/ExportModal.tsx` (fps/aspect UX + warning).

**Verification:** `verify:export-timing` (frame count + comp-frame mapping across up/down/equal fps, duration preserved) and `verify:export-fit` (viewport rect math, all aspect combos). Renderer viewport = browser-gated.

## EX3 - Audio actually reaches the file (the silent-export cluster)

**Delivers / findings (audio audit, ranked #1/#2/#4 + UI #3):**
1. **Video audio silently dropped after project reload / import race (HIGH, common flow).** `compositionHasAudio` gates a video layer's audio on `getMetadata(assetId)?.hasAudio`, but on reload `initVideoAssetFromBlob` sets `hasAudio:false` and defers `extractVideoAudio` to a lazy waveform trigger. Export before the strip mounts -> `hasAudio=false` -> `includeAudio:false` -> mixing skipped -> SILENT file, no warning. Same race on fresh import (queued `_audioExtractChain`). The mixer would have decoded fine via `ensureAudioBuffer` had it been asked. **Fix:** stop gating export audio on the racy flag - detect audio from the actual asset (or force-resolve audio buffers for all video layers before export), and/or await extraction.
2. **AAC-unsupported browser drops audio with NO warning.** `encodeToAac` RETURNS null (not throws) when `AudioEncoder`/`AudioData` missing or `isConfigSupported` false; the null lands on the non-throwing path so `audioDropped` stays false and the completion message is the normal success. **Fix:** treat null as a dropped-audio signal (set `audioDropped`), surface it.
3. **"Exported without audio" notice discarded on completion (UI #3).** The video-only fallback message is only a transient progress string; the completion screen never renders `progress.message`. **Fix:** persist `audioDropped` into the export result and show a clear banner on the completion screen.
4. **Precomp audio never mixed.** `collectSources` matches only `'audio'`/`'video'`; no precomp recursion into `getComposition`. Precomp sound is missing while its picture renders. `compositionHasAudio` ignores precomps too. **Fix:** recurse precomp audio (time-remapped by inPoint/fps/stretch, mirroring the resolve remap) in both `collectSources` and `compositionHasAudio`.
5. **decodeAudioData codec gap (MKV/AVI/MOV): video audio silently dropped while picture exports.** Both extract paths swallow the failure and return null. **Fix:** when a video layer has picture but audio decode failed, mark it and warn (proper WebCodecs audio decode is EX-future).

**Files:** `src/codec/audioMixer.ts`, `src/codec/exporter.ts`, `src/engine/media/assetManager.ts` (hasAudio/ensure), `src/ui/panels/ExportModal.tsx` (audio-detect + completion banner), `src/core/precomp.ts` (audio remap helper if needed).

**Verification:** `verify:export-audio` (precomp-audio source collection + time remap; audioDropped signal logic; hasAudio detection independent of the lazy flag). AAC-encode + real decode = browser-gated.

## EX4 - Preview parity (what you see is what you get)

**Delivers / findings (parity #1/#3/#4, audio #5/#6):**
1. **Linked/shared styles (M21) dropped in export (HIGH, one-line).** Export omits `getStyle` in its ResolveContext (`exporter.ts:146`) while preview passes it (`Viewport.tsx:179`); `resolveStyleColor` falls back to the raw stored color. Any style-linked shape/text fill or stroke is wrong in the file. **Fix:** pass `getStyle` into the export ctx. **Also fix the both-paths bug:** the nested-precomp recursion drops `getStyle` (`interpolation.ts:1593`) so linked styles inside precomps are wrong in preview too - thread it through the recursion.
2. **Motion blur re-enabled / wrong quality in export.** Export hardcodes `EXPORT_MOTION_BLUR_SAMPLES=16` and ignores the preview `globalMotionBlur` state + quality tier. If the user authored motion blur OFF it still appears in the file. **Fix:** export honors the COMPOSITION-level motion-blur enable + `motionBlurSamples` (fallback 16), not the preview perf toggle. Separate authoring intent (comp) from preview-perf (viewport).
3. **Unguarded font race.** No `document.fonts.ready` / `loadBundledFonts` await before export; export never repaints on late font load (preview does). Early frames can bake the fallback face. **Fix:** await font readiness (bundled + any comp custom fonts) before the frame loop.
4. **Solo + limiter audio parity.** Export applies solo (non-soloed tracks muted) but preview does not; export inserts a master limiter/compressor that preview lacks -> different track set and different levels. **Fix:** make preview honor solo (correct behavior) and reconcile the master chain (either add the same limiter to preview or gate it) so exported audio matches what was heard.

**Files:** `src/codec/exporter.ts`, `src/core/interpolation.ts` (precomp getStyle), `src/store/preview.ts` / `src/ui/panels/Viewport.tsx` (motion-blur source), `src/engine/media/audioPlayback.ts` + `src/engine/audio/audioTransport.ts` (solo + limiter), font loader.

**Verification:** getStyle threading provable in `resolveFrame` harness (extend an existing one). Motion-blur source + font await + audio parity = browser-gated eyeball.

## EX5 - Expressions deterministic in export

**Finding (parity #2, HIGH):** `expressionManager.evaluate` returns the SYNCHRONOUS cached value and dispatches real evaluation to a Web Worker fire-and-forget; `tryExpression` falls back to the keyframed value on a null cache. The export loop renders each frame once and never waits for the worker, so expression-driven properties (position/scale/opacity/...) export with a stale/lagged/keyframed-only value that varies run-to-run and differs from a settled preview frame.

**Fix (design):** give export a synchronous, deterministic expression path - either evaluate expressions inline on the main thread for export (sandboxed, no worker), or drive the worker synchronously per frame (await each frame's evaluation before render, pre-warm the cache). Must stay frame-pure (same frame -> same value). This is heavier and risk-bearing (touches the sandbox/worker boundary), hence its own batch. Browser-gated to fully verify; the pure evaluator can be harnessed if extracted.

**Files:** `src/expressions/manager.ts`, `src/codec/exporter.ts`, possibly a synchronous expression evaluator module.

## EX6 - Export range (work area / in-out)

**Finding (all audits):** no sub-range export exists; `ExportSettings` has no range field and there is no work-area concept in the store. Always whole comp from frame 0. Long comps cannot be partially exported (and the memory guard may block what a range would make feasible).

**Delivers:** add `rangeStart`/`rangeEnd` (comp frames) to `ExportSettings`; UI to set it (default whole comp; optionally seed from a timeline work-area if one is added); honor it in the frame loop (`[rangeStart..rangeEnd]`, inclusive-correct) and shift the audio anchor to `rangeStart`. Pure range math harnessed.

**Files:** `src/codec/exporter.ts`, `src/codec/exportMath.ts`, `src/codec/audioMixer.ts` (anchor), `src/ui/panels/ExportModal.tsx`.

**Verification:** `verify:export-range` (inclusive endpoints, frame count, audio anchor offset).

## EX7 - Robustness + polish

- **Long-comp audio OOM:** `OfflineAudioContext(length = ceil(sec*48000))` allocates one monolithic buffer (10min ~= 230MB) and can throw; add a chunked/segmented render fallback.
- **AAC priming not edit-list compensated:** ~21-44ms constant leading offset; add an edit list / trim priming samples.
- **No encoder color-space tag** (possible minor color shift); set it.
- **Filename uses raw requested dims** not the even-normalized ones; use actual output dims.
- **`handleCancel` optimistic `exporting=false`** UI race; resolve on real unwind.
- **Encoder hints:** consider `latencyMode:'quality'` / `hardwareAcceleration` preference; backpressure `setTimeout(1ms)` -> cleaner drain.

## EX-future (deferred, heavier / separate infra)

- **Alpha export** - impossible in MP4/H.264; needs a WebM/VP9-alpha or ProRes-4444 path (new container + codec + `clearAlpha=0` for export). High value for overlays.
- **Image-sequence (PNG) + GIF export** - new delivery paths.
- **Animated pitch** in audio (currently constant-per-clip in both paths).
- **Video timeRemap/reverse/freeze audio** - audio ignores the picture's time remap -> A/V desync on speed-ramped clips (also a preview limitation).
- **WebCodecs audio DECODE** for containers `decodeAudioData` rejects (removes the codec-parity gap in EX3.5 properly).
