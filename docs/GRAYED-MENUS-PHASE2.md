# Grayed Menus — Phase 2 (audit + build)

Follow-up to Phase 1 launch blockers. Full audit of every remaining grayed/facade
control (5 parallel capability audits), then **built the worth-it items** and
**honestly locked** what needs a new engine subsystem.

**Verified:** `npm run typecheck` = 0 · `npm run build` passes · harnesses
`verify:cloner` 44 · `verify:precomp` 16 · `verify:pathops` 10 · **`verify:beats` 7**
· **`verify:scenes` 7** · no new lint. All uncommitted.

> **Headline correction:** the "18 inert image filters" was mostly a myth — the
> Filters panel is **91% real (175/193 render)**. Only 18 were inert; after building
> `chromaKey`, **17 remain** and each needs a whole new engine subsystem (temporal
> frame-history buffers, a histogram-reduction pass, 3D-LUT binding, mesh/liquify
> tooling, a GPU sort). Those 17 are now **grey-locked** (Lock icon, no dead slider)
> rather than shown as working.

## ✅ Built (10)

| Feature | What shipped |
|---|---|
| **Solo** | `Track.solo` + resolver gate (`interpolation.ts`) + audio parity (`audioMixer.mutedTrackSet`) + per-track TrackRow button + PreviewControls toggle (acts on the selected layer's track) |
| **Follow Path Rotation** | Container child tangent `angle` (already computed, was discarded) now drives child rotation via `LayoutContainerLayer.followPathRotation` + a real toggle in LayoutContainerPanel |
| **Manage Effects** | `reorderLayerEffect` / `toggleLayerEffect` actions + an **Applied Effects** list (reorder/enable/remove) in the Filters tab; toolbar "Manage Effects…" reveals it |
| **crop-img** | Image asset → `cropImageAsset`: adds the image with a full-extent rectangle **crop mask** (reuses the mask system), reveals the Masks tab |
| **chromaKey** | Green-screen keyer (EFFECT_TYPE 163, WGSL case in `applyColorEffect`); slider = tolerance, key color in defaults. ⚠️ WGSL not runtime-testable here — needs one in-browser green-screen check |
| **add-fav** | Media-pool asset → reserved "Favorites" folder (find-or-create, `folderService`) |
| **move-folder** | Asset → "Move to Folder" submenu built from the live folder list (published through the `mediaPool` store) |
| **detect-beats / detect-bpm** | Pure `core/beatDetection.ts` (energy-flux onset + IOI-histogram tempo, **no FFT**) → beat markers (batched `addMarkersAtFrames`) + BPM readout. `verify:beats` proves ±2 BPM |
| **scene-detect** | Pure `core/sceneDetection.ts` (RGB-histogram TV-distance) + `engine/video/sceneDetect.ts` (frame decode) → Cut markers. `verify:scenes` proves cut logic |
| **audio-crossfade** | `crossfadeAudioClip` auto-finds an overlapping audio clip and writes an equal-gain volume-keyframe crossfade over the overlap |

*Folders (add-fav/move-folder) are cloud-gated — they no-op gracefully offline, matching the existing FolderBrowser.*

## 🔒 Locked / removed (dead controls)

Frame Blending & Shy (PreviewControls) · "Advanced Grid / Coming soon" (LayoutPanel)
· FUTURE_FEATURES badges (LayoutContainerPanel) · `new-compound` menu item · image/audio
`create-subclip` · the **17 inert filters** (grey-locked with a Lock icon + tooltip).

## ⏸ Deferred — worth building, genuinely heavy (documented, not wired)

- **audio-noise**, **detect-key** — need a JS FFT/STFT (none exists yet).
- **import-sequence** — a new image-sequence layer type.
- **Stroke to Path** — polygon offsetting/buffering (polygon-clipping is boolean-only).
- **Distort…** — its warp engine already ships via the Filters tab; a menu entry is redundant.
- **add-tag**, **new-smart-folder** — need new tag / saved-search schema.
- The 17 hard inert filters — the temporal-feedback family (echo/ghosting/trails) shares
  the most infra and is the highest-visibility future investment.

## ❌ Skipped — not client-side feasible

convert-shape (bitmap tracer) · gen-variations (in-browser diffusion) · motion-track (optical flow).
