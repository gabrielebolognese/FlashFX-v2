# Video Playback Rework — Audio-Master Clock (CapCut/Canva model)

Design of record for reworking FlashFX preview playback to the production browser-editor
model: **audio is the single master clock; video is a passive follower that shows the latest
decoded frame ≤ the clock and drops the rest, never blocking.** Grounded in a full
architecture map (7-agent workflow) + a completeness critique. **Decisions:** full Web Audio
master clock; shipped **behind a runtime toggle** (`audioMasterClock`, default off) for
in-browser A/B, since WebCodecs/WebAudio can't be verified in this environment.

## The bug this replaces
Video is drawn from WebCodecs on a `performance.now()` **wall clock**; audio is a slave
(a hidden `<video>` per asset, chase-synced within 80ms; audio *layers* free-run via
`start(0,…)`). Clocks are independent → drift; and the exact-index frame lookup (`getFrame`)
holds a stale texture when a frame is late → freeze. The frame-count cap (already shipped)
unstuck the decoder stall; this rework fixes the *architecture* so sync is correct and
presentation never stale-flashes.

## Target architecture
1. **`MasterClock`** — sole source of "current time." One always-running shared `AudioContext`
   (a muted `ConstantSourceNode` keeps `currentTime` advancing even with no audible layers);
   `performance.now()` only as an emergency fallback when the context is `suspended`/`closed`.
   - **Two readings** (critique #1): `nowForPicture = ctx.currentTime − anchorCtx − outputLatency`
     (what the speakers emit *now* — drives frame selection) and `nowForScheduling =
     ctx.currentTime − anchorCtx` (raw — for scheduling future audio nodes). `outputLatency`
     falls back to `baseLatency`/small const; re-read on `statechange` (Bluetooth mid-play).
   - `anchor(frame)` captures `(anchorFrame, anchorCtxTime)`; **re-anchor on** play, seek, loop
     wrap, and any `playbackRate` change (piecewise integration — critique #8).
2. **Time model** (critique #3): `_currentFrame` stays **integer** = `floor(masterClock.nowFrameFloat(fps))`
   and remains the ONLY value `engine.evaluate`/`resolveFrame`/store/`notify` see (composition +
   export stay integer-quantized; React `notify` stays integer/de-duped). A **separate continuous
   `sourceTimeFloat`** drives (a) audio scheduling and (b) frame *presentation* only.
3. **Frame presentation** (`framePresentation.ts`, pure): per **layer** target source-frame
   (`resolveVideoLayer`'s existing mapping) → `selectPresentFrame` = greatest buffered index
   **≤ target** within `maxDistance`; else **hold the layer's last-presented** (never jump to a
   far/future frame — no wrong-frame flash after a seek); else black. **Drop floor per asset =
   `min` presented index across ALL that asset's layer requirements** (critique #2) — a split
   clip's two layers keep their distinct frames. rAF is the present pump only.
4. **Unified audio graph** — one `masterGain → analyser → splitter → destination`. **Wire the
   dead `videoAudioPlayer.setAudioContext(ctx, masterGain)` seam** (highest-leverage, ~10 lines)
   so video-clip audio joins master gain + VU meters (fixes the silent-on-load / dead-meter bug).
5. **Audio-layer scheduling** — absolute times off the anchor via a **single pure
   `{when, offset, duration, rate}` function shared by preview AND `audioMixer` export**
   (critique #10 — preview/export must not diverge). Declick: ramp gain →0 over ~8ms before every
   `stop()` (pause/loop/seek/clip-end); ramp up on start (critique #5).
6. **Transport** — seek/scrub re-anchor + reschedule + flush stale ring near old playhead
   (critique #4); pause freezes the anchor; loop **pre-schedules** iteration N+1 audio *ahead*
   of the wrap (critique #9). AudioContext resumed on the **first global user gesture**, with an
   optimistic `performance.now()` start swapped to the audio clock once `running` (critique #6).

## Sequencing (build order)
- **Foundation (provable here, harness-gated):** `masterClockMath` · `framePresentation` ·
  `audioScheduleMath` — the pure timing/selection/scheduling cores. **← this pass.**
- **Wiring (behind the toggle, browser-verified):** MasterClock class + `tickRealtime` reads it;
  unified graph (`setAudioContext`); renderer uses `selectPresentFrame`; audio-layer absolute
  scheduling + declick; resume-on-gesture; seek/loop.
- **Adversarial review** (workflow) + the regression checklist below.

## v1 scope vs deferred
- **v1 (this rework):** audio-master clock (with output-latency comp), unified graph + meters,
  Web-Audio audio-layer scheduling shared with export, drop-pass video presentation, transport.
- **Deferred (scoped follow-up):** replacing the hidden `<video>` video-clip audio with decoded
  `AudioBuffer` scheduling. It needs a **streaming `AudioDecoder`** (whole-file decode is
  ~230MB/10-min clip — worse than `<video>`), so v1 keeps `<video>` chase-sync but under the
  master clock + master gain. Documented as the one remaining "not-fully-CapCut" piece.
- **Out of scope v1:** reverse playback audio (`AudioBufferSourceNode.playbackRate` can't be
  negative — mute audio during reverse; make selection direction-aware).

## Implementation status (what has landed)
Behind the toggle unless noted **[un-gated]**. Every runtime piece needs in-browser A/B — none is
runtime-testable here.
- **Provable cores (harness-gated, green):** `masterClockMath` (7) · `framePresentation` (7) ·
  `audioScheduleMath` (10). Full suite: 11 harnesses / 125 checks.
- **[un-gated] Unified audio graph** (`audioTransport`): one shared always-running `AudioContext` +
  `masterGain → analyser → splitter`; `audioPlayback` and `videoAudioPlayer` both attach to it, and
  the context is resumed on play. Independently fixes silent-on-load video audio + dead VU meters
  (the private-context-never-resumed bug). The `<video>` elements stay (v1) but now feed master gain.
- **MasterClock** class (audio-clock reading with output-latency comp + `perf.now` fallback +
  monotonic guard, anchored on ctx-time vs perf-time explicitly); `tickRealtime` reads it when the
  toggle is on, else the old wall clock. Toggle in `usePreviewStore` + `PreviewControls` button.
- **[un-gated] Preview audio scheduling** now uses the shared `computeSourceSchedule`. Identical to
  the old inline math when pitch == 0; **fixes a real bug when pitch ≠ 0** (old code advanced the
  resume buffer-offset UNSCALED by the clip's playback rate → wrong sample when you press play with
  the playhead parked mid-clip). **Export mixer left as-is** — it already bounds each clip with
  `stop(when + clipDuration)` (more precise than the duration arg), and the harness proves
  `computeSourceSchedule`'s export anchor reproduces its exact `when`/`offset`, so parity is proven
  without swapping export onto weaker scheduling.
- **[un-gated] Declick**: `stopSource`/`stopAllSources` funnel through `fadeAndStop` — an ~8ms gain
  ramp to 0, then `stop()`, with node teardown deferred to `onended` so the fade is actually heard.
  Each scheduled source ALSO gets a schedule-time `onended` that disconnects it at natural end
  (a source with a finite duration ends on its own — e.g. a 3s SFX on a 10s layer) so it can't leak
  on the master graph. *(This schedule-time handler was added after an adversarial review caught
  exactly that leak — `fadeAndStop` alone only tears down still-playing sources.)*
- **Presentation drop-pass** (toggle-gated): `frameScheduler.getPresentableFrame` wraps the proven
  `selectPresentFrame`; the renderer's video branch, when `presentLatest` is set (audio-master
  playback only — scrub/seek/export keep exact-frame), displays the newest decoded frame ≤ target
  and drops the rest. `presentLatest` is a per-`renderFrame()`-call scoped flag threaded from
  `playback.tickRealtime`; the renderer stays store-free.

### Deferred to a follow-up increment
- **Absolute look-ahead audio scheduling / loop pre-scheduling** (critique #9): the per-frame
  activation model schedules clips at entry, which is correct for playback; scheduling iteration N+1
  ahead of the loop wrap is a refinement, not landed. Preview clips still schedule at entry (with the
  now-correct rate-scaled offset).
- **Seek ring-flush** (critique #4): large-seek stale-ring flush not yet wired.
- **`<video>` → decoded `AudioBuffer`** migration (needs streaming `AudioDecoder`) — as in v1 scope.

## Browser A/B test guide (the only place this is verifiable)
The toggle is the **`AudioLines` button** in the PreviewControls bar (emerald when ON). Nothing here
runs in this environment — it must be exercised in a WebGPU Chromium session.

**First, the un-gated changes (must hold with the toggle OFF — the default — so they can ship regardless):**
1. *Video audio + meters:* load a project with a video clip that has sound → audio is audible on
   first play (was silent-on-load) and the VU meters move (were dead). This is the `audioTransport`
   unification.
2. *No clicks:* play, then pause mid-word; scrub across clip boundaries; loop a region → no click at
   pause / boundary / loop wrap (declick).
3. *No node leak:* put a short SFX (buffer shorter than the layer, e.g. 3s clip stretched to 10s) on
   a track; play past its end several times / pause-play repeatedly. In DevTools, the Web Audio graph
   (or a heap snapshot) must not accumulate `AudioBufferSourceNode`/`GainNode`s. *(This is the exact
   leak the review caught; the schedule-time `onended` fixes it.)*
4. *Pitch offset:* on an audio clip with a non-zero pitch, park the playhead in the MIDDLE of the clip
   and press play → it resumes at the correct sample (old code started at the wrong offset). At pitch 0,
   behavior is unchanged (harness-proven algebraic identity).
5. *Export unchanged:* export a comp with audio → identical mix to before (export mixer untouched).

**Then flip the toggle ON and A/B against OFF:**
6. *Sync:* a talking-head or music-driven clip stays lip/beat-synced through a full play; compare
   drift after ~60s vs OFF (OFF drifts, ON shouldn't).
7. *Smoothness under load:* a long-GOP 1080p/4K clip plays without freezing; on a decode hiccup the
   picture shows a slightly-behind frame and catches up rather than stalling (presentation drop-pass).
8. *Split clip:* one asset split into two layers with different trims → both show their correct frames
   in the same displayed frame (per-layer selection, not per-asset).
9. *Scrub/seek still exact:* while ON, scrub the playhead → each parked frame is the EXACT frame (drop
   pass is playback-only; scrub/seek pass `presentLatest=false`). Large seek keeps A/V locked.
10. *Loop wrap:* no double-render / audio gap / click at the wrap.

**Regression invariants** (should already hold, re-confirm): no-audio comp advances smoothly · paused
scrub repaints · playbackRate 0 guarded · frame-drop frees the decoder pool (doesn't fight the 12-open
cap) · export `injectFrame` path untouched by live selection/drop.

**Known gaps to expect** (documented above, not bugs): loop iteration audio isn't pre-scheduled ahead
of the wrap; large-seek stale-ring isn't flushed; video-clip audio still rides `<video>` chase-sync.

**Sources:** [webcodecsfundamentals playback pattern](https://webcodecsfundamentals.org/patterns/playback/) ·
[web.dev CapCut case study](https://web.dev/case-studies/capcut) ·
[web.dev audio output latency](https://web.dev/articles/audio-output-latency) ·
[Chrome WebCodecs best practices](https://developer.chrome.com/docs/web-platform/best-practices/webcodecs).
