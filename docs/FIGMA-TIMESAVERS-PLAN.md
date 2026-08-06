# FlashFX — Figma Time-Saver Features: Gap Analysis & Milestone Plan

Roadmap of record for porting Figma’s canvas **time-saver** features into FlashFX, one milestone at a time. FlashFX is a WebGPU motion-graphics editor (not a static UI-design tool), so the relevant analogs are Figma’s canvas *editing* accelerators — vector/path editing, boolean ops, align/distribute, snapping/measurement, selection & transform accelerators, and reuse — not its responsive-UI system.

**How this was produced.** An 11-agent research+audit workflow: 5 agents did deep web research on Figma feature categories (help.figma.com, Figma blog/Config, tutorials), 5 agents audited the FlashFX codebase per subsystem with file:line evidence, and a synthesis pass cross-referenced them into the gap list and milestone order below. Feature status and every implementation sketch cite real FlashFX files.

**Legend.** Status: `missing` · `partial` (data model or engine exists, UX/wiring absent) · `present`. Effort: S (hours) · M (a day) · L (multi-day) · XL (data-model + renderer). Relevance = value to a motion editor.

**Process.** Each milestone ships **one or two** features, is verified green (`npm run typecheck` = 0, `npm run build`, relevant harness) before the next, and is reviewed against the FlashFX conventions in CLAUDE.md (command-pattern mutations, pure logic in `core/`, no new deps without cause). Milestones are ordered by dependency, then value/effort; the first two are the user-prioritized examples (drag-to-smooth-corners, boolean subtraction).

---

## Milestone roadmap

### Milestone 1 — On-canvas rounded corners
*Effort M · depends on: none*

User-prioritized 'drag-to-smooth-corners'. Self-contained (TransformOverlay handle + borderRadius AnimatableProperty + roundedBoxSDF), no dependencies, and immediately visible. Uniform drag handle first (S, reuses existing borderRadius), then per-corner (data-model + shader). A strong, clearly-scoped opening win.

**On-canvas corner-radius drag handle** — *missing, relevance medium, effort S*
- Figma: A circular handle at each corner of a rect/star/polygon; dragging inward rounds the corner live by eye; arrows nudge, Shift big-nudge — no dialog.
- FlashFX today: Value exists but no canvas handle: RectangleShape.borderRadius AnimatableProperty (types.ts:138), Inspector 'Corner R' NumberDragInput (Inspector.tsx:415), renderer roundedBoxSDF single scalar (renderer.ts:608); TransformOverlay handle array has only 8 resize handles (TransformOverlay.tsx:812-821), no radius handle.
- Build: Add an inset radius handle to TransformOverlay's handle set (~:812) shown when the active layer's shape.type==='rectangle'. On drag, map screen delta to a clamped borderRadius (0..min(w,h)/2) and write via the existing keyframe-or-defaultValue path used by resize, batching to one undo with commitDrag. Reuses the existing borderRadius AnimatableProperty — no data-model change. USER-PRIORITIZED (drag-to-smooth-corners).

**Independent per-corner radius** — *missing, relevance medium, effort M*
- Figma: Each corner of a rectangle/frame gets its own radius; Alt+drag one handle rounds only that corner, or type four values.
- FlashFX today: Single scalar everywhere: renderer.ts:296 uniform borderRadius:f32 and :608 single value into roundedBoxSDF; types.ts:131-139 one borderRadius; grep perCorner/topLeftRadius = none.
- Depends on: On-canvas corner-radius drag handle
- Build: Extend RectangleShape (types.ts:131) with optional cornerRadii?:[AnimatableProperty,AnimatableProperty,AnimatableProperty,AnimatableProperty] (tl,tr,br,bl), keeping borderRadius as the uniform fallback. Pass a vec4 radii uniform (renderer.ts uniforms ~:296) and branch roundedBoxSDF by quadrant (~:608). Inspector: an 'independent corners' expander → 4 fields. TransformOverlay: Alt+drag a single radius handle sets only that corner. Migration: seed cornerRadii from borderRadius on read.

### Milestone 2 — Boolean ops UX + Flatten
*Effort S · depends on: none*

User-prioritized boolean subtraction. The four ops are already implemented in pathOps + store; the only gap is exposure — Alt+Shift+U/S/I/E keys, a context-menu Boolean submenu, and a Flatten command. Cheapest high-value win in the plan; no dependencies.

**Boolean ops: shortcuts + context menu + Flatten** — *partial, relevance high, effort S*
- Figma: Union/Subtract/Intersect/Exclude on Alt+Shift+U/S/I/E, also in the right-click Boolean menu; Flatten (Cmd/Ctrl+E) bakes a boolean/vector stack into one simple path.
- FlashFX today: All four ops implemented (pathOps.ts:143-146; Toolbar Path menu :340-343) but only Union has a key (Ctrl+Shift+U); no context-menu boolean (grep of src/ui/context-menu = none); no Flatten op (BooleanOp lacks flatten, pathOps.ts:10).
- Build: Add Alt+Shift+U/S/I/E bindings in App.tsx keydown → booleanSelectedShapes(op). Add a data-driven 'Boolean' submenu to clip/multi-clip menus (menuDefinitions.ts) gated by selectedShapeCount>=2. Add a Flatten command = bake a multi-selection to one PolygonShape (union of rings, or flatten each layer's beziers to a single anchor path). Engine already exists — pure UX exposure. USER-PRIORITIZED (boolean subtraction).

### Milestone 3 — Live transform/measurement HUD
*Effort S · depends on: none*

Cheap, high value, no dependencies. A cursor-following W×H / X,Y / degrees readout during move/resize/rotate (and length/angle on the pen) removes the round-trip to the panel and is the measurement primitive later milestones reuse.

**Live dimension/length/angle HUD** — *partial, relevance high, effort S*
- Figma: Drawing/moving/resizing/rotating shows a live at-cursor readout (W×H, X/Y + offset, segment length, degrees), Shift constrains to 45°/15°, removing the trip to the panel.
- FlashFX today: Shape creation shows a 'W×H' label during drag (ShapeCreationOverlay.tsx:233); Pen shows nothing; TransformOverlay move/resize/rotate has no numeric tooltip (audit: live transform readouts absent).
- Build: Add a cursor-following tooltip in TransformOverlay's move/resize/rotate handlers reading transformState (move→X,Y+delta; resize→W×H; rotate→degrees), and a length+angle label in PenToolOverlay while dragging a segment/handle. Reuse the ShapeCreationOverlay label styling. Cheap, high value.

### Milestone 4 — Distance measurement & equal-gap snapping
*Effort M · depends on: M3*

Two measurement/spacing affordances that build on the existing bbox and snap engines. Alt-hover distance labels enable spec/redline work; equal-gap detection during drag removes the explicit distribute step. Depends only on the HUD styling from M3.

**Alt hover-to-measure distance** — *missing, relevance high, effort M*
- Figma: With one object selected, hold Alt and hover another to draw red lines with the exact horizontal/vertical gap between their bounding boxes (spec/redline work).
- FlashFX today: Audit: on-canvas distance/measurement overlay absent; SnapGuides draw plain lines with no numeric labels (SnapGuides.tsx).
- Depends on: bbox module (exists)
- Build: New MeasureOverlay mounted in Viewport: when a layer is selected and Alt is held, on hover compute H/V gaps between the selected bbox and the hovered bbox via getOtherRects/getLayerRect (core/snap/bbox.ts:106,146) and draw red lines + px labels. Add labels to CanvasSnapGuides for equal-gap cases. Reuses the existing world-space bbox model.

**Equal-spacing measurement suggestions** — *missing, relevance high, effort M*
- Figma: Dragging an object into a run of evenly-spaced objects detects the matching gap, shows a red spacing readout, and snaps so all gaps stay equal — distribute-by-feel.
- FlashFX today: snap/resolver emits only edge/center/canvas/grid/guideline targets (types.ts:13, resolver.ts:98-146); no equal-gap target.
- Depends on: snap engine (exists); Live dimension/length/angle HUD
- Build: Extend snap/resolver.buildTargets to detect runs of equal-gap neighbors along the drag axis and emit a synthetic target at the position that equalizes the next gap; return it in SnapResult.lines with a px annotation rendered by SnapGuides. Hooks into TransformOverlay's existing move-snap path. Removes the explicit distribute step for ad-hoc rows.

### Milestone 5 — Keyboard positioning & shortcut wiring
*Effort S · depends on: none*

Table-stakes keyboard work, all in App.tsx keydown + a nudgeSelection action. Adds arrow-nudge and turns the many label-only shortcuts (Cut, Select-All, Alt+A/D/W/S/H/V align, paste-in-place) into real bindings against already-built actions.

**Arrow-key nudge (small/big, configurable)** — *missing, relevance high, effort S*
- Figma: Arrow keys move the selection by a small nudge (1), Shift+arrow by a big nudge (10); both amounts user-configurable (set big-nudge to your grid unit).
- FlashFX today: App.tsx keydown (:44-163) has no Arrow cases; layer movement is pointer-only (audit).
- Build: Add Arrow{Up,Down,Left,Right} cases in App.tsx keydown → new editor.ts nudgeSelection(dx,dy) writing transform.position (keyframe-or-defaultValue, one undo); Shift = big nudge. Add configurable amounts to settings/tabs.ts ('editor.smallNudge'/'bigNudge'). The two-tier pattern should later extend to playhead/keyframe stepping.

**Keyboard align/distribute + wire unbound Edit shortcuts** — *partial, relevance high, effort S*
- Figma: Alt+A/D/W/S/H/V align a selection; Cut/Select-All/Deselect/Paste-in-place all have working keys.
- FlashFX today: Align/distribute actions exist (align.ts; AlignPanel/MultiSelectInspector) but no keys; Ctrl+X, Ctrl+A, Ctrl+Shift+A, Ctrl+Shift+V are display labels only, not bound (App.tsx; Toolbar.tsx:288-295); Ctrl+V handler ignores Shift so paste-in-place never fires by keyboard.
- Build: In App.tsx keydown add Alt+A/D/W/S/H/V → computeAlignment+applyAlignResults, and bind handleCut / handleSelectAll / deselectAll; branch the existing Ctrl+V on e.shiftKey → pasteClipboard(inPlace=true). Turns already-built actions into real shortcuts.

### Milestone 6 — Command registry + palette
*Effort L · depends on: M5*

Foundational: extracts a command/keymap registry (fixing label-only shortcuts systemically) and adds a Ctrl+K Quick-Actions palette — the highest-leverage discoverability add for a feature-dense editor. Comes after M5 so the consolidated shortcuts register into it.

**Command palette + central command registry** — *missing, relevance high, effort L*
- Figma: Cmd/Ctrl+K opens a searchable palette of every command/tool/menu action showing its shortcut — one keyboard-driven entry point for a feature-dense app.
- FlashFX today: No palette (grep Palette/kbar/command-palette = none); every shortcut lives inline in one App.tsx keydown (:44-166); discoverability only via context menu + Toolbar.
- Depends on: Keyboard align/distribute + wire unbound Edit shortcuts
- Build: Extract a command registry (id,label,run,shortcut,when) aggregating store actions + menuDefinitions/Toolbar entries; refactor App.tsx keydown to dispatch through it (fixing label-only bindings at the source). Add a Ctrl+K palette component (fuzzy filter, run, shows shortcut + recents) mounted at app root. Highest-leverage discoverability add for a dense editor.

### Milestone 7 — Gesture-based duplication & arrays
*Effort M · depends on: none*

The highest-value manual accelerator for motion: Alt-drag clones by moving and records the delta; Ctrl+D then repeats that delta into an evenly-stepped array. Needs the TransformOverlay drag path and a commitDrag delta memory. A lightweight, gesture-driven cousin of the Cloner.

**Alt-drag duplicate** — *missing, relevance high, effort M*
- Figma: Hold Alt/Option while dragging to leave the original and drag a live copy (Shift constrains axis) — clone-by-moving in one gesture.
- FlashFX today: TransformOverlay Alt only suppresses snapping mid-move (:541); no clone-on-drag branch in startDrag (:473-522).
- Depends on: TransformOverlay drag (exists); duplicateSelection (exists)
- Build: Detect e.altKey at move-drag START in TransformOverlay startDrag (distinct from the current mid-drag Alt=snap-suppress at :541) → duplicateSelection(offset 0) first, then drag the copies; record the release delta for power-duplicate. The fastest way to seed the second element of a to-be-animated set.

**Ctrl+D power-duplicate (repeat last transform)** — *missing, relevance high, effort M*
- Figma: After offsetting one duplicate, each Cmd/Ctrl+D repeats that exact translation/rotation/scale delta, generating an evenly-stepped linear/radial array by keytaps.
- FlashFX today: duplicateSelection applies a fixed +20px offset with no transform memory (editor.ts:3401-3434); grep transformAgain/repeatTransform = none.
- Depends on: Alt-drag duplicate (to seed the delta) or commitDrag delta capture
- Build: Record the last move/scale/rotate delta on commitDrag in the editor store; make duplicateSelection apply that delta (position + rotation + scale step) when present instead of +20. Repeated Ctrl+D lays a uniform array — the gesture-based analog to the Cloner, with zero measuring.

### Milestone 8 — Universal vector edit mode + tangent control
*Effort M · depends on: none*

The path-editing foundation the audit says is missing: Enter/Esc toggles point editing on ANY primitive (auto Object-to-Path), removing the polygon-only restriction, and broken/mirror tangents give the corner<->smooth (ease-curve) model. Unblocks bend, heal, join, and pencil.

**Enter vector edit mode on any primitive** — *partial, relevance high, effort M*
- Figma: Select a shape/text and press Enter (or double-click) to drop into point-level edit exposing anchors/handles on ANY primitive; Enter/Esc exits — a hard boundary between transform edits and geometry edits.
- FlashFX today: Direct Select works but only on polygon layers (isPolygonLayer guard, PenToolOverlay.tsx:47-49); Object-to-Path exists but is a manual menu op (editor.ts:2238, Toolbar.tsx:337); no Enter/Esc mode toggle (App.tsx keydown has none).
- Depends on: convertShapeToPath (exists)
- Build: In App.tsx keydown add Enter → if the selected shape is rect/circle/star, auto-run convertShapeToPath, then set shapeTool='directSelect' and an 'editing' flag on pathEdit store; Esc exits to object mode. Add an 'Edit Object' button to CanvasToolbar/Inspector. This makes edit-mode the universal boundary the audit flags as missing and unblocks bend/heal/join/pencil on every primitive.

**Broken/independent bezier handles + mirror modes** — *partial, relevance high, effort S*
- Figma: Anchor tangents can be No-mirror (cusp), Mirror-angle (smooth), or Mirror-angle-and-length (symmetric); Alt-drag temporarily breaks mirroring — the corner<->smooth model.
- FlashFX today: Handles always mirrored for non-corner vertices (mirrored = v.vertexType!=='corner', PenToolOverlay.tsx:290); no Alt break, no mode selector. Keyframe graph has tangentMode continuous|broken (types.ts:19) but PathVertex does not (types.ts:164-169).
- Build: Add PathVertex.handleMode?:'mirrored'|'angle'|'independent' (types.ts:164). In PenToolOverlay handle branch (:281-299) honor e.altKey → set independent (break) for a one-off, and drive full mirroring from handleMode instead of the vertexType!=='corner' shortcut. Add a small right-panel/inspector selector for the selected vertex's mirror mode. This is precisely the velocity/ease-curve tangent model.

### Milestone 9 — Bend tool
*Effort M · depends on: M8*

The direct-manipulation curve gesture — grab a straight segment or corner and pull it into a curve. Depends on the edit-mode boundary and broken-handle model from M8; reuses the De Casteljau segment math from add-point.

**Bend tool (drag segment/point to curve)** — *missing, relevance high, effort M*
- Figma: Grab a straight segment or a corner point and drag to sprout/pull bezier tangent handles, turning it into a smooth curve in one gesture.
- FlashFX today: PenToolOverlay onEditPointerMove handles only 'anchor' and 'handle' drag (TransformOverlay/Pen edit :255-300); no segment hit-test; grep bend/dragToCurve/curvature = none in vector code.
- Depends on: Enter vector edit mode on any primitive; Broken/independent bezier handles
- Build: Add a 'bend' VectorToolType (shapeTool.ts) + CanvasToolbar entry. In PenToolOverlay add a segment hit-test (project the comp point onto each line/bezier segment, reuse insertPointOnSegment's De Casteljau + t at editor.ts:4785). Dragging a straight segment converts both endpoints to bezier and grows symmetric handles proportional to the drag offset; dragging a corner sprouts tangents. Live via setPathVerticesLive, commit 'Bend Path'. This is the user's drag-to-curve/ease-trajectory gesture.

### Milestone 10 — Path cleanup: heal & join
*Effort M · depends on: M8*

Continuity-preserving path ops needed before keyframing along a path: heal refits a cubic across a removed point; join welds/closes endpoints or stitches two paths. Both live inside vector edit mode (M8).

**Delete and heal** — *missing, relevance high, effort M*
- Figma: Shift+Delete removes an anchor and fits a replacement cubic through the two neighbors so the path keeps its shape and stays closed — no gap, no redraw.
- FlashFX today: deletePathPoint keeps >=2 vertices but does not refit curvature (editor.ts:3512-3564); plain delete leaves a straight join.
- Depends on: Enter vector edit mode on any primitive
- Build: Add pathOps.fitCubicThroughNeighbors (least-squares/Hermite fit of one cubic replacing the removed vertex, setting the neighbors' handleOut/handleIn to approximate prior curvature) + editor.ts healDeletePoint command. Bind Shift+Delete in PenToolOverlay while editing. Needed to clean over-dense/auto-traced motion paths without breaking continuity.

**Join selection (weld/close path)** — *missing, relevance medium, effort M*
- Figma: Cmd/Ctrl+J connects two open endpoints (or two selected points) into one continuous path, closing a gap or stitching segments.
- FlashFX today: Audit: JOIN absent (no join-endpoints command); reverse/simplify exist (editor.ts:2260-2280). No weld across layers.
- Depends on: Enter vector edit mode on any primitive
- Build: editor.ts joinPathEndpoints: same-path two-endpoint selection → set PolygonShape.closed=true or weld coincident points; two separate polygon layers → concatenate vertex arrays into one path (convert each to a shared frame via snap/bbox world helpers), delete originals as one undoable command. Add pathOps ring-merge helper. Ctrl+J in edit mode. Enables filled/continuous stroke for clean write-on.

### Milestone 11 — Copy/paste properties
*Effort L · depends on: none*

One of the biggest restyle accelerators — a 'paste attributes' verb that copies the appearance bundle (or a single focused property) and applies the supported subset via the existing overrides applicator. Standalone; pairs with M12.

**Copy/paste properties (all + single)** — *missing, relevance high, effort L*
- Figma: Copy a layer's full style bundle (fill/stroke/effects/radius/opacity/text) and paste only the props the target supports; or copy just one focused property (a fill/shadow).
- FlashFX today: grep copyProperties/pasteProperties/copyStyle = none; whole-layer clipboard copies everything (editor.ts:3353-3399).
- Build: editor.ts copyLayerProperties(id) snapshots appearance/transform-appearance/corner/text props into a separate 'properties clipboard'; pasteLayerProperties(ids) applies the supported subset, skipping unsupported like Figma. Reuse core/overrides.ts applyOverrides (dot-path set) as the applicator. Bind Ctrl+Alt+C/V + context-menu items. Single-property variant copies the focused Inspector row. One of the biggest restyle accelerators.

### Milestone 12 — Selection accelerators
*Effort M · depends on: none*

Select-all-with-same is the enabler for batch restyle (pairs with M11), and Cmd/Ctrl+click deep-select + group isolation are essential ergonomics for dense group/precomp/cloner hierarchies. Both are self-contained selection-model work.

**Select same / similar** — *missing, relevance high, effort M*
- Figma: Right-click → Select all with same fill/stroke/effect/font/instance — the enabler for batch retiming/restyling.
- FlashFX today: grep selectSame/selectSimilar/selectByType = none; only Select-All + marquee/additive exist.
- Build: editor.ts selectAllWithSame(attr): scan composition.layers for matches to the active layer's type/fillColor/strokeColor/effect/font and _setSelection to them. Add a 'Select all with same…' submenu to the canvas/clip context menu (menuDefinitions.ts). Pairs with copy-properties for whole-set restyle.

**Deep-select into groups + isolation** — *missing, relevance high, effort M*
- Figma: Cmd/Ctrl+click selects a nested layer directly (skipping the group); double-click enters group isolation; Enter/Shift+Enter walk child/parent.
- FlashFX today: hitTestLayers skips groups and there is no enter-group/isolation model (TransformOverlay.tsx:303-328); double-click on canvas only adds ruler guides (Viewport.tsx:370-391).
- Build: In TransformOverlay hit-testing, on Ctrl/Cmd+click select the deepest layer under the cursor; plain click selects the enclosing group; double-click enters an isolation state (new editor 'activeGroupId', dim/lock siblings). Essential ergonomics for dense group/precomp/cloner hierarchies.

### Milestone 13 — Replace source & paste-in-place
*Effort M · depends on: M5*

Classic motion op: swap footage/comp source while keeping transform + keyframes (AE alt-drag-replace), plus finally wiring Ctrl+Shift+V to the existing zero-offset paste. Small; benefits from the keymap consolidation in M5/M6.

**Paste to replace source + paste-in-place wiring** — *partial, relevance high, effort M*
- Figma: Paste-in-place drops content at exact original coordinates; Paste-to-replace swaps one object's source for another while keeping its position/size/constraints (AE alt-drag-replace).
- FlashFX today: Zero-offset paste exists but is menu-only and Ctrl+Shift+V isn't wired (editor.ts:3372; App.tsx Ctrl+V ignores Shift); no replace-source op (grep = none).
- Depends on: Keyboard align/distribute + wire unbound Edit shortcuts
- Build: Wire Ctrl+Shift+V → pasteClipboard(inPlace=true). Add editor.ts replaceSource: for a selected image/video/precomp, swap the media handle / compositionId (and source-size) from clipboard or a picker while preserving transform + keyframes; add a 'Replace Source' context item. Classic motion op (swap footage, keep animation).

### Milestone 14 — Multi-format reframe constraints
*Effort L · depends on: none*

The single most transferable auto-layout idea for a short-form tool: per-layer pin/scale so a composition resize reflows titles/logos/safe-area elements across 16:9↔9:16↔1:1. Self-contained data-model + Inspector work tied to scene settings.

**Reframe constraints (pin/scale)** — *missing, relevance high, effort L*
- Figma: Per-layer pin (left/right/top/bottom/center/stretch) and Scale rules so resizing the frame repositions/stretches every child at once — the most transferable idea for multi-format reframing (16:9↔9:16↔1:1).
- FlashFX today: Audit: constraints absent; no constraint field on layers; scene resize doesn't reflow layers.
- Depends on: scene/composition resize (createScene, Scene settings)
- Build: Add optional Layer.constraints {h:'left'|'right'|'both'|'center'|'scale', v:same} to core/types. On composition width/height change (Toolbar Scene settings), reposition/scale each top-level layer per its constraints. Inspector: a 3×3 pin diagram + Scale toggle. Directly serves short-form aspect-ratio reframing.

### Milestone 15 — Tidy Up
*Effort M · depends on: none*

One-click cleanup that infers a row/column/grid and equalizes spacing — over the existing align.ts + bbox + applyAlignResults pipeline. Complements distribute and preps sets for staggering.

**Tidy Up (auto row/column/grid)** — *missing, relevance medium, effort M*
- Figma: One action snaps a messy multi-selection into a clean row, column, or 2D grid with equal spacing, inferring the layout from current positions.
- FlashFX today: Stack/Circular require an explicit direction/spacing (align.ts:410-525); grep tidy = none; no grid inference.
- Depends on: align.ts + bbox (exist)
- Build: Add computeTidyUp to align.ts: cluster selection bboxes into rows/cols (1D vs 2D inference), snap to the modal gap, return position deltas through the existing applyAlignResults pipeline. Expose in MultiSelectInspector Arrange + a canvas button + Ctrl+Alt+T. Fast cleanup before a stagger.

### Milestone 16 — Cloner authoring UI
*Effort M · depends on: none*

Best value/effort ratio in the plan: a complete, render-integrated MoGraph repeater (grid/radial/path/field, effectors, stagger, data binding) exists but is 'dead to the UI'. Add an addCloner action, a toolbar tool, and a ClonerInspector — pure store/UI wiring exposing the powerful array/distribution analog.

**Cloner authoring UI** — *partial, relevance high, effort M*
- Figma: Analog to Figma's power-duplicate/array + smart-selection distribution — but FlashFX's Cloner is a far more capable MoGraph repeater (grid/radial/path/field, effector stack, timing stagger, data binding) that is fully built yet has NO way to create or edit one.
- FlashFX today: Complete pure engine in src/cloner/, resolved every frame in interpolation.ts:1160-1201, ClonerLayer in the core union (types.ts:825), createDefaultCloner exists; but no addCloner action, no toolbar tool, no context-menu entry (audit: 'dead to the UI'); editor.ts touches cloner only at :442 (label).
- Depends on: cloner engine + resolve path + createDefaultCloner (all exist)
- Build: Add editor.ts addCloner()/createClonerFromSelection (wraps createDefaultCloner, sets sourceLayerId) as history commands; a 'Cloner' tool in CanvasToolbar/Object menu; a ClonerInspector panel to edit distribution mode, counts (renderCount cap), the ordered effector stack, and stagger, writing params through the command pattern; context item 'Create Cloner from selection'. Pure UI/store wiring — the biggest built-but-hidden capability and best value/effort ratio.

### Milestone 17 — Text to vector paths
*Effort L · depends on: M8*

Unlocks per-letter/per-point type animation (draw-on, morph). Depends on the Object-to-Path infra formalized in M8 plus a glyph-outline extractor sourced from the text renderer's font.

**Convert text to vector paths (outline text)** — *missing, relevance high, effort L*
- Figma: Flatten/Outline a text layer to per-glyph editable vector paths — animate letterforms (draw-on, morph, per-letter distortion) with no font dependency.
- FlashFX today: Object-to-Path handles rect/circle/star only (pathOps.ts:56-74); text not covered; no glyph-outline extraction path found.
- Depends on: Enter vector edit mode on any primitive; font glyph-outline source
- Build: Add editor.ts outlineTextLayer: obtain glyph outlines from the same font the text renderer uses (locate the font-face/atlas source in the text render path) and emit one closed PolygonShape per glyph (grouped), preserving the layer transform. Requires a glyph→bezier extractor (opentype-style). Unlocks per-letter/per-point type animation.

### Milestone 18 — Pencil / freehand tool
*Effort M · depends on: M8*

Rough in a trajectory/silhouette by hand, then clean it up — capture pointer samples, RDP-simplify (exists) into a polygon via the existing pen finalize. Depends on the edit-mode foundation from M8.

**Pencil / freehand draw tool** — *missing, relevance high, effort M*
- Figma: Shift+P freehand-draws a stroke; Figma auto-converts the gesture into an editable vector network with fitted points.
- FlashFX today: VectorToolType lacks pencil/freehand (only pen/directSelect/add/delete/convert); RDP simplify exists (pathOps.ts:79) but no stroke capture to feed it.
- Depends on: Enter vector edit mode on any primitive; simplifyPathVertices (exists)
- Build: Add a 'pencil' VectorToolType + CanvasToolbar entry. Capture raw pointer samples in a PenToolOverlay-style handler; on pointer-up run simplifyPathVertices (RDP) → createPolygonLayer (factory.ts). Shift = straight segment. Reuses the existing createPenPath finalize. Natural way to rough in a motion trajectory then clean it up.

### Milestone 19 — Batch rename
*Effort M · depends on: none*

Timeline legibility housekeeping: a token/number/regex rename modal over a multi-selection as one undoable command. Standalone, moderate.

**Batch rename (tokens + numbering)** — *missing, relevance medium, effort M*
- Figma: Cmd/Ctrl+R opens a rename modal for a multi-selection: compose names from tokens (current name, ascending/descending number) with regex match/replace across all selected layers.
- FlashFX today: Only single-layer inline rename (editor.ts:933-946; F2 renames activeId only; context 'Rename' single layer).
- Build: Add editor.ts renameLayers(ids, pattern) (one undo) + a Rename modal composing from tokens {name, number↑/↓} with optional regex find/replace. Bind Ctrl+R for multi-selection. Keeps busy timelines legible.

### Milestone 20 — Rulers & pixel snapping
*Effort M · depends on: none*

Precision polish: real ruler ticks/numbers over the existing guide strips and a live whole-pixel snap mode for crisp raster/thumbnail output. Self-contained over the snap engine and viewport rulers.

**Rulers with ticks/labels + snap-to-pixel toggle** — *partial, relevance medium, effort M*
- Figma: Rulers show tick marks and measurement numbers; a Snap-to-pixel mode forces whole-pixel positions/sizes live for crisp raster output.
- FlashFX today: computePixelSnap exists as a one-shot action (align.ts:635) but there's no live snap-to-pixel during drag; the 'rulers' are bare double-click guide strips with no ticks/numbers (Viewport.tsx:362-392).
- Depends on: snap engine + viewport rulers (exist)
- Build: Add a 'snapToPixel' flag that rounds move/resize results to integers live in TransformOverlay; render tick marks + numeric labels on the ruler strips (Viewport.tsx) using the existing zoom/pan transform. Precision polish for UI-style comps/thumbnails.

### Milestone 21 — Shared linked styles
*Effort L · depends on: none*

Edit-once-update-everywhere for colors/text/effects via a Styles registry on the document, seeded from brand colors. Higher effort (document model + persistence + resolve plumbing), so it lands after the core canvas accelerators.

**Shared linked styles (color/text/effect)** — *missing, relevance high, effort L*
- Figma: Named, reusable, LINKED styles — edit the definition and every layer using it updates. Figma's edit-once-update-everywhere.
- FlashFX today: BrandsTab colors write one-time values (not linked); shapeDefaults is a single global fill/stroke pair (shapeDefaults.ts); no named/linked style system (audit: absent).
- Depends on: document model (compositions registry) + persistence
- Build: Add a Styles registry to SceneDocument {id,type:'color'|'text'|'effect',value}; layers reference styleId for fill/stroke/effect/text; resolve reads through the style; editing a style updates all referents. Inspector 'link to style' control + a Styles panel; seed from brand colors. Persist via serializeDocument. Cuts global-change cost dramatically.

### Milestone 22 — Live boolean groups + outline stroke
*Effort XL · depends on: M2*

The heavy path-model work, deferred to last: a live/parametric boolean group with keyframable inputs + holes/even-odd (XL data-model + renderer), and stroke-to-path which needs a new polygon-offset routine. Both follow the destructive boolean UX of M2 and the path foundations of M8.

**Non-destructive live boolean group / compound paths** — *missing, relevance high, effort XL*
- Figma: Boolean ops produce a live group whose children stay editable (move/resize/radius) and re-evaluate in real time; the op is swappable; results support holes/even-odd and can drive a mask.
- FlashFX today: Ops REPLACE inputs 'Pathfinder-style' (editor.ts:2298-2299), originals deleted; holes dropped, outer ring only (pathOps.ts:129,149-151); no compound/booleanGroup type in the model.
- Depends on: Boolean ops: shortcuts + context menu + Flatten
- Build: New BooleanGroupLayer/CompoundShape type in core/types (children + op). Evaluate children transforms per frame in interpolation.ts:resolveFrame, run pathOps at resolve time, and cache by a config hash (same pattern as resolveClonerField). Extend PolygonShape with holes/innerRings so Subtract/Exclude keep cutouts; add even-odd fill to renderer + pathTessellation. Keyframable inputs feeding a live boolean is exactly the parametric-source model a motion editor wants. Large/late.

**Outline stroke / stroke-to-path** — *missing, relevance medium, effort L*
- Figma: Convert a center-line stroke into a filled, editable outline path — prerequisite for tapering, boolean-cutting, stroke-reveal, and exact SVG.
- FlashFX today: Toolbar 'Stroke to Path' hard-coded disabled:true (Toolbar.tsx:338); GRAYED-MENUS-PHASE2 notes polygon-clipping is boolean-only (no offset/buffer).
- Depends on: a polygon offset/buffer routine (new)
- Build: Lift the existing stroke geometry from pathTessellation.buildStroke into a data-model op: offset the centerline by strokeWidth/2 on both sides with line-join handling → a filled PolygonShape ring, and enable the menu item + editor.ts outlineStroke command. Needed for stroke-reveal/fill/morph effects.

---

## Full gap matrix

Every researched feature, its FlashFX status, and the milestone that delivers it.

| Feature | Status | Relevance | Effort | Milestone |
|---|---|---|---|---|
| On-canvas corner-radius drag handle | missing | medium | S | M1 |
| Independent per-corner radius | missing | medium | M | M1 |
| Boolean ops: shortcuts + context menu + Flatten | partial | high | S | M2 |
| Live dimension/length/angle HUD | partial | high | S | M3 |
| Alt hover-to-measure distance | missing | high | M | M4 |
| Equal-spacing measurement suggestions | missing | high | M | M4 |
| Arrow-key nudge (small/big, configurable) | missing | high | S | M5 |
| Keyboard align/distribute + wire unbound Edit shortcuts | partial | high | S | M5 |
| Command palette + central command registry | missing | high | L | M6 |
| Alt-drag duplicate | missing | high | M | M7 |
| Ctrl+D power-duplicate (repeat last transform) | missing | high | M | M7 |
| Broken/independent bezier handles + mirror modes | partial | high | S | M8 |
| Enter vector edit mode on any primitive | partial | high | M | M8 |
| Bend tool (drag segment/point to curve) | missing | high | M | M9 |
| Delete and heal | missing | high | M | M10 |
| Join selection (weld/close path) | missing | medium | M | M10 |
| Copy/paste properties (all + single) | missing | high | L | M11 |
| Select same / similar | missing | high | M | M12 |
| Deep-select into groups + isolation | missing | high | M | M12 |
| Paste to replace source + paste-in-place wiring | partial | high | M | M13 |
| Reframe constraints (pin/scale) | missing | high | L | M14 |
| Tidy Up (auto row/column/grid) | missing | medium | M | M15 |
| Cloner authoring UI | partial | high | M | M16 |
| Convert text to vector paths (outline text) | missing | high | L | M17 |
| Pencil / freehand draw tool | missing | high | M | M18 |
| Batch rename (tokens + numbering) | missing | medium | M | M19 |
| Rulers with ticks/labels + snap-to-pixel toggle | partial | medium | M | M20 |
| Shared linked styles (color/text/effect) | missing | high | L | M21 |
| Outline stroke / stroke-to-path | missing | medium | L | M22 |
| Non-destructive live boolean group / compound paths | missing | high | XL | M22 |
| Additive/subtractive marquee | partial | high | S | — |
| Align & distribute (present — coverage note) | present | high | S | — |
| Precomp as component/instance analog (partial — coverage note) | partial | high | L | — |

---

## Already present or partial (no or minimal build)

- **Align & distribute (present — coverage note)** — present. align.ts computeAlignment/computeDistribution/computeSpacing/computeEqualSize; two UIs (MultiSelectInspector Align/Distribute/Size/Spacing tabs + AlignPanel popover); undoable via applyAlignResults (editor.ts:2208). Residual: No build needed — residual gaps only: keyboard shortcuts (covered separately), align-to-key-object, and on-canvas interactive spacing handles (Figma's pink handles) which remain numeric-input only (MultiSelectInspector.tsx:462).
- **Precomp as component/instance analog (partial — coverage note)** — partial. PrecompLayer references a compositionId so multiple precomps of one comp all update on master edit (real propagation) — precomp.ts, types.ts:790-814; but no component concept, no swap-instance/detach/reset, per-instance divergence limited to timeRemap; override applicator exists (core/overrides.ts) but is used only by cloner data-binding. Residual: Extend PrecompLayer with an overrides map consumed at resolve via applyOverrides (the header comment already anticipates this), and add swap-source/reset-overrides actions + a 'new instance of this comp' command (today the only way is copying the layer). This is the closest existing base for Figma-style components.

---

*Generated from the figma-timesavers-gap-plan workflow (run wf_cd30d08c-281). Update this doc as milestones land; check items off and record the actual files touched.*
