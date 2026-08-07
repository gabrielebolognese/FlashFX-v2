# Devlog

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
