# Devlog

## 2026-08-10

An AI-authoring day bookended by bug-fixing. 12 commits, net +4808/−97 across 58 files. The bulk
was plumbing for prompt→animation — a Zod contract package, a deterministic compiler, and a real
Director stage that turns a prompt into a validated plan — none of it wired into the browser UI
yet. On top of that: a scripted AI-chat mockup that actually builds two scenes on the canvas
(Blackjack, Galaxy), two rounds of crash-fixing around selecting template layers, and dashboard +
timeline polish. typecheck stayed at 0 and lint at the 127 baseline through every commit. The
Director talks to a real API but only from Node; nothing calls it from the UI.

### AI animation-authoring pipeline (schema → compiler → Director)

- internal: a strict Zod "contract" package (`@/schema`) describing a whole animation document —
  layers, properties, easings, cloner, panels, style contract — that exports JSON Schema for a
  model to target.
  - Number: verify:schema, 18 checks.
  - Hard part: Zod v4 is only reachable through the `zod/v4` subpath of the installed v3 build, and
    `.refine`/`.superRefine` silently drop out of the JSON Schema export (runtime-only) — so every
    constraint the model must *see* had to be structural (min/max, enums, discriminated unions),
    leaving only cross-field checks to a separate semantic validator. `.prefault({})` (not
    `.default({})`) is what makes a defaulted object optional on the input side.

- internal: a deterministic compiler — validated plan → jobs, returned fragments → a committed
  Composition.
  - Number: verify:compiler, 23 checks; 9 preset attachments.
  - Hard part: it must be deterministic (same plan → byte-identical composition), so nothing in it
    can read a clock or a seed. Defaulted preset params fought the type system (the `.default({})`
    overload, and generic indexed-access reported "not callable") — resolved by building the
    attachments explicitly instead of generically.

- internal: a Director stage that sends a prompt + the JSON Schema to a real model and returns a
  plan that passes the semantic validator (beat contiguity, duration, element ownership,
  id-namespacing, format, transitions).
  - Number: verify:director, 9 checks. Reads the key only from `ANTHROPIC_API_KEY`; never written
    anywhere.
  - Hard part: the prompt and the schema shipped contradictory numbers (palette size, easing count,
    subject count, whether `focalPoint` is required). Rather than pick one, I set the schema to the
    latest intended numbers everywhere and updated the fixtures + the five reference docs to match,
    so prompt/schema/docs/harness all agree.

### AI chat mockup + two buildable scenes

- The first message in the AI panel runs a scripted "generation" — streamed intro, a live checklist
  (Director → Coders with a rising layer count → Assembly → …) — then actually builds a Blackjack
  Deal scene on the canvas. A second message ("can you create a galaxy too?") builds a Galaxy.
  - Number: Blackjack is a ~13s top-down 2.5D scene (dealt hands, camera push-in, per-glyph
    commentary); verify:anim-templates, 142 checks (5 for blackjack).
  - Hard part: both scenes build *animated* — layers reveal one at a time, then the keyframes apply
    — instead of dumping in at once. That needed a store action (`insertAnimationTemplateAnimated`)
    that stages the static layers one per tick (keyframes stripped) via non-undoable sets, then
    commits the keyframed layers as a *single* undo step, driven by the mockup's checklist
    callbacks.

### Selecting a template layer stopped crashing the canvas (two rounds)

- Round 1: selecting a text layer with missing content/layoutConfig/animOverrides crashed with
  "cannot read property 'spans'". Guarded those reads in the Inspector, snap bbox, and
  TransformOverlay, and made the fields readable in the inspector.
- Round 2 (the one actually firing): a template *group* crashed the same way the moment it was
  selected. `getLeafWorldSize`'s catch-all `else` cast *any* non-video/image/shape/group layer to a
  text layer — and Blackjack parents its **camera** into the scene group, so computing the group's
  bounds dereferenced `camera.content.spans`.
  - Number: verify:groupbounds, 3 checks (camera-in-group → no throw, shape-derived bounds).
  - Hard part: round 1 was the right spirit in the wrong file — the live path was
    `computeGroupBounds → getLeafWorldSize`, not the inspector/overlay. Fixed by handling text
    explicitly (guarded) and returning null for camera/audio/cloner/precomp/particle/layout: types
    that don't contribute a leaf rectangle to a group's bounds.

### Dashboard + timeline polish

- The project-card "…" menu is no longer clipped invisible inside the card, and right-clicking a
  card opens the same menu.
  - Hard part: the card root is `overflow-hidden` (for its rounded preview), which clipped the
    absolutely-positioned dropdown. Moved the menu to a `createPortal` at document.body with fixed,
    viewport-clamped positioning.

- The timeline mouse-wheel no longer feels like it zooms in and out while you scroll back and forth.
  - Hard part: React registers `onWheel` as a *passive* listener, so the handler's `preventDefault()`
    was a no-op and the browser co-scrolled the element, fighting the JS scroll. Re-attached the
    handler natively with `{ passive: false }` and read scroll/zoom fresh from the store each event
    (the old closure was stale). Zoom is now Ctrl/Meta-only; a plain wheel only scrolls time.

- Removed em dashes from the AI panel's responses, and from the site's `<title>`/social-share
  headers (the header change is in the working tree, not yet committed).

## 2026-08-09

A launch-polish day, then a deep dive into the 2.5D camera. 24 commits (+ one empty one I
pushed by accident), 52 files changed, +2777/−323. Roughly two halves: the morning cleared
launch blockers (a crash, SEO, the dashboard, the AE camera dialog); the afternoon built the
camera into something you can actually *fly* — a world-space 3D view, a keyframe editor, and
a true smooth spatial-bezier path. typecheck stayed at 0 and lint at the 127 baseline through
every commit. Everything that touches WebGPU or pointer behaviour is Node-harness-verified
only, so it still needs a browser to *feel*.

### Launch blockers (morning)

- The Cloner no longer crashes the editor — and now actually draws its instances.
  - Number: verify:cloner-render, 8 checks.
  - Hard part: it wasn't skipping the cloner, it was mis-bucketing it. A resolved cloner has
    no drawable payload of its own, and the renderer's catch-all `else` filed it as a *shape*,
    so the shape packer dereferenced `layer.shape` and threw every single frame. The real fix
    was upstream: `resolveFrame` now expands a cloner into per-instance stamps of its source
    layer (and hides the source, C4D-style), and the bucketing skips any payload-less resolved
    layer. Corrected the CLAUDE.md note that had claimed the if-chain "safely skipped" it.

- Space plays the video even while a number field is focused; Esc and click-outside deselect.
  - Hard part: a focused `<input>` swallows Space as a literal character, so "press space to
    play" silently typed a space instead. Play now wins over the field (except while actually
    editing text), and deselect had to clear both the canvas and the timeline selection.

- Multi-select outlines now sit on parented objects instead of up-and-left of them.
  - Internal: `getLayerWorldBounds` was reading the layer's *local* `transform.position`
    rather than its world position through the parent chain — swapped to `getWorldPosition`.

- Full SEO pass + the FlashFX mark now appears in the site/app headers.
  - Number: rewrote `index.html` head, added robots.txt, sitemap.xml, web manifest, an inline
    brand logo, and a rasterised OG image + apple-touch icon (PNG).
  - Hard part: a raw `&` inside the OG SVG's aria-label broke librsvg (strict XML) and produced
    a blank PNG — had to escape it to `&amp;`. Sitemap lives at `editor.flashfx.app/sitemap.xml`.

- The dashboard tabs work: Recents / All / Starred / Trash / Templates, plus starring and a
  real trash lifecycle (7-day purge, 30 if starred, and a permanent-delete that asks you to
  type the project name GitHub-style).
  - Number: verify:trash, 5 checks (retention math). Four scene deep-links added to a new
    Templates tab (galaxy, city skyline, rocket launch, forest).
  - Hard part: keeping the retention math pure so it could be proven in Node — purge time is
    derived (`trashedAt + retentionDays`), and "starred gets longer" had to survive the
    round-trip without a background job to lean on.

### After Effects camera settings + depth of field

- A real AE-style Camera Settings dialog: coupled lens fields (Zoom / Angle of View / Focal
  Length / Film Size / Comp Size) and working depth of field, in a two-column layout with a
  tutorial-video placeholder.
  - Number: verify:camera3d, 24 checks. Researched AE's actual behaviour with a multi-agent
    workflow first, then implemented the algebra exactly.
  - Hard part: the four lens fields are *one* identity — `Z = f·C/F` — so storing all of them
    would desync the moment you keyframe. Only Zoom (px) is stored and render-affecting; Focal
    Length / AOV / F-Stop are derived for display, so they can never drift. DOF is a per-3D-layer
    circle-of-confusion routed through the existing blur pipeline, honouring AE's "lock to zoom".

### Editor chrome + a camera parallax template

- Dropped the FlashFX brand button from the editor top bar (just "Projects" now), removed the
  em-dash separator from the dashboard header, collapsed "Render" + a small "Export" into one
  prominent **Export** button, and fully hid the Animation Builder (kept the code, not the button).
- A "2.5D Camera Parallax" template that uses the camera meaningfully — cards at varying depth
  with a keyframed truck + push — reachable by deep link.

### The camera you can fly (afternoon)

- A 3D View in the inspector: an orthographic, AE-style schematic of the world where the camera
  and 3D layers live, shown *alongside* the live canvas when a camera is selected (the tab
  sidebar hides for space). Drag the camera and its point-of-interest to place them; the main
  canvas updates live. Plus crash mitigation — a WebGPU validation-error scope that captures and
  logs instead of letting a validation error escalate to a lost device.
  - Hard part: the Side view wouldn't drag. The SVG used a fixed square viewBox with the default
    `preserveAspectRatio`, which letterboxes, but the pointer math assumed a linear stretch — so
    clicks skewed on the letterboxed axis. Fixed by tracking the element's real pixel size as the
    viewBox with `preserveAspectRatio="none"`, giving a 1:1 pointer mapping on both views.

- A "Disable Camera" toggle in the canvas top-right: renders the screen flat 2D, as if no camera
  existed, so a 2.5D comp can be edited without fighting the perspective. Screen-only — export
  always keeps the camera.
  - Internal: the entire M2 3D/MVP path is already gated on `frame.camera` existing, so dropping
    the camera for the screen render yields the exact 2D result with no other change.

- Camera UX polish: full-width Top/Side tabs, double-click the camera for Settings (the inline
  button is gone), a precision drag mode (world moves at 40% of pointer speed), and aperture (mm)
  iris handles that mirror each other.

- A camera-path keyframe editor in the 3D view: a rhombus that follows the camera to key its
  position, world-anchored keyframe markers (click to seek, right-click to delete), a dotted
  "possible path" that becomes a solid line at 2+ keys, and a right-click menu per segment.
  - Hard part: the drawn path is *sampled from the real evaluated eye*, not a guess — so what you
    see is exactly what renders, for any interpolation.

- Smooth spatial-bezier camera path with draggable tangent handles.
  - Number: verify:camera-path, 4 checks (collapse-to-lerp, byte-identity, bow, u-tracking).
  - Hard part: making it a *strict, opt-in generalisation*. A cubic Bezier whose control points
    sit on the 1/3–2/3 line collapses to a straight lerp, so a path with no tangents is
    byte-identical to the old linear one (proven, so the existing harnesses can't regress). And
    timing had to keep coming from the real keyframes: the along-path parameter `u` is extracted
    from the actual interpolation of whichever axis moves most, so easing/hold on the position
    keys still drives the fly-through. Right-click a segment for Smooth (auto Catmull-Rom
    tangents) / Straight / Hold; the mirrored handles bow the curve in 3D.

### Project open

- Project cards now show a *random frame* from the scene, refreshed on every open, so tens of
  projects stay distinguishable.
  - Hard part: the old capture did `canvas.toBlob()` on the WebGPU canvas at teardown, which
    hands back a blank or stale frame. The new one renders a random frame to an *offscreen*
    target on the live device — reusing the warmed-up texture caches, never touching the visible
    canvas (no flash) — then downscales to a small WebP and overwrites the old blob in place.

- A loading splash covers the editor on open until the scene, assets, and first frame are ready.
  - Hard part: opening a project janks the main thread for a couple seconds (deserialize +
    resolve + first WebGPU render), which would freeze a normal JS-driven loader too. The spinner
    and progress bar are pure CSS transform animations, so they run on the compositor thread and
    keep moving *through* the freeze.

- A revert-to-default (↺) button on every Transform property row — Position → comp centre,
  Scale → 1, rotations/Z → 0, Opacity → 1 — keyframe-aware, and dimmed when already at default.

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
