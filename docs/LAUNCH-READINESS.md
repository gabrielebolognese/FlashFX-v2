# FlashFX — Launch-Readiness Audit & Remediation Plan

**Date:** 2026-07-22 · **Method:** 18-finder multi-agent sweep → adversarial verification → synthesis (81 agents, 63 findings, **0 refuted**).
**Verdict: NOT launch-ready.** Three classes of showstopper will burn real users on day one:

1. **Persistence is fundamentally broken** — project load silently deletes whole layer categories and every effect/binding; autosave is a dead no-op; Ctrl+S saves nothing; New/Open/Close discard unsaved work. Ordinary editing → reload/tab-close = permanent data loss, *even when the user thinks they saved*.
2. **Export — the product's entire purpose — is untrustworthy** — precomps come out fully blank in the MP4; long exports OOM-crash the tab from unbounded VideoFrame accumulation.
3. **A live Google service-account private key is committed to git** — credential-compromise gate; must be rotated before any push.

The good news: most top blockers are small, surgical fixes. A focused burn-down is realistic. **Nothing in the Blockers section can ship as-is.**

---

## ⚡ Immediate burn-down (11 quick wins — do these first)

These are mostly one-liners that close the biggest holes:

1. **Bind Ctrl+S → `saveCurrentProject()`** (with `preventDefault`) in `src/App.tsx` keydown handler — closes the single biggest reflexive data-loss hole.
2. **Point `useAutoSave` at `saveCurrentProject()`**; delete the dead localStorage write (`useAutoSave.ts:14-16`) — turns autosave from a no-op into real persistence.
3. **Thread the composition registry into export:** `resolveFrame(composition, frame, { getComposition })` (`exporter.ts:124`, `ExportModal.tsx:63`) — un-blanks every precomp in the MP4.
4. **`this.enforceMemoryBudget()` at end of `injectFrame`** (`frameScheduler.ts:176`) — one line prevents the multi-GB export OOM/decoder-stall crash.
5. **Send-Backward off-by-one:** `idx+2` → `idx+1` (`Toolbar.tsx:217`, `menuDefinitions.ts:316`).
6. **Bezier zero handles:** replace `||` with `??` (`interpolation.ts:184-187`) — removes silent curve distortion.
7. **Wire video audio into the shared context:** `videoAudioPlayer.setAudioContext(this.context, this.masterGain)` in `audioPlaybackEngine.ensureContext` — fixes silent-on-load video audio + dead VU meters.
8. **`respawnWorker`: reject remaining in-flight requests before `inFlight.clear()`** (`videoDecoderPool.ts:262`) — ends permanent black frames after a decode-error burst.
9. **Preserve fields on load:** spread `shadow/glow/blur/effects` into `baseFields` and the binding fields into `validateComposition` (`validation.ts`) — stops per-load data loss.
10. **Gray out the 18 unbacked filters** via an `implemented:false` flag (drop from the "active" count) — stops the largest facade signaling success.
11. **Rotate the Google service-account key** and move it to `Deno.env` / a Supabase secret.

---

## ✅ Phase 1 — DONE (2026-07-31, uncommitted; typecheck 0 / build ✓ / harnesses 44·16·10 / no new lint)

All 12 blockers fixed in code. **One manual action remains: the Google key must still be ROTATED and PURGED FROM GIT HISTORY** (code no longer contains it, but old commits do — see B9).
- **B1** validation.ts: added pass-through cases for particle/animationItem/fieldSampled/hbox·vbox·grid/layoutContainer.
- **B2** validateComposition: preserves proceduralBindings/anchorEdges/physicsBindings/physicsWorld/staggerBindings.
- **B4** baseFields preserves shadow/glow/blur/effects; shape case preserves material/pattern fills.
- **B3** useAutoSave now calls `saveCurrentProject()` (real IndexedDB write); dead localStorage removed.
- **B8** Ctrl/Cmd+S bound to save in App.tsx (preventDefault).
- **B7** `closeProject` awaits `saveCurrentProject()` first (covers New/Open/Close + the back button).
- **B5** exporter threads `{ getComposition }` into resolveFrame — precomps now render in the MP4.
- **B6** frameScheduler.injectFrame evicts oldest frames over budget + new `releaseBufferedFrames()` called in every export exit — bounds export memory / prevents OOM.
- **B10** renderer clamps procedural tile/grid expansion to MAX_LAYERS (one-shot warn) — no more buffer-overflow black-out.
- **B11** video PCM no longer retained (waveform kept); `ensureAudioBuffer()` decodes on demand; load path serialized; audioMixer/audioProcessing/silence routed through it — fixes the open-project OOM.
- **B12** Drive stream URL carries the `apikey` query param — imports/previews no longer 401.
- **B9** service-account key moved out of source to `Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')`. **Still TODO (manual): rotate the key in Google Cloud, set the Supabase secret, purge the old key from git history.**

---

## Phase 1 — Launch blockers (must fix) — 12

### Security
- **B9 · [CRITICAL] Google service-account private key committed to git** — `supabase/functions/drive-assets/index.ts:10-41`
  A full RSA private key + service-account email (`drive.readonly`) is a source constant in a git-tracked file. Anyone with repo access obtains a working Google credential.
  **Fix:** Revoke/rotate immediately, load from `Deno.env`/Supabase function secret, purge from git history.

### Persistence / data loss
- **B1 · [CRITICAL] Project load silently deletes 5 layer categories** — `validation.ts:271-436 (default:return null)`
  `validateLayer` has no case for `particle / animationItem / fieldSampled / hbox|vbox|grid / layoutContainer`; all hit `default: return null` and are filtered out on every open. Work destroyed with no error.
  **Fix:** Add pass-through cases (as `cloner` at 419-432), or a permissive fallback preserving structurally-valid unknown types.
- **B2 · [CRITICAL] Composition-level bindings stripped on every load** — `validation.ts:509-518`
  `validateComposition` returns only `id/name/settings/layers/tracks/background/motionPaths/markers`, dropping `proceduralBindings / anchorEdges / physicsBindings / physicsWorld / staggerBindings`. Save preserves them; load discards them.
  **Fix:** Conditionally spread the surviving binding fields, mirroring how `markers` is preserved at 517.
- **B3 · [CRITICAL] Autosave is a no-op** — `useAutoSave.ts:14-16`
  Writes `localStorage['ffx-project-<id>']` (never read; real persistence is IndexedDB) and only the active-comp mirror, not the SceneDocument. Trusting autosave → lose everything on crash/close.
  **Fix:** Call `saveCurrentProject()` on debounce; delete the localStorage write.
- **B4 · [HIGH] shadow/glow/blur/effects/shape-material stripped from every layer on load** — `validation.ts:252-276`
  `baseFields` omits `shadow/glow/blur/effects`; shape case drops `materialConfig/strokeMaterialConfig/patternFill`. The one-click Toolbar `applyEffect(...)` is mainstream, so any shadowed/glowing/blurred layer renders flat after reload.
  **Fix:** Add those to `baseFields` (+ `effects` for image) and preserve the shape-material fields.
- **B7 · [HIGH] New / Open… / Close discard unsaved work with no prompt** — `Toolbar.tsx:246-248,267-279`; `useProjectStore.ts:94-104`
  All five controls call `handleNewProject → closeProject()` with no save/prompt. "Open…" is also mislabeled (no picker; identical to New/Close).
  **Fix:** `await saveCurrentProject()` (or prompt) before leaving; give "Open…" a real picker or remove it.
- **B8 · [HIGH] Ctrl+S unbound (opens browser Save-Page); shortcuts don't fire; Group/Ungroup mislabeled** — `App.tsx:44-157`
  The global keydown handler binds none of the advertised Ctrl+S/E/A/N, zoom, F11. Ctrl+S isn't even `preventDefault`'d. Group/Ungroup show Ctrl+G but are bound to Alt+G.
  **Fix:** Bind Ctrl+S→save, Ctrl+E→export (with preventDefault); correct/drop wrong shortcut hints.

### Export
- **B5 · [CRITICAL] Precomp layers export completely blank** — `exporter.ts:124`; `ExportModal.tsx:63`; `interpolation.ts:1148-1156`
  Export calls `resolveFrame(composition, frame)` with no `ResolveContext`, so precomps resolve `renderFrame:null` and draw nothing. Preview threads it (`Viewport.tsx:158`) — so precomps look right on screen, transparent in the MP4.
  **Fix:** Pass `{ getComposition, depth:0, visited:new Set() }`.
- **B6 · [CRITICAL] Export accumulates VideoFrames with no budget → decoder stall / OOM** — `frameScheduler.ts:162-176`; `exporter.ts:128-143`
  Export injects every source frame into the singleton scheduler, never evicts/closes; `injectFrame` never calls `enforceMemoryBudget` (only playback prefetch does). A 30-60s 1080p export retains thousands of ~8MB frames (multi-GB), stalls the decoder, OOM-crashes the tab, and leaks into the shared singleton afterward.
  **Fix:** `enforceMemoryBudget()` in `injectFrame` (or close each frame after use); `frameScheduler.destroy()/unregisterAsset` in export cleanup.

### Rendering / import stability
- **B10 · [HIGH] Procedural tile/grid loops > 512 instances overflow uniform buffers → black + error flood** — `renderer.ts:734,3300-3373`
  Per-layer buffers are sized for `MAX_LAYERS=512`, but `tileScroll/gridArray` expand one layer into `cols*rows` with no clamp (a 10px tile on 1080p = >21,000). `writeBuffer`/`setBindGroup` past the buffer are WebGPU validation errors → the tiled layer goes black.
  **Fix:** Clamp each bucket to `MAX_LAYERS` before `writeBuffer`; cap procedural instance counts at expansion time.
- **B11 · [HIGH] Entire audio track eagerly decoded + full PCM retained on every import AND load → OOM** — `assetManager.ts:369-397,191,421`
  `extractVideoAudio` fully decodes+retains the whole audio PCM on every video import and on every restore during load (all in parallel). A 1-hour stereo video = ~1.4GB retained float32 PCM that playback never uses (video audio plays via a hidden `<video>`).
  **Fix:** Decode audio lazily on first real need (waveform/silence/captions/export); don't full-decode every video on load; free `audioBuffer` under pressure.
- **B12 · [HIGH] Drive stream endpoint fetched without anon-key auth → all Drive imports likely 401** — `driveService.ts:58-63`; `LibraryTab.tsx:372-373`
  `getDriveStreamUrl` returns a bare function URL with no Authorization header; `stream` is the only action that moves bytes. Unless deployed `verify_jwt=false` (no `config.toml` in repo), the gateway 401s every import/preview. Listing/search work → library looks alive but nothing imports.
  **Fix:** Send the anon key on stream requests, or confirm+lock `verify_jwt=false` in the deploy.

---

## Phase 2 — Broken / facade features (fix or honestly hide) — 26

**Facades that signal success while doing nothing** (highest credibility risk):
- **[HIGH] 18 image filters are inert** (chromaKey, liquify, tiltShift, canny, datamosh, pixelSorting, ghosting, echo, trails, smear, frameDelay, meshWarp, displacementMap, histogramEq, autoLevels, autoContrast, autoWhiteBalance, lutLoader) — slider drags, turns "active", value only in local state, renders nothing. LUT `.cube` Load button has no onClick. `ImageFiltersPanel.tsx:53-54,89,256`. **Fix:** flag `implemented:false` (disable + drop from active count) or remove.
- **[HIGH] Field-sampling feature unreachable** — its Inspector tab is hardcoded `show:false`, so field type/glyph/sampler/colors can never be edited. `Inspector.tsx:93,97,100`. **Fix:** gate the tab on `layer.type==='fieldSampled'`.
- **[HIGH] Physics anchoring (spring/rope/magnetic) produces no dynamics** — source timeline filled with a constant → spring never moves; cache never invalidated → pinned to initial value forever. `anchoring/engine.ts:111-122`, `cache.ts`. **Fix:** evaluate source across all frames; include source-hash / bump cacheVersion.
- **[HIGH] Expressions are async in a worker but resolveFrame is synchronous** → stale/null, nondeterministic in preview and export. `expressions/manager.ts:127-155`. **Fix:** evaluate synchronously at resolve time, or pre-bake to keyframes.
- **[HIGH] Bezier easing renders a different curve than the graph editor shows** — runtime uses `(A.handleOut, A.handleIn)` instead of `(A.handleOut, B.handleIn)`; never reads `B.handleIn`. `interpolation.ts:181-189`. **Fix:** pass `nextKf` into `interpolateValue`; add a harness asserting graph == core.
- **[MEDIUM] Cloner layers crash the renderer** — resolved cloner has no `.shape`, falls into the shape bucket, `fillLayerData` dereferences `layer.shape!` → TypeError every frame → device-lost after 3 frames → canvas permanently blank. Not user-creatable, but `validation.ts` now *loads* cloners, so an imported/edited JSON with one bricks the renderer. `renderer.ts:3352-3364`. **Fix:** explicit `layerType==='cloner'` continue branch (or guard `fillLayerData`).

**Persistence-adjacent broken features:**
- **[HIGH] Brand Kit + Saved Assets store transient `blob:` URLs** — bytes never uploaded to storage; logos/assets dead after reload. `BrandsTab.tsx:79-97`, `SavedAssetsTab.tsx`. **Fix:** upload to Supabase Storage, store durable URL.
- **[HIGH] Relink/Replace Media hardwired to `importVideo`** — no-ops (throws into a voided promise) for every image/audio asset. `assetManager.ts:511`. **Fix:** branch on asset/file type.
- **[MEDIUM] Physics simulation missing after reload/in export until manually re-baked** — bake cache is a module singleton, not persisted, never rebaked on load. `physics/bake.ts:18`. **Fix:** rebake on load + before export.
- **[MEDIUM] Corrupt/evicted image & audio assets silently dropped, never marked "missing"** — no relink path (only videos register `missing`). `assetManager.ts:627,660`.

**Export correctness (beyond the blank-precomp blocker):**
- **[MEDIUM] Different-aspect resolution preset silently stretches the video** — shaders normalize against comp dims, not the render target. `exporter.ts:32-33`. **Fix:** filter presets to comp aspect / letterbox.
- **[MEDIUM] Audio inside precomps dropped from the export mix** — `audioMixer.ts` never recurses into sub-comps. **Fix:** recurse with the precomp time remap.

**Compositing / effects fidelity:**
- **[MEDIUM] Non-background layers ignore `Layer.blendMode`** — one src-over pipeline for everything. Nothing sets it in UI today, so it's a persisted facade waiting to mis-render. `renderer.ts:2705-2708`. **Fix:** per-blend-mode pipelines, or remove the property.
- **[MEDIUM] Effect stack silently capped at 16** — 17th+ filter shows "active", never renders. `renderer.ts:793`.
- **[MEDIUM] Blur category is a fidelity facade** — 12 named blurs collapse onto 4 algorithms; "Tilt Shift" does nothing. `wireEffects.ts:31-42`.

**Text:**
- **[MEDIUM] 3 of 10 fonts (Roboto/Montserrat/Poppins) never loaded** → silent system-sans fallback in preview + export. `index.css:1`.
- **[MEDIUM] Text cache locks in fallback font if rasterized before Inter loads** — no `fonts.ready` gate. `textAtlas.ts:24-25`.
- **[MEDIUM] Text V-Align (top/middle/bottom) is completely inert.** `interpolation.ts:461-480`.
- **[MEDIUM] "Fixed Width" text boxes clipped at a hardcoded 200px height.** `interpolation.ts:457-459`.

**Audio in preview:**
- **[MEDIUM] Video source audio uses a separate never-resumed AudioContext** — silent after load, invisible to VU meters. `videoAudioPlayer.ts:17`.
- **[MEDIUM] Scrubbing during playback desyncs audio** — `scrubTo` never re-schedules audio. `playback.ts:161-170`.
- **[MEDIUM] Video clip audio has no volume/fade** — only full-on or muted (no `volume` field on `VideoLayer.video`). `audioPlayback.ts:197-206`.

**Determinism / correctness:**
- **[MEDIUM] Particle sim not frame-pure** — RNG state not snapshotted; scrub path changes layout; preview ≠ export. `particles/engine.ts:162`.
- **[MEDIUM] Particles + field-sampling hardcoded to 30fps** — 2× too fast on 60fps comps. `particleRenderer.ts:4`.

**Menu correctness:**
- **[LOW] "Send Backward" moves two positions** (off-by-one). *(see quick win #5)*
- **[LOW] Orphan `ClipContextMenu` mounted but unreachable** — dead code; delete or wire.

---

## Phase 3 — Performance (video-focused) — 11

**Video decode / scheduler (scrub + memory):**
- **[MEDIUM] Scrubbing re-decodes the whole GOP per step** — worker caches only compressed bytes; sequential drag is O(GOP²), collapsing scrub to single-digit fps on 1080p. `videoWorker.ts:643-655`. **Fix:** worker-side LRU of decoded VideoFrames keyed by index; widen scrub window.
- **[MEDIUM] Error-burst respawn orphans in-flight promises → permanent black frames.** *(quick win #8)* `videoDecoderPool.ts:262`.
- **[MEDIUM] `decodeFrameForExport` permanently forces proxy=1 and desyncs scheduler proxy state** — clip scrubs full-res for the rest of the session after an export. `videoDecoderPool.ts:113`.

**Video import (perceived slowness):**
- **[MEDIUM] Full file written to IndexedDB twice per import, both awaited before the clip appears, no progress UI** — 1GB import writes ~2GB, clip missing for seconds. `assetManager.ts:132,153-195`. **Fix:** single store; add layer as soon as the moov parses; background the full write with progress.
- **[MEDIUM] Waveform generation is a synchronous full-PCM scan on the main thread** — ~28.8M iterations for a 10-min clip freezes the UI. `assetManager.ts:352-364`. **Fix:** Web Worker / chunk across frames.
- **[MEDIUM] Third full in-memory video copy at import via hidden `<video preload="auto">`** — eagerly buffers every file. `videoAudioPlayer.ts:22-57`. **Fix:** defer initAudio; `preload="metadata"`.

**Render / resolve / React hot path (playback smoothness):**
- **[MEDIUM] Entire timeline clip tree re-renders every played frame** just to move a 1px playhead. `TrackArea.tsx:183`. **Fix:** isolate the playhead into its own `currentFrame`-subscribed component; memoize per-track/clip subtrees.
- **[MEDIUM] `resolveFrame` is O(N²) in layers** — repeated linear `.find()` per layer per frame (~10k scans for a 100-layer comp). `interpolation.ts:376,889`. **Fix:** build one `Map<id,Layer>` at the top and pass it down.
- **[LOW] `resolveFrame` rebuilds sorted layers/track maps/layout offsets from scratch every frame.** `interpolation.ts:759-823`.
- **[LOW] Worker feed loop yields via `setTimeout(0)` + 250ms dequeue wait** — adds latency to each scrub decode. `videoWorker.ts:757-759`.
- **[LOW] `measureText` allocates a fresh OffscreenCanvas + 2D ctx per text layer per frame.** `textAtlas.ts:104-108`. **Fix:** module-level scratch canvas + measurement cache.

---

## Grayed UI to hide (honest, but permanently dead) — 3

- **PreviewControls: Draft 3D / Frame Blending / Shy Layers / Solo** — 4 dead toggles (`PreviewControls.tsx:77-136`). Hide until implemented (Solo/Shy are expected AE affordances).
- **LayoutPanel Advanced grid options** — "Coming soon" rows (`LayoutPanel.tsx:135-147`). Remove.
- **LayoutContainerPanel Advanced** — 6 locked "Future" rows (`LayoutContainerPanel.tsx:23-30`). Remove or gate behind a dev flag.

---

## Recommended sequencing

1. **Security now:** rotate + un-commit the Google key (B9). Blocks any push.
2. **Data-loss sprint (½–1 day):** quick wins #1, #2, #9 + B1, B2, B4, B7 — make save/load lossless and reflexive Ctrl+S real. This is the difference between "usable" and "destroys work".
3. **Export sprint (½ day):** quick wins #3, #4 + B5, B6 (+ B10/B11 stability). Makes the core deliverable trustworthy.
4. **De-facade (½ day):** hide the 18 filters, field-sampling tab, cloner guard, the 3 grayed panels — stop advertising non-working features.
5. **Correctness pass:** bezier curve, expressions, anchoring, audio-in-preview, text fonts/align.
6. **Performance pass:** the `Map<id,Layer>` resolveFrame fix + timeline playhead isolation + waveform-off-main-thread give the biggest felt wins; then decode/scrub caching.

**Blockers (Phase 1) gate launch. Phase 2 facades gate credibility. Phase 3 gates the "CapCut-level" feel.**
