needs_human: none
all_done: false
last_completed_batch: B10e
remaining_buildable: 17
browser_pending: B10d-mask B10e

# Auto-batch run state

The shared state for the unattended batch runner (`scripts/run-batches.sh`). The five
fields above are the canonical, machine-read top block - the runner greps them, and
`/next-batch auto` + `/review-batch` update them in place. Keep them as the first five
lines, one `key: value` per line.

Field meanings:
- `needs_human` - `none`, or a one-line reason the loop stopped and wants a person. The
  runner exits (code 3) when this is anything but `none`. Clear it back to `none` after
  you have dealt with the cause, then rerun the script to resume.
- `all_done` - `true` once no buildable (`⬜`, non-`skip`) batch remains. Runner exits 0.
- `last_completed_batch` - the ID (e.g. `B32`) of the most recently built batch, used by
  `/review-batch` to know what to review and by the runner to detect progress.
- `remaining_buildable` - count of `⬜` rows in `docs/AE-FEATURE-BATCHES.md` that are not
  `skip`. Informational.
- `browser_pending` - space-separated IDs of batches that are code-complete but still owe
  an in-browser (WebGPU) eyeball. These were verified by tsc/lint/build/test only.

Everything the runner did also lands in `docs/auto-run.log` and `git log --oneline`
(build + progress + review commits per batch).

## Log

(One entry per batch, appended by `/next-batch auto` and `/review-batch`. Format:)

<!--
### <ID> - <title>
built: <date>
review request: <changed files>
deviations: <none, or the decision made>
review: <pending | accepted | rejected + numbered problems>
fix-attempt: done (<date>)   # only present if a rejected batch was fixed
-->

### B10d-mask - Freeform-polygon mask coverage shader + path-mask authoring UI
built: 2026-10-14 (commit 85ccf8e)
review request: CLAUDE.md docs/AE-FEATURE-BATCHES.md package.json scripts/gpu-verify-masks.mjs scripts/lib/headless-gpu.mjs scripts/verify-mask-coverage.mjs scripts/verify-mask-path.mjs src/App.tsx src/core/maskCoverage.ts src/core/maskPath.ts src/core/pathVertexOps.ts src/core/strokeFit.ts src/engine/maskWgsl.ts src/engine/renderer.ts src/project-system/services/validation.ts src/store/editor.ts src/store/mask.ts src/store/maskPen.ts src/ui/panels/Inspector.tsx src/ui/panels/MaskOverlay.tsx
deviations: (1) Render mechanism: neither option in the batch section (new per-mask vertex storage buffer, or CPU coverage bake to a texture). Chose packing a freeform mask into a RUN of the existing 8 MaskSlot uniforms (header + bezier/polyline data stream), so there is no bind-group/buffer/pipeline surgery. Cost: <=12 exact bezier vertices per mask when alone; several path masks share via water-filling; over-budget outlines are reduced (least-error of Schneider refit / anchor fit / RDP / arc polyline). (2) Path vertices are stored in the mask's normalized local frame (comp = position + R(rot)(local * size)) so position/size/rotation, the overlay box handles and the B10a reveal wipes drive path masks unchanged. (3) Equal-count path keyframes now interpolate vertex-for-vertex (AE behaviour) instead of B8b's arc-length resample; one B10c verify:mask-path expectation was updated deliberately. (4) Nonzero fill rule; a path mask with <3 vertices is skipped (identity). (5) Persistence: path vertices/poses are sanitized on load and per-vertex feathers are no longer index-shifted by dropping bad entries. (6) New tooling: headless Chrome runs WebGPU on this machine - scripts/lib/headless-gpu.mjs + `npm run gpu:masks` (27 checks: shader vs CPU twin, the real WebGPURenderer for shape/image/text + animated path, the real MaskOverlay driven by genuine CDP mouse events). Not part of `npm test` (CI has no GPU). insertPointOnSegment/applyVertexType moved from store/editor.ts to core/pathVertexOps.ts (shared, verbatim).
gates: tsc 0 | lint 125 (106/19, baseline held) | build ok | npm test 110/110 | gpu:masks 27/27 (local, headless)
browser: code-complete; GPU render + overlay interaction machine-verified headless; an in-app eyeball (Tailwind styling, stacking against the other viewport overlays, App.tsx key routing) is still owed.
review: accepted (2026-10-14; re-ran tsc 0 | lint 125 (106/19) | npm test 110/110 incl. verify:mask-coverage + verify:mask-path. Delivers traced to real code: packMaskSlots + CPU twin, freeform WGSL in all 4 masked shaders via the single writeMaskUniforms, mask pen + vertex/handle editing, path keyframes, per-vertex feather, load sanitization. No Math.random/Date, no em dash, no secrets, 2.5D scope, browser_pending honest. Non-blocking for the in-app eyeball: a stale selectedVertex on the active layer's selected path mask makes Delete remove that vertex instead of the layer.)

### B10e - Basic roto / refine-edge (mask modes + mask expansion + colour-aware Refine Edge)
built: 2026-10-14 (commit 680f120)
review request: CLAUDE.md docs/AE-FEATURE-BATCHES.md package.json scripts/gpu-verify-masks.mjs scripts/lib/legacy-mask-twin.mjs scripts/verify-mask-coverage.mjs scripts/verify-refine-edge.mjs src/core/factory.ts src/core/interpolation.ts src/core/maskCoverage.ts src/core/refineEdge.ts src/core/types.ts src/engine/maskWgsl.ts src/engine/refineWgsl.ts src/engine/renderer.ts src/project-system/services/validation.ts src/store/editor.ts src/ui/panels/Inspector.tsx
deviations: (1) Scope: "basic roto / refine-edge" was built on B10c/B10d-mask's animated freeform masks as AE mask MODES + mask EXPANSION (both orphan gaps from the B10 audit that multi-shape roto needs) + a colour-aware Refine Edge pass. No ML Roto Brush (deferred, recorded in the doc). (2) Mode default: absent = intersect (the legacy multiply: existing projects render bit-identically, proven vs a frozen pre-B10e twin), but NEW masks default to Add (the AE default), so a second mask added from now on unions instead of intersecting; one older gpu:masks scene was pinned to intersect explicitly. (3) Refine Edge is per LAYER (image/video) on the combined matte edge, not per mask or brush-painted; its params are static numbers (mask expansion IS keyframable). (4) No bind/buffer/pipeline change: mode rides in params.y (invert + 2*modeId), expansion in each slot's unused last float, refine in image-uniform floats 277..279 (radius 0 = the old alpha path). (5) Refine classifies on the unwarped, uncorrected source texture and adds the decontamination delta to the corrected colour. (6) The normal/field is only computed within the refine band (freeform early-out widened by it) - proven exact wherever |sd| < band. (7) gpu:masks: the harness comp background is now black (the renderer paints comp.background, not settings.backgroundColor) and the real Inspector is mounted with a tall emulated viewport.
gates: tsc 0 | lint 125 (106/19, baseline held) | build ok | npm test 111/111 | gpu:masks 50/50 (local, headless)
browser: code-complete; modes/expansion/refine render on the real WebGPURenderer and the real Inspector controls are machine-verified headless. Owed: an in-app eyeball (Tailwind layout of the new Masks-tab rows; Refine Edge on real decoded VIDEO footage - headless had no video, only an image layer).
review: pending
