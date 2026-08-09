# Devlog

## 2026-08-08

The biggest day so far: 40 commits, +9917/−362, ~253 file-changes. Six arcs — the last
Figma "time-saver" milestones (M17–M22), a self-driving tutorial, landing-page deep-links,
a 24-template animation library, a toggleable AI-chat mockup, a GPU procedural-pattern
engine, and the start of a 2.5D system (camera + 3D layers). typecheck stayed at 0 and lint
at the 127 baseline through every commit; anything with WebGPU/pointer behaviour is
structurally verified only (Node harnesses + guards), so it needs a browser to feel.

### Figma finishers (M17–M22, 6 commits)

- Convert a text layer to editable vector glyph paths (Outline Text, M17).
- Batch-rename a multi-selection with tokens + numbering + regex (M19, Ctrl+R).
- Freehand pencil/draw tool (M18, Shift+P).
- Rulers with ticks/labels + live snap-to-pixel (M20).
- Shared linked color styles — edit once, everything linked updates (M21). Shape/text
  fill+stroke read through the style before the material overlay.
- Outline stroke + holes-preserving compound booleans (M22).
  - Hard part: preserving holes through a boolean means tracking even-odd winding, not just
    unioning outer rings.

### Self-driving tutorial (Phases 1–5, 4 commits)

- A tutorial that builds a full title-card scene by driving the *real* editor store
  (chapters 1–10), with a UI spotlight overlay and a first-open CTA.
  - Hard part: it runs the actual store actions rather than a scripted fake, so each step
    has to tolerate real state and undo — a canned animation would drift from the editor.

### Landing-page deep-links (3 commits)

- Landing CTAs open the editor via `/?template=<id>`, seeding a fresh, editable, autoplaying
  project (first one: a tuned "magic" particle hero).
  - Hard part: the splash overlays the app while WebGPU warms and pre-rolls ~8 frames before
    playing, so the first (heaviest) frames happen behind it. And seeding has to wait until
    the async scene-load actually swaps the composition reference, or it lands on the wrong
    doc and gets overwritten.

### Animation-template library (9 commits)

- "Use this" inserts a real animation — graphics *plus* keyframes and interpolation — at the
  playhead, not just static shapes. 24+ templates: scenes (beach/forest/night), weather
  (sunset/rain/city/snow), creative (galaxy/phone-chat/pen/clock/fireworks/rocket/coffee/
  confetti/spinner), and four showcases — Chain Reaction (Rube Goldberg, 200 balls),
  Departure Board (split-flap flip-wave + parallax planes + rain matte), Bar Chart Race
  (baked reordering), Recursive Editor (FlashFX animating a video editor). Plus an "All"
  button that inserts every template back-to-back.
  - Number: verify:anim-templates, 132 checks.
  - Hard parts: templates are authored 0-based and rebased to the playhead (rescaled if the
    comp fps differs from the authoring fps). The Recursive Editor lives or dies on cursor
    believability — the cursor engine is a bezier arc + ballistic velocity + overshoot +
    dwell + sub-pixel noise + icon swaps. The bar-race reorder is *baked* because a live
    reorder needs a per-frame sort the keyframe model can't express.

### AI chat panel (mockup, 2 commits)

- Toggleable VS Code / Copilot-style side panel: occupies the right 20% and compresses the
  layout in every mode except preview. Borderless assistant responses with a thinking loader,
  streaming, and a response timer; composer mockup buttons (add file, from Drive, image, …).
  - Internal: a `streamResponse()` seam and canned reply now, so a real model drops in later
    with no UI change.

### GPU procedural-pattern engine (Phases 1 → 3, 6 commits)

- A new `generativePattern` layer: full-resolution fragment-shader patterns (waves, plasma,
  kaleidoscope, mosaic + 7 more = 11 types) with a palette editor. Bounded/movable/resizable/
  maskable like a rectangle, with keyframeable knobs (scale/rotation/warp/contrast) and
  blend-with-below.
  - Number: verify:pattern, 16 checks; blend-with-below is 4 GPU pipeline variants
    (normal/add/multiply/screen).
  - Hard parts: the config's type whitelist was hard-coded to the original 4 types, so every
    new type silently parsed back to plasma (caught by the harness: `'plasma' !== 'clouds'`).
    Blend can't read the scene texture progressively, so each mode is a separate pipeline
    whose fragment output form is matched to its blend state.

### Timeline layer-name column (2 commits)

- The layer-name column doubles in Edit mode, then sizes dynamically — grows to fit the
  busiest track up to a cap.
  - Number: clip counts computed O(N) via a Map, not per-track-per-render.

### 2.5D system — camera + 3D layers (M0–M3 + M6 + M2, 8 commits)

The start of After-Effects-style cards-in-space. Built so that a 2D comp stays byte-identical
at every step (the depth fields default to 0; the GPU path is gated on an `is3D` flag).

- M0: a pure column-major mat4 core + `Transform` gains optional positionZ/rotationX/rotationY.
- M1: a first-class camera layer resolving to View/Projection each frame; the default camera
  frames the comp 1:1 for *any* zoom (AE parity — a lone layer toggled 3D doesn't jump).
- M3: the 3D-layer toggle + inspector X/Y/Z position/rotation rows.
- M2: the renderer — per-3D-layer MVP projection in WGSL (appended to the image/shape/text/
  pattern uniforms) + painter's z-sort (3D layers far→near, 2D layers pin the order).
  - Numbers: verify:mat4 9, verify:camera3d 17, verify:scene3d 5.
  - Hard part: the y-down handedness trap. The default camera was flipping *both* screen axes
    versus the renderer's y-down convention, and the first harness only checked magnitudes so
    it passed anyway. Fixed with a −Y comp-up vector and pinned with signed-parity assertions
    (top-left → (−1,+1), etc.). The GPU projection itself is browser-unverifiable, so it's
    additive + guarded (zero-init `is3D` flag → 2D layers can't be affected) and all the hard
    math — parity, foreshortening, painter order — is proven in Node.

## 2026-08-07

Nine Figma "time-saver" milestones in one day (M2–M10, 8 commits), plus M1 which
landed late the night before. All vector/editing UX. 8 new Node verify harnesses
(transform HUD, measurement, equal-gap, nudge, fuzzy search, tangent, bend, path
cleanup); typecheck stayed at 0 and lint at its 127 baseline through every commit.
Everything with pointer/WebGPU behaviour is structurally verified only — it needs a
browser to feel, so each commit carries its own manual-check list.

- Drag a corner to round it, per-corner (M1, shipped late 2026-08-06).
  - Number: 4 independent radii per rectangle; `borderRadius` was already an animatable
    property, so this was exposure, not a new engine.
  - Hard part: the drag handle has to live in composition space and read back through the
    same anchor/rotation/scale math the renderer uses, or the handle drifts off the corner
    once the layer is rotated.

- The four boolean ops and Flatten now have keyboard shortcuts (Alt+Shift+U/S/I/E, Ctrl+E).
  - Number: before today only 1 of 4 ops (Union) had a binding; now 4 + flatten.
  - Hard part: subtract was using selection order, so which shape survived depended on
    click order. Fixed to z-order (bottom shape wins) to match Figma. Alt also mangles
    `e.key` on some layouts, so every Alt combo matches the physical `e.code`.

- Live transform/measurement HUD while moving, resizing, or rotating.
  - Number: verify:transformhud, 13 assertions.
  - Hard part: the HUD numbers have to be derived from the exact same transform pipeline
    the shader uses (scale → anchor-relative → rotate → translate), or the readout
    disagrees with what's on screen for any rotated or scaled layer.

- Alt-hover shows pixel distances to neighbours; dragging snaps to equal gaps.
  - Number: verify:measure (9) + verify:equalgap (7).
  - Hard part: equal-gap detection is a fuzzy match over the gaps between bounding boxes —
    finding the run of objects that are (nearly) evenly spaced and snapping to complete it,
    without the snap fighting the pointer.

- Keyboard nudge (arrows, Shift = big), align (Alt+A/D/W/S/H/V), distribute (Ctrl+Alt+H/V),
  and several previously-unbound actions wired up.
  - Number: verify:nudge, 4 assertions; nudge amounts are configurable in Settings.
  - Hard part: Alt+S already meant "trim clip down". Resolved by gating the align keys to a
    ≥2 selection and ordering them before the trim keys, so Alt+S aligns-bottom only when it
    can't mean trim.

- Command palette on Ctrl+/ or Ctrl+K, backed by a command registry.
  - Number: verify:fuzzy, 10 assertions (the palette's fuzzy matcher).
  - Hard part: the value is the registry, not the popup — commands had to be described as
    data (id, label, when-enabled, run) so the palette, and later menus/shortcuts, all read
    one source instead of re-deriving state.

- Alt-drag to duplicate; Ctrl+D duplicates and then repeats the last transform.
  - Number: +offset carries; a second Ctrl+D re-applies the same delta (array building).
  - Hard part: "power duplicate" means remembering the last move/rotate as a delta and
    re-applying it on each Ctrl+D, and leaving a copy at the origin when you Alt-drag — two
    different notions of "the thing that just happened" that had to be tracked separately.

- Enter turns any shape into an editable path; full tangent-handle control while editing.
  - Number: verify:tangent, 6 assertions; handle modes mirrored / angle-only / independent,
    Alt to break a tangent for one drag.
  - Hard part: `normalizeAngle(-360)` returned `-0`, which fails `deepEqual` against `0`
    (Object.is) and broke the harness — fixed with `+0` normalization. And the handle-mode
    UI had to go in `ShapeProperties`, not `InspectorTabContent`; the polygon inspector
    section lives in a different component than it looked.

- Bend tool: grab a point on a segment and drag to curve it (M9).
  - Number: verify:bend, 4 assertions.
  - Hard part: to make a cubic pass through the cursor at parameter t you add
    `Δ/(3(1−t)t)` to *both* endpoint handles ("translate-both"), and you apply that delta
    to the pre-drag handles each move, not the live ones, or it compounds.

- Delete-and-heal an anchor (Shift+Delete) and join/close paths (Ctrl+J) (M10).
  - Number: verify:pathcleanup, 9 assertions.
  - Hard part: healing is the interesting one. Dropping an anchor and just reconnecting the
    neighbours leaves a kink. Figma's actual fix is a Schneider (1990) least-squares refit:
    fix the two endpoints and their tangent *directions*, then solve only the two handle
    *lengths* that best fit the original two-curve span. My first version passed the curve
    through where the point was (cheaper, but changes the tangents and kinks); replaced it
    with the least-squares solve before shipping.

## 2026-08-06

Two commits: a dependency-security pass and a feature-planning doc. No user-facing change today.

- internal: cut npm audit vulnerabilities from 23 to 2.
  - Number: 8 advisories fixed via package.json `overrides`; 6 of them were "high".
  - Hard part: `npm audit fix` said "no fix available" for the high ones, but that was wrong in the way that matters. Four were in the `@huggingface/transformers` Node backend (sharp, onnxruntime-node, adm-zip) — code this browser app never bundles or runs (the AI workers use the webgpu/wasm backend; grep of `dist/` confirms none of it ships). Patched versions existed; npm just couldn't cross transformers' `^0.34.5` pin, so an override forces them at zero runtime risk. The esbuild override needed proof it wouldn't break vite 5.4 — verified with the build, all 11 harnesses, and `vite optimize`. Also had to prove the 107 lint errors were pre-existing (they are at HEAD), not caused by the dep changes. The remaining 2 are vite's own dev-server advisories, fixed only by a vite 8 major upgrade.

- internal: wrote a 22-milestone plan for porting Figma's editing time-savers into FlashFX.
  - Number: 33-feature gap matrix, produced by an 11-agent research+audit workflow (5 web-research + 5 codebase-audit + 1 synthesis).
  - Hard part: the value was in the audit, not the research — cross-referencing each Figma feature against the actual code found that a lot of it is already half-built and just unwired. The Cloner (a full MoGraph repeater) has no UI at all; the four boolean ops exist but only Union has a keybinding; `borderRadius` is already an animatable property. So several "features" are exposure work, not new engines.

## 2026-08-05

Video/playback + audio-sync work. Not yet committed at time of writing; this entry covers the working tree (14 files changed, +373/−119; ~392 new lines of engine code across 6 files; 4 Node verify harnesses).

- Video playback stops freezing a few seconds in.
  - Number: cap of 12 open decoded frames per asset. Before, only a 512MB byte budget bounded it, so ~60 frames could pile up.
  - Hard part: it wasn't a leak or a logic error. A hardware VideoDecoder silently stops emitting once too many output frames are held open (~16–24), and a VideoFrame that's been transferred still holds its decoder pool slot until `.close()`. The fix is a frame-COUNT cap plus an eviction order that keeps the frames nearest each layer's playhead. Byte accounting alone never touched it.

- New toggle for audio-synced playback (AudioLines button in the preview bar, default off).
  - Number: 392 lines of new engine code; 3 pure-logic harnesses, 24 assertions. Old path unchanged when off.
  - Hard part: none of it runs in the dev environment — no WebAudio/WebCodecs/WebGPU. So the clock, the frame-selection, and the audio-scheduling math were pulled out into pure functions and proven in Node instead. Also the picture has to be shown at the clock reading minus output latency, not the raw reading, or it leads the sound by 20–200ms.

- Video clips with sound play audio on load, and the VU meters move.
  - Number: collapsed onto 1 shared AudioContext (was a second, private one).
  - Internal cause: the private context was created suspended and never resumed, so video-clip audio was silent and the meters read zero. Ships regardless of the toggle.

- Pausing, seeking, or crossing a clip boundary no longer clicks.
  - Number: 8ms gain ramp to zero before every stop.
  - Hard part: a source with a fixed duration ends on its own and fires its `ended` event before the stop path runs, so attaching teardown only in the stop path leaked the audio nodes on the master graph. An adversarial review found it; fixed by attaching teardown when the source is scheduled, not when it's stopped.

- Deleting one half of a split clip no longer freezes or mutes the other half.
  - Number: +17/−2 in the delete action.
  - Hard part: the texture is per-layer so it's always safe to drop, but the decoder registration and audio element are per-asset — they must only be torn down when no surviving layer still points at that asset, and the release has to be deduped so deleting both halves at once doesn't over-release the audio refcount.

- Pressing play with the playhead parked mid-clip on a pitch-shifted audio clip starts at the right sample.
  - Number: one shared scheduling function now used by preview; export left alone (its bounding is already exact, and a harness proves the two agree).
  - Hard part: pitch shift is a resample, so it changes how fast the buffer is consumed. The resume offset into the buffer has to be scaled by that rate. The old code advanced it unscaled.

- Field-sampled layers run at the composition frame rate and show their inspector tab.
  - Number: 2-line type/resolve change; 1-line renderer change; 1-line inspector condition.
  - Internal: the CPU field renderer was hardcoded to 30fps and the Field tab was hidden unconditionally.
