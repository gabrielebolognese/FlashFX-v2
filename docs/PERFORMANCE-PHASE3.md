# Phase 3 — Performance (video-focused)

The 11 perf issues from the launch audit, weighted to video playback + import.
Shipped the fixes that are **safe to make without runtime profiling** (pure logic,
proven by harnesses, or contained), and **deferred** the ones that touch critical
data paths or the highly-visible timeline where a blind change risks a regression
worse than the perf issue itself (no WebGPU/WebCodecs/audio runtime here).

**Verified:** typecheck 0 · `npm run build` passes · harnesses `verify:cloner` 44 ·
`verify:precomp` 16 · `verify:pathops` 10 · `verify:beats` 7 · `verify:scenes` 7 ·
**`verify:waveform` 6** · no new lint. All uncommitted.

## ✅ Fixed (5)

| Issue | Fix | Why it matters |
|---|---|---|
| **`resolveFrame` O(N²) in layers** | Module-level `_layerById` map built once per frame; parenting / group-visibility / layout-child / cloner-source helpers do O(1) map hits instead of linear `.find()`. Saved/restored around the precomp recursion like the layout maps. | The single biggest per-frame CPU cost — hit on **every** preview *and* export frame. ~10k scans/frame for a 100-layer comp → O(N). |
| **`measureText` allocates a canvas per text layer per frame** | Reuse one module-level scratch `OffscreenCanvas`/2D context across `measureText`/`getTextLayout`/`measureStringWidth`. | Per-frame allocation churn during playback of text-heavy comps. |
| **Error-burst respawn orphans in-flight decodes → permanent black frames** | `respawnWorker` now rejects each in-flight request before `inFlight.clear()`, so awaiters fail fast (and can retry) instead of hanging forever. | A decode-error burst no longer bricks a clip for the session. |
| **`decodeFrameForExport` permanently forces proxy=1** | Track `proxyScale` on the worker state; export forces full-res for its decode then **restores** the scrub proxy in a `finally` (no-op when proxy is off). | Clip no longer scrubs full-res for the rest of the session after one export. |
| **Waveform gen is a synchronous full-PCM main-thread scan** | New pure `core/waveform.ts` `computeWaveformPeaks` with a **strided** min/max (capped reads per bucket) → visually identical envelope for ~50× fewer reads on long clips. `verify:waveform` proves the bucket math + that striding preserves the ±envelope. | A 10-min clip import no longer freezes the UI on the ~28.8M-iteration scan. |

## ⏸ Deferred — real fixes, but unsafe to make blind here

Each needs runtime profiling / a running browser to verify, and a wrong guess is
worse than the perf issue:

- **Double IndexedDB write per video import** (`assetManager.ts`) — the blob is written to both the generic `assets` store *and* `videoAssetStore`, and the two restore paths read from **different** stores (`loadProject` uses `asset.blob`; `restoreProjectVideoAssets` uses `videoAssetStore`). Dropping either write means rewriting how videos reload — untestable here, and a mistake = videos silently fail to reload. **Needs runtime verification.**
- **Timeline clip tree re-renders every played frame** (`TrackArea.tsx`) — `TrackArea` subscribes to `currentFrame` and re-renders its inline clip chips just to move the playhead. Isolating it means extracting the playhead (two render modes — ruler marker + track line — across two instances, tangled with the follow-playhead auto-scroll effect) or memoizing the inline clip subtree (exact-dep risk). A blind change to the 1500-line component risks a **highly visible** playhead/scrub regression. `TimelinePanel`/`TrackRow` do *not* re-render per frame, so the row headers are already fine.
- **GOP scrub re-decodes per step** (`videoWorker.ts`) — a worker-side LRU of *decoded* `VideoFrame`s is the right fix, but `VideoFrame` lifecycle (who `.close()`s an evicted/returned frame) is easy to get wrong and impossible to verify without a decoder. **Highest-risk item.**
- **(LOW) `resolveFrame` rebuilds sorted-layers/track maps each frame; worker feed-loop `setTimeout(0)`+250ms latency** — marginal; cross-frame caching invalidation isn't worth the risk.

**Recommendation:** the deferred four are worth doing next in a session where the app
can be run and profiled (Chromium/WebGPU) — verify a large-comp scrub, an export,
and a project reload after each.
