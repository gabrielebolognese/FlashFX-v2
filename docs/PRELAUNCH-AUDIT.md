# Pre-Launch Go/No-Go Audit + Fixes

Final assessment before building new features, with deep dives into **field sampling**
and **video-playback performance** (three read-only audits: field-sampling end-to-end, an
adversarial review of the uncommitted Tier-1 perf fixes, and remaining video-perf gaps).

**Verdict: the previously-blocking issues are now fixed — good to build features on.**

**Verified:** typecheck 0 · `npm run build` passes · harnesses `verify:cloner` 44 ·
`verify:precomp` 16 · `verify:pathops` 10 · `verify:beats` 7 · `verify:scenes` 7 ·
`verify:waveform` 6 · `verify:resolve-cache` 5 · no new lint. All uncommitted.

## Fixed in this pass

**🔴 CRITICAL — shared-asset teardown (was a real, unknown blocker).** Splitting a clip
makes two layers share one `video.assetId`. `removeLayers` ([editor.ts](src/store/editor.ts))
tore down the asset's scheduler registration + audio ref per deleted layer with no check for
survivors, so deleting one twin froze the other's video and killed its audio (undo didn't
heal). **Fix:** guard asset-level teardown by a `survivingVideoAssetIds` set and dedupe per
asset within the batch; the per-layer texture teardown stays unconditional. `initAudio`
already refcounts, so releasing only on the last layer is consistent.

**🟠 HIGH — unbounded WebCodecs decoders.** One decoder per imported asset, uncapped, freed
only on asset removal → media-heavy sessions hit the browser's ~16-decoder ceiling → black
frames. **Fix:** an LRU cap in [videoDecoderPool.ts](src/engine/video/videoDecoderPool.ts)
(`MAX_ACTIVE_WORKERS = 8`): retain each asset's source, evict the least-recently-used worker
before spawning past the cap, and transparently re-init on the next decode via `ensureWorker`.
Bounds held hardware decoders regardless of how many clips are imported.

**🟡 Worker decoded-frame LRU was oversized (bug in my own Tier-1 code, caught by review).**
128MB held ~32 open frames at 1080p, which can exhaust the decoder's output-frame pool and
*stall* decoding. **Fix:** cap by frame **count** (`DECODED_CACHE_MAX_FRAMES = 8`, what the
pool actually limits) plus a 96MB byte guard.

**🟢 Field sampling — exposed and completed (per your call: don't hide it).** It was
*half-exposed*: a live toolbar button created a `fieldSampled` layer whose editing tab was
hardcoded `show:false` ([Inspector.tsx:93](src/ui/panels/Inspector.tsx)) — a leftover
dev-disable from when the (deleted) WGSL compute path was abandoned; the CPU renderer and
`FieldSamplingPanel` are complete and wired. **Fix:** show the Field tab for field layers, and
thread `frameRate` through `RenderFrame` so the field renderer stops hardcoding 30fps (fixes
noise/animation timing off-30fps). The field-driven **cloner** distribution works in-engine but
the whole cloner feature still has no UI — that's a separate future feature, unchanged.

## Remaining — acceptable v1 (documented; verify in browser when convenient)

- **"Create Proxy" over-promises** — it downscales *after* a full-res decode, so it doesn't cut
  4K decode cost. Reword the label/[types.ts:432](src/core/types.ts) or make it a real proxy later.
- **Per-asset hidden `<video>` for audio** — a second decoder per asset. Mitigated by browsers
  releasing paused-media decoders + the new WebCodecs cap; a proper fix (lazy element tied to
  timeline use, or `<audio>`/`decodeAudioData`) is a larger change.
- **Per-frame texture copy** (`copyExternalImageToTexture` vs zero-copy `importExternalTexture`)
  + per-frame bind-group/view recreation — GPU/thermal polish on multi-4K comps.
- **No adaptive quality under playback lag** — stale-frame-hold with audio continuing; standard
  NLE behavior.
- **Single-layer delete + undo doesn't re-register** the asset (smaller, pre-existing; the
  shared-asset case is now safe).

## Tier-1 review result

The adversarial review confirmed **5 of 6** Tier-1 fixes correct as written (structural cache,
physics-evaluator fix, timeline playhead isolation, serialized restore, waveform/FrameCounter) —
no leaks, use-after-close, stale-cache, or ordering bugs. The 6th (worker LRU) is fixed above.

**In-browser checks still recommended** (can't run WebGPU/WebCodecs here): decoder LRU under a
20-clip import (no black frames), split-then-delete keeps the survivor playing, backward-scrub
smoothness, and a field-sampled layer editing live via the Field tab.
