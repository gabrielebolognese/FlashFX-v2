# Video Performance — Deep Audit + Tier 1 Fixes

A three-part read-only audit of the video pipeline (decode/scheduler/scrub, playback
clock/texture/render, import/persistence/audio) found **~23 issues**. Verdict: the
pipeline was **not good as-is**. This is the **Tier 1** subset — the six highest-impact
fixes for playback smoothness, scrub responsiveness, and open-time memory.

**Verified:** typecheck 0 · `npm run build` passes · harnesses `verify:cloner` 44 ·
`verify:precomp` 16 · `verify:pathops` 10 · `verify:beats` 7 · `verify:scenes` 7 ·
`verify:waveform` 6 · **`verify:resolve-cache` 5** · no new lint. All uncommitted.

> **Verification honesty:** only Fix 3 is fully provable here (harness). The React
> (1,2), decoder (4), and storage (5,6) fixes are correct-by-construction and
> typecheck/build-clean, but their runtime behavior needs a Chromium/WebGPU session —
> see the per-fix "verify in browser" notes.

## Fixes

**Fix 3 — structural cache in `resolveFrame` · HIGH · harness-proven.** Every frame
rebuilt pure-structural data (`sortedLayers` sort, `trackOrderMap`/`hiddenTrackIds`/
`soloTrackIds`, the id map) even though the composition ref is stable during playback.
New `getStructuralCache(layers, tracks)` — a `WeakMap<Layer[]>` validated on the tracks
ref (a track-only edit keeps the same layers array but must invalidate) — collapses that
to a map hit; the layout-offset passes are skipped when no layout layers exist.
`verify:resolve-cache` proves parenting resolves through the cache, repeated resolves are
identical, track-only edits invalidate it (visibility + solo), and distinct comps don't
share a cache entry. **Also fixed a latent Phase-3 regression:** `buildPhysicsEvaluator`'s
closure calls `worldTransformAt`→`getParentTransform` outside `resolveFrame`, where the
module-level `_layerById` was stale — it now sets the map from its own composition.

**Fix 1 — isolate the timeline playhead · HIGH.** `TrackArea` subscribed to `currentFrame`
at the component top, re-rendering the whole clip tree every played frame just to move the
1px playhead. Extracted `<TimelinePlayhead variant>` (ruler marker + track line) and
`<FollowPlayheadDriver>` (auto-scroll) as leaves that own the `currentFrame` subscription;
`TrackArea` no longer subscribes to it, and `sortedTracks` is memoized. *Verify in browser:*
play a busy timeline (React Profiler shows the clip tree no longer re-renders per frame);
confirm follow-playhead auto-scroll still works.

**Fix 2 — isolate the Viewport frame counter · MED.** `Viewport` subscribed to
`currentFrame` only for the status bar, re-rendering itself + 9 overlays every frame. A
`<FrameCounter>` leaf now owns that subscription. *Verify in browser:* overlays don't
reconcile per frame.

**Fix 4 — worker-side decoded-frame LRU · HIGH.** Frames decoded to reach a scrub target
were closed and discarded, so backward/random scrub reseeked to the keyframe and re-decoded
the whole GOP per step (O(GOP²)). The worker now caches decoded frames keyed by **exact
`frame.timestamp`** (so a stale/mismatched key simply misses — never a wrong frame),
byte-bounded to 128 MB (safe across resolutions). Lifecycle is safe by construction: it
caches ownerless intermediates or `clone()`s of delivered frames (never the transferred
original), and closes on eviction + `reset()`/`onError()` (reseeks use `flushSession`, which
leaves the cache intact). *Verify in browser:* backward-drag a long-GOP 1080p/4K clip should
now feel like forward-drag; watch worker memory stays bounded (no leak).

**Fix 5 — conditional per-open video write · CRITICAL storage.** `loadProjectAssets`
re-wrote every video blob (up to GBs) to `videoAssetStore` on *every* project open. Now
guarded by a cheap `listProjectAssets` metadata check — backfills only the legacy/failed
case. *Verify in browser:* open a project twice → no redundant second write.

**Fix 6 — serialize project-open restore · HIGH.** The live restore ran `Promise.all`
(parallel), each transiently decoding a full audio track → N× memory spike / open-time OOM.
Now a sequential loop, and `extractVideoAudio` is awaited inside the restore init (it
swallows its own errors, so it can't fail the video). *Verify in browser:* open a
multi-video project → bounded peak memory, all videos restore.

## Deferred (Tier 2 / Tier 3) — from the ~23 findings, best done with a profiler

Decoder/worker LRU **cap** (unbounded decoders → big-project black frames/OOM);
thumbnail-vs-scrub decoder contention; non-blocking import + real progress; proxy
correctness (manual-proxy clobber, 0.25/0.5 scale split, strict-`>` 1080p threshold, and
that runtime "proxy" downscales *after* full-res decode so it doesn't cut decode cost);
incremental memory-budget accounting; zero-copy `importExternalTexture` upload; adaptive
quality-drop under sustained playback lag; wire up the built-but-unused import dedupe;
B-frame drain latency; misc churn (per-layer bind-group recreation, prefetch allocation,
seek lookahead cancellation). Also note: `restoreProjectVideoAssets` is dead code and the
generic `assets` store still double-stores video blobs at import — a full single-source
persistence refactor is a larger, runtime-verified job.
