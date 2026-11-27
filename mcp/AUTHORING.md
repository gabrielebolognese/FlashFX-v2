# Authoring motion graphics through the FlashFX MCP (v0)

How an agent (Claude Code, Claude Desktop, any MCP client) should build a clean, editable piece in
FlashFX. Everything here was learned building the three reference pieces in `mcp/examples/`
(kinetic title, lower third, logo reveal); see `docs/MCP-AUDIT.md` for the full friction log.

The contract: **Claude builds it, FlashFX renders it, the owner can open and edit it.** So every
build ends with an `.ffx` project file, not only an MP4.

Start with the taste layer: [`TASTE.md`](./TASTE.md) (measured timing, easing, type and colour rules) and the
recipes (`list_recipes` / `apply_recipe`, section 13), which build the common moves with those numbers. This
guide is for everything the recipes do not cover and for retouching what they build.

## 0. Session

- Register the server once: `claude mcp add flashfx -- node mcp/flashfx-mcp.mjs` (see `mcp/README.md`).
- For long or production sessions build first and serve `dist`: `npm run build`, then
  `--server dist`. The default `dev` server works but its cold start is slow (about 35-50 s for the
  first `create_project`, about 10 s for the first text batch and the first `seek`) and Vite can
  reload the tab.
- Start with `list_features` (optionally `{ area: "text" }`): it lists every action id with its
  real parameter names, enums and live preset catalogs. Only those ids are accepted.
- After changing `src/agent/featureManifest.ts`, run `npm run agent:manifest`, otherwise
  `list_features` serves the stale generated `public/agent/features.json`.

## 1. Composition setup

```json
{ "name": "create_project", "arguments": { "name": "Launch title", "format": "long", "frameRate": 30, "durationFrames": 120, "clipLength": "comp" } }
```

- `long` = 1920x1080, `short` = 1080x1920. 30 fps is the house default.
- Background: the comp background is a stack. Add one layer and style it (colours are RGB 0..1,
  `radial` uses normalized `centerX/centerY/radius`):

```json
{ "actionId": "editor.addBackgroundLayer", "args": [] }
{ "actionId": "editor.updateBackgroundLayer", "args": { "id": "$0.result", "updates": { "type": "radial", "centerX": 0.5, "centerY": 0.46, "radius": 0.75,
  "stops": [ { "color": [0.09, 0.1, 0.13], "position": 0, "opacity": 1 }, { "color": [0.015, 0.016, 0.02], "position": 1, "opacity": 1 } ] } } }
```

- **Clip length (important).** Pass `clipLength: "comp"` to `create_project` and every new layer
  spans the whole composition (kept for the session, also across `create_project` calls; switch any
  time with `editor.setDefaultClipLength { mode: "comp" | "default" }`). Without it new layers are
  4-second clips like in the UI, and in a longer comp they vanish after 4 s unless you stretch them:

```js
const st = await call('get_state');
await call('run_actions', { actions: st.layers.map((l) => ({ actionId: 'editor.updateLayerProperty', args: { layerId: l.id, path: 'outPoint', value: DUR } })) });
```

## 2. Layers: naming and stacking

- `renameLayer` every layer with its role: `Title line 1`, `Card`, `Accent bar`, `Avatar`,
  `Spark burst`. The owner edits by name; a timeline of `Text 1`, `Rectangle 3` is not editable in
  practice.
- **Create back to front.** The renderer stacks by timeline track: a new layer drops onto the
  top-most track that has room at its time range, else onto a new track on top. Plan the order:
  background shapes first, then text, then foreground accents. `editor.reorderLayers` only reorders
  the layer LIST and does NOT change what draws on top. To lift layers built earlier above everything
  (a title, a flash, a cursor after the next shot's ground), use `agent.bringToFront { layerIds }`:
  each goes onto its own new top track, in their current order, one undo step, no timing change.
- Need a size from a layer you have not created yet (a card sized to its text)? Measure the string
  first with `agent.measureString { text, fontFamily, fontSize, fontWeight, fontStyle, letterSpacing }`
  (no layer is created; same layout code as the renderer), size the card, then create back to front.
- `get_state` lists `layers` (with `trackId` and the `animProps` each one carries), the
  `background` stack (ids, types) and the timeline `tracks`.
- **Parenting** (`editor.setLayerParent`) keeps the child's LOCAL position, so after parenting the
  child's position is an offset from the parent: set it explicitly (e.g. `[0, 4]` to centre
  initials on an avatar). After Effects keeps the world position; B34 will.
- In `run_actions`, `"$0.result"` / `"$0.activeLayerId"` reference earlier results in the same batch.

## 3. Timing grid (30 fps)

| Beat | Frames | Notes |
| --- | --- | --- |
| Head | 4-8 | Never start motion on frame 0; give the eye a beat. |
| Entrance | 14-26 | Fast-out ease (expo / quint out). |
| Stagger | 3-10 | Per word or element; tighter for small type. |
| Hold | 30+ | At least 1 s of readable rest per message. |
| Exit | 12-20 | Ease-in (quart in / custom `0.7, 0, 0.84, 0`), slightly faster than the entrance. |
| Tail | 6-10 | Empty frames at the end for a clean cut. |

Overlap things: the next element starts while the previous one is still settling (offset 4-10
frames). Nothing should start and stop together.

## 4. Easing

**Use `editor.setKeyframes` (B46).** One call writes a whole curve on one property, every keyframe
with its OWN outgoing ease, as one undo step:

```json
{ "actionId": "editor.setKeyframes", "args": { "layerId": "<id>", "propertyPath": "transform.position", "keyframes": [
  { "frame": 6,  "value": [960, 640], "ease": [0.16, 1, 0.3, 1] },
  { "frame": 26, "value": [960, 540], "ease": "hold" },
  { "frame": 70, "value": [960, 540], "ease": "quartIn" },
  { "frame": 84, "value": [960, 420] } ] } }
```

- `ease` shapes the segment from that key to the NEXT one (the last key's ease is ignored):
  `"linear"` (default), `"hold"` (step), `"spring"`, any named ease from the `easings` catalog
  (`expoOut`, `circOut`, `backOut`, `elasticOut`, ...), a CSS keyword (`"ease"`, `"ease-in"`,
  `"ease-out"`, `"ease-in-out"`) or a cubic-bezier quad `[x1, y1, x2, y2]` (CSS semantics; y may go
  above 1 or below 0 for an overshoot pop). Reference timing sheets (`refs/rNN/timeline.json`) carry
  fitted quads: pass them straight in. The breakdown / easings.net names work too (B67): `easeOutCubic`
  = `cubicOut`, `easeInOutQuart` = `quartInOut`, `easeIn` / `easeOut` / `easeInOut` = the CSS keywords,
  `easyEase` = After Effects' Easy Ease `[0.333, 0, 0.667, 1]` (case, spaces, `-` and `_` are ignored).
- Without `merge` the keys REPLACE the property's keyframes; `"merge": true` keeps keys at other
  frames. A bad path, ease or value shape is an error and nothing is applied.
- Works on every animatable path, including the colour and effect paths in sections 6 and 8.

The older per-keyframe tools still work (useful to retouch one key):

1. **Custom cubic-bezier (CSS semantics).** A segment from keyframe A to keyframe B uses
   `A.handleOut = [x1, y1]` and `B.handleIn = [x2, y2]`, i.e. `cubic-bezier(x1, y1, x2, y2)`:

```json
{ "actionId": "editor.setKeyframeInterpolation", "args": ["<layerId>",
  [ { "propertyPath": "shape.width", "frame": 8 }, { "propertyPath": "shape.width", "frame": 34 } ],
  "bezier", [0.1, 1], [0.2, 0.9] ] }
```

   Argument order is `handleIn` then `handleOut`, so pass `[x2, y2]` before `[x1, y1]`. The call
   writes the SAME pair on every target, so for different eases per segment make one call per
   segment (target its two keyframes). `mcp/examples/lib/mcp-client.mjs` has a `keyframes()`
   helper and an `EASE` table.

2. **Named eases** (`editor.setKeyframeEasing`, catalog `easings`): `expoOut`, `quintOut`,
   `backOut` (true overshoot), `elasticOut`, `bounceOut` ... applied to the keyframe that STARTS the
   segment. A named ease wins over bezier handles.

House eases:

| Use | Curve |
| --- | --- |
| Entrance, UI card | `cubic-bezier(0.2, 0.9, 0.1, 1)` or `expoOut` `0.16, 1, 0.3, 1` |
| Text reveals | `quintOut` `0.22, 1, 0.36, 1` |
| Moves between two rests | `expoInOut` `0.87, 0, 0.13, 1` |
| Exits | `0.7, 0, 0.84, 0` or `quartIn` `0.5, 0, 0.75, 0` |
| Pops (logo, avatar) | named `backOut`, or overshoot keyframes (scale 1.12 then 1.0) |
| Hold / cut | `interpolation: "hold"` on the keyframe before the jump |

Never leave real motion on linear (the default for `addKeyframe`), except progress bars.

- **Motion along a curve:** `agent.setMotionPath { layerId, nodes, options }` sets the nodes (comp
  px) and the timing in one call: the layer leaves node 0 at `startFrame` (default its in-point) and
  arrives at the last node at `endFrame` (default its last frame). Handle-less nodes are auto-smoothed
  into a flowing curve (`smooth: false` = straight segments); `{ x, y, in: [dx, dy], out: [dx, dy] }`
  gives exact bezier handles. `ease` takes any setKeyframes ease (default linear = constant speed),
  `orientToPath: true` turns the layer along the tangent (arrows, planes, comets), `loop` /
  `pingPong` keep it going, `closed: true` closes the loop. While the path exists it replaces the
  layer position; call it again to reshape or re-time, `nodes: []` removes it. Motion blur follows.
  (`editor.addMotionPath` only attaches an EMPTY path for the user to draw.)

## 5. Text

- `editor.createQuickText { x, y, text }`: x is the CENTRE of the text, y the centre of the line
  box. For all caps at size S the glyphs span roughly `y - 0.68 S` (cap top) to `y + 0.11 S`
  (baseline), so mixed-case words sit about 0.15 S high.
- **Place by what the eye sees (B67):** after styling (font, size, weight), call
  `agent.placeText { layerId, y, x?, anchor? }`: `anchor` `"inkCenter"` (default) puts the visible
  glyph ink centre on y, `"baseline"` the first line's baseline, `"box"` the line-box centre. It
  measures in the real face and shifts keyframed position as a whole (motion kept), one undo step.
- Text layout ignores leading / trailing spaces: padding a string with spaces does not move it. Use
  x, `agent.placeText` or a fixed box.
- **Outline text (B64):** fill `content.spans.0.style.color` `[r, g, b, 0]` plus
  `content.spans.0.style.strokeColor` and `content.spans.0.style.strokeWidth` (px). A gradient fill
  (`content.spans.0.style.fill = { kind: "linear", angle, stops }`, angle 0 = left to right, 90 = top
  to bottom) spans the whole text, also on animated / accent-styled text.
- Set the size in BOTH places: `animOverrides.fontSize.defaultValue` (what renders, animatable)
  and `content.spans.0.style.fontSize`. Line height: `content.spans.0.style.lineHeight` now also
  sets the unkeyed `animOverrides.lineHeight` the renderer reads (B72; it used to be ignored); key
  `animOverrides.lineHeight` to animate it. Colour, weight, family: `content.spans.0.style.*`.
  Tracking: `animOverrides.letterSpacing.defaultValue` (px).
- **Measure, do not guess:** `measure_text { layerId }` returns the centre, the ink box
  (`left/right/top/bottom`), per-line widths and line height, exactly as the renderer lays it out.
  `ink` is the LINE box (advance width x line height, unscaled): taller than the letters. To hug the
  visible letters (a pill, highlight, underline, mask or the cap band of a pixel face like VT323) use
  `glyphInk` (`left/right/top/bottom/width/height/centerX/centerY`, comp px, layer scale included,
  within about 1 px of the rendered pixels) and `baselines` (comp y per line).
  Left-align by putting the centre at `left + ink.width / 2` (`horizontalAlign` alone does nothing
  on an auto box). In a fixed / fixedWidth box (`layoutConfig.boundingBox`) `horizontalAlign` aligns
  inside the box, and animated or accent-styled glyphs land exactly where the static text does.
  A fixedWidth box is 200 px tall and clips there: for more lines use `{ type: "fixed", width, height }`
  (a line that starts inside the box but overflows it is clipped statically, drawn whole when animated).
- Accent word: `editor.styleTextWord { wordIndex, style: { color, fontStyle } }` or
  `editor.styleTextRange { start, end, style }`.
- Per-word / per-character motion: apply a preset, then tune it in place:

```json
{ "actionId": "agent.applyTextAnimatorPreset", "args": { "layerId": "<id>", "presetId": "rise-fade-word", "startFrame": 6, "durationFrames": 26, "replace": true } }
{ "actionId": "editor.updateLayerProperty", "args": { "layerId": "<id>", "path": "animators.0.delta", "value": { "position": [0, 174] } } }
{ "actionId": "editor.setKeyframeInterpolation", "args": ["<id>", [ { "propertyPath": "animators.0.offset", "frame": 6 }, { "propertyPath": "animators.0.offset", "frame": 32 } ], "bezier", [0.36, 1], [0.22, 1]] }
```

  Words rising out of a line: delta position about one line height, no opacity delta, plus a
  rectangle mask around the line (section 7). `motionBlur: true` streaks each glyph.
- Reveal presets (everything except `color-wave` and `delete-char`) hide every unit, the first
  included, up to `startFrame`; no opacity hold is needed.
- Per-glyph animators work on any text: hard line breaks (`"two\nlines"`), wrapped boxes and fixed
  boxes. A multi-line caption is ONE layer; `rise-fade-word` / `cascade-word` run word by word across
  the lines, `rise-line` line by line.
- More animator deltas (all `animators.<i>.delta.*`, scaled by the selector weight):
  `fillColor` `[r, g, b, a]` (each glyph mixes from its colour towards it; `color-wave` preset),
  `skew` (degrees, positive leans the top right), `scatter` `[x, y]` px (each unit flies from its own
  seeded random offset; `scatter-in` preset), plus position, scale, rotation, blur, opacity, tracking.
- Seeded random order: `animators.<i>.selector.randomizeOrder: true` + `selector.seed` (frame-pure:
  the same seed always gives the same order).
- Keyframe the selector window itself (AE "Start / End", like Offset): `editor.setKeyframes` on
  `animators.<i>.start`, `animators.<i>.end` or `animators.<i>.offset` (created on first use):

```json
{ "actionId": "editor.updateLayerProperty", "args": { "layerId": "<id>", "path": "animators.0.selector.randomizeOrder", "value": true } }
{ "actionId": "editor.updateLayerProperty", "args": { "layerId": "<id>", "path": "animators.0.delta.fillColor", "value": [0.78, 1, 0.24, 1] } }
{ "actionId": "editor.setKeyframes", "args": { "layerId": "<id>", "propertyPath": "animators.0.end", "keyframes": [ { "frame": 0, "value": 0, "ease": "expoOut" }, { "frame": 24, "value": 1 } ] } }
```

- Type and delete in a centred field (search bar): `type-on` then `delete-char` (one animator each,
  stacked, or keyframe one offset up then down), and set the layer path `reflowHidden: true` so the
  visible characters stay centred as they appear / vanish (off by default, like After Effects).
  Delete from the left instead: an animator with `shape: "rampDown"`, start 0, end 0.001, delta
  opacity -1 and its offset keyed -0.001 to 1.

### Fonts (B52)

- Pick the face with `content.spans.0.style.fontFamily` / `.fontWeight` / `.fontStyle` (an accent
  word: `editor.styleTextWord { style: { fontFamily, fontWeight, fontStyle } }`). The exact family
  names are in `list_features` -> `catalogs.fontFamilies` (`compact: false` adds each family's
  bundled weights and italics).
- Bundled families (SIL OFL; licences in `public/fonts/LICENSES.md`). The ones marked lazy load
  on first use; `render_frame`, `export_mp4`, `seek` and `measureString` wait for them:

| Family | Weights | Italic | Look / use |
| --- | --- | --- | --- |
| Inter | 400, 500 (lazy), 600 (lazy), 700 | oblique | neo-grotesque UI / titles; medium 500 and semibold 600 are real faces |
| Inter Tight (lazy) | 400, 500, 600, 700 | oblique | tight neo-grotesque titles (SF Pro Display feel) |
| Archivo Expanded (lazy) | 400, 500, 600, 700, 800 | oblique | wide grotesque titles ("Motion Designer." look) |
| Montserrat Alternates (lazy) | 400, 500, 600, 700, 800 | oblique | geometric with single-storey a, curly y, curved-foot t |
| Unbounded (lazy) | 400, 700, 900 | oblique | wide rounded heavy display ("make") |
| Nunito (lazy) | 400, 700, 900 | oblique | rounded friendly sans |
| Instrument Serif (lazy) | 400 | **true italic 400** | condensed high-contrast serif accent words |
| Playfair Display | 400, 700 | **true italic 400, 700** (lazy) | classic high-contrast serif accents |
| Damion (lazy) | 400 | - | monoline brush script accents (Yellowtail class) |
| VT323 (lazy) | 400 | - | thin pixel / LCD ("404 NOT FOUND.") |
| Silkscreen (lazy) | 400, 700 | - | blocky 8-bit pixel caps |
| Space Mono (lazy) | 400, 700 | oblique | wide-tracked mono caps |
| Roboto, Open Sans, Lato, DM Sans, Manrope, Plus Jakarta Sans | 400, 700 | oblique | workhorse sans |
| Montserrat, Poppins, Raleway, Space Grotesk, Oswald | 400, 700 | oblique | display sans |
| Bebas Neue | 400 | - | condensed all-caps |

- A weight between bundled faces resolves like CSS: 500 asks for 500, else 400; 600 asks for 600,
  else 700; 300 falls to 400 only when nothing lighter exists. 600+ on a family whose nearest
  face is lighter is a synthesized bold. "oblique" = italic is the upright face sheared (looks
  fake on serifs): use Instrument Serif or Playfair Display for italic accents. Italic / oblique
  overhangs (an f hook, a j tail, a leaning serif) are never clipped (B43): the raster grows by the
  measured ink, so there is no need to pad the box or add trailing spaces; the layout box and
  `measure_text` are unchanged.
- **Any other face:** `import_font { path, family? }` (WOFF2 / WOFF / TTF / OTF), then use the
  returned `result.family`. WOFF2 has no readable name table here, so pass `family`. For a real
  Bold / Italic import each file under the same family with `weight` / `style`
  (`import_font { path: ".../Foo-Bold.woff2", family: "Foo", weight: 700 }`). Imported fonts live
  in the browser font library (IndexedDB, every project in that browser); they are NOT inside the
  `.ffx`, so a project using one needs the font imported again on another machine.

```json
{ "actionId": "editor.updateLayerProperty", "args": { "layerId": "<id>", "path": "content.spans.0.style.fontFamily", "value": "Archivo Expanded" } }
{ "actionId": "editor.updateLayerProperty", "args": { "layerId": "<id>", "path": "content.spans.0.style.fontWeight", "value": 800 } }
{ "actionId": "editor.styleTextWord", "args": { "layerId": "<id>", "wordIndex": 2, "style": { "fontFamily": "Instrument Serif", "fontStyle": "italic" }, "exclusive": true } }
```

- **Number counters (B75).** `agent.setTextCounter { layerId, counter: { from, to, startFrame, endFrame, compact?,
  decimals?, separator?, decimalMark?, prefix?, suffix?, ease?, stepFrames?, spanIndex? } }`: one span of a styled
  text layer counts from `from` to `to` (r08 "+10K -> 1.2M views"). The span keeps its font / italic / colour; a
  prefix in another style goes in its own span (`editor.styleTextRange`) and `spanIndex` points at the number span.
  `compact: true` gives 10K / 1.2M / 3.4B (`compactDecimals`, default 1); otherwise `separator` (",") and `decimals`.
  `ease` is a name from core/easings.ts ("cubicOut" default, "expoOut" for fast-then-settle) or a cubic-bezier quad;
  `stepFrames: 2` counts on twos. Frame-pure. measure_text reads the stored text, so place the layer with the widest
  value typed in, then set the counter. Recipe: `count-up`. `counter: null` removes it.

- **Typeface switch (B77).** `agent.setTextStyleKeys { layerId, keys: [{ frame, fontFamily?, fontWeight?, fontStyle? }],
  spanIndex? }` hold-keys the face: at each key frame the word snaps to that family / weight / italic and re-flows
  (r10 type-style switcher f674-735). Missing fields carry over from the previous face; before the first key the stored
  style shows. Use bundled faces or `import_font` first. `keys: null` removes them.

## 6. Shapes and colour

- `editor.addShapeLayer { opts: { type, x, y, width, height, fill, radius, name, stroke?, strokeWidth? } }`
  (B46): one undo step, x / y are the CENTRE, colours RGBA 0..1, NO stroke unless you pass one, and it
  returns the new id. Use it instead of `addShapeWithDimensions` (which adds the UI's 1 px grey stroke:
  you would have to zero `shape.strokeWidth.defaultValue`). `type: "circle"` with width != height is a
  true ellipse (B63): `shape.radius` = width / 2, `shape.radiusY` = height / 2, scale 1, both keyframable. A
  circle layer with a non-uniform `transform.scale` also draws as an ellipse. `type: "polygon"` takes `sides`
  (default 6) for a regular polygon inscribed in width x height (a hexagon is `sides: 6`, no star trick).
- **What the SDF shapes guarantee (B63).** A circle draws at exactly its radius. A stroke is centred on the
  edge and never clipped (rings stay round, pill outlines keep their ends: no `convertShapeToPath` or
  stacked-pill workaround needed). Corner radii scale with the layer and its parents (a big pill under a
  scaled-down null keeps round ends: no "half size, scale 2" trick) and clamp to half the short side (a
  circle-to-pill radius key never needs guarding). A stadium / pill is `radius` >= height / 2.
- **Colour keyframes (B33).** `shape.fillColor`, `shape.strokeColor`, `text.color`,
  `text.strokeColor`, `glow.color`, `shadow.color` take RGBA keyframes through `editor.setKeyframes` /
  `editor.addKeyframe`. Mixing is in linear light (black to white passes a clean mid grey, no muddy
  dip); `"hold"` gives exact swaps (toggle off to on, a word flipping colour on the beat):

```json
{ "actionId": "editor.setKeyframes", "args": { "layerId": "<toggle>", "propertyPath": "shape.fillColor", "keyframes": [
  { "frame": 0,  "value": [0.78, 0.8, 0.84, 1], "ease": "hold" },
  { "frame": 42, "value": [0.18, 0.75, 0.1, 1], "ease": "cubicOut" },
  { "frame": 50, "value": [0.7, 0.97, 0.15, 1] } ] } }
```

  The static colour (`shape.fillColor`, `content.spans.0.style.color`) stays the value before the
  first key. The keys live under `layer.animProps` and show in the timeline under "Animated". A
  material / gradient fill on a shape wins over the flat fill colour.
- Grow from an edge: keyframe `shape.width` and `transform.position` together on the same ease
  (the centre moves by half the width). Start at width 0, not 2 (a 2 px stub is visible).
- Circles: `shape.radius`. A ring: `shape.fillColor` `[0, 0, 0, 0]` plus `shape.strokeColor` and an
  animated `shape.strokeWidth`.
- Trim-path line draws: `editor.addShapeModifier { type: "trim" }`, keyframe `modifiers.0.end`.
  Progress rings from 12 o'clock (B67): stroked circle > `editor.convertShapeToPath` > trim >
  `agent.setTrimStartAngle { layerId, angle: 0 }` (clock degrees, clockwise) > keyframe
  `modifiers.0.end` 0 -> 1.
- **Shape morphs (B62)**: `editor.setShapeMorph { layerId, poses: [{ frame, shape, ease }], align? }`
  turns any shape layer into a path whose outline morphs through the poses. `shape` (layer-local px,
  centred on the layer position): `{ type: "rectangle", width, height, radius? }`,
  `{ type: "ellipse", width, height }`, `{ type: "star", width, height, points?, innerRatio? }`,
  `{ type: "polygon", width, height, sides? }`, `{ type: "path", points: [[x, y], ...], closed? }`.
  `ease` shapes the morph to the NEXT pose (same vocabulary as `setKeyframes`; `backOut` or a quad
  with y > 1 overshoots the outline for a pop; `"hold"` snaps). Auto-alignment (default) keeps
  outlines from twisting; different vertex counts morph. `align: "vertices"` (B76) instead moves each
  vertex (and its handles) straight to the same-index vertex of the next pose, like an After Effects path
  keyframe: use it for anchor drags and letter edits (corners stay sharp mid-move; same vertex count
  needed, else it falls back to the matched morph). For the heavy-morph look, pair it with
  scale / rotation keys on the same eases and a `shape.fillColor` colour key:

```json
{ "actionId": "editor.setShapeMorph", "args": { "layerId": "<id>", "poses": [
  { "frame": 0,  "shape": { "type": "rectangle", "width": 220, "height": 220, "radius": 24 }, "ease": [0.65, 0, 0.35, 1] },
  { "frame": 18, "shape": { "type": "star", "width": 300, "height": 300, "points": 6, "innerRatio": 0.5 }, "ease": "backOut" },
  { "frame": 36, "shape": { "type": "ellipse", "width": 240, "height": 240 } } ] } }
```

- **Conic gradients (B74).** `editor.updateLayerProperty { layerId, path: "materialConfig", value: { enabled: true,
  layers: [{ id: "w", type: "conic", angle: 0, blendMode: "normal", opacity: 100, colorStops: [{ id: "a", color:
  "#ff0000", opacity: 100, position: 0 }, ..., { id: "z", color: "#ff0000", opacity: 100, position: 100 }] }] } }`
  sweeps the stops clockwise from `angle` (degrees, 0 = 12 o'clock) around the shape centre (or `centerX` /
  `centerY`, 0..1 in the shape box). Repeat the first colour at 100 for a seamless hue wheel. A ring: a circle with
  no fill and a thick stroke, with the same layers on `strokeMaterialConfig`. Spin it by keying `transform.rotation`
  (r08 spinning hue ring, f145-1057).
- **Materials on any shape (B63).** `materialConfig` (linear / radial / conic) now renders on rectangles,
  ellipses, stars AND path / morph / polygon shapes (a morph used to fall back to the flat first colour), per
  pixel across the shape's box. The model's units are percent (`opacity` 0..100, stop `position` 0..100); a
  layer written in 0..1 fractions (every opacity <= 1, or positions ending at exactly 1) is read as fractions,
  and missing ids / opacities / positions or `[r, g, b, a]` colours fall back to defaults instead of making the
  shape vanish. A soft radial glow blob: a circle with `{ type: "radial", colorStops: [{ color: "#33389a",
  opacity: 100, position: 0 }, { color: "#33389a", opacity: 0, position: 100 }] }` (no gaussian blur needed).
- Self-touching outlines fill correctly (B63): a sunburst of wedges that all return to one centre point works
  as a single `setShapeMorph` path pose (no second dummy pose).

## 7. Masks

- `editor.addMask { layerId, type: "rectangle" }`, then `get_layer` to read the new mask id (the
  last entry of `masks`).
- Mask position and size are COMPOSITION pixels (not layer-local) and do not move with the layer.
  That is what makes "rise out of a fixed window" and "slide out from behind the logo" work: animate
  the layer, keep the mask still.
- `editor.updateMaskProperty { path: "position.defaultValue" | "size.defaultValue" | "feather.defaultValue" | "mode" }`;
  keyframe with `editor.addMaskKeyframe`. Masks now clip animated and accent-styled text too.
- **Pixel-block dissolve / build-on (B54).** `agent.pixelBlockReveal { layerId, options: { direction: "in" | "out",
  startFrame, durationFrames, region?, blockSize?, order?, angle?, jitter?, seed?, stepFrames? } }` appends one intersect
  mask whose keyed `blocks.progress` shows ("in") or hides ("out") whole seeded squares, rendered per pixel on the GPU
  (r01 card dissolve f300-316, build-on f326-358). `region` is comp px, top-left (default the whole comp): pass the layer
  box for `order: "directional"` (sweep, `angle` 0 = left to right) or `"center"` (centre-out) so the sweep spans the
  layer. `stepFrames: 2` steps the blocks on twos (8-bit read). Frame-pure: scrubbing is identical. A blocks mask takes 2
  of the 8 mask slots. Build-on never removes a shown block and dissolve never brings one back; `jitter` (default 0.35)
  mixes randomness into the directional / centre sweeps (0 = a clean wipe of squares, 1 = fully random). The CPU twin
  (`pixelBlockThreshold` + `pixelBlockShown` in `core/pixelBlocks.ts`) says which squares show at a progress;
  `gpu:pixel-blocks` proves the GPU matches it square for square in both directions and all three orders. Recipe: `pixel-dissolve`.
- **8-bit sparkle (B54).** `agent.pixelSparkle { options: { box, color, startFrame, durationFrames, count?, blockSize?,
  margin?, stepFrames?, density?, wander?, seed? } }`: seeded squares flicker and crawl in a ring around `box` (comp px,
  top-left; use the `measure_text` ink box of a word) and never cover it (r07 lime squares around "Video editors!"). Lands
  as a group of square shape layers with hold keys (editable). Recipe: `pixel-sparkle`.

## 8. Effects, images, particles

- **Effects on text and shapes (B57).** `agent.applyLayerEffects { layerId, effects: [{ effect, params? }], mode? }`
  puts an effect stack on any visual layer. A text / shape / video layer is first nested in a precomp
  (it stays editable inside: `editor.enterPrecomp { compositionId }`), and the stack runs on the precomp
  texture, so the layers behind are untouched; the result's `layerId` is the precomp. Ids from
  `src/core/effects/effectRegistry.ts`: `digitalGlitch [amount 0..1]` (row slices + RGB offset: r01 title
  glitch f168-176, use ~0.6-0.9 for 6-8 frames; how it moves: the precomp is cut into 40 horizontal bands,
  the pattern re-rolls every 2 frames, about amount / 2 of the bands slide per roll, each band always by its
  own fixed shift of at most amount x 10 % of the comp width, and R / B split by amount x 6 px. The CPU twin
  `digitalGlitchSlices(amount, frame)` in `core/effects/layerEffects.ts` gives every band's shift for a frame,
  so you can see which bands of a word will slide before rendering; `gpu:layer-effects` proves the GPU
  matches it band for band), `rgbSplit [px]`, `chromaticAberration`, `twirl`, `wave`,
  `ripple`, `pixelate`, and `bulge [amount -1..1, centreX, centreY, radius]` with the centre in UV of
  the precomp (= comp px / comp size) and the radius as a fraction of the comp height (radius 0 =
  centred, the old behaviour): a word bulges in place (r05 "hope i make it out of here"). Key any param
  with `editor.setKeyframes { layerId: <precomp>, propertyPath: "effect.<type>.<i>" }`, e.g.
  `"effect.245.0"` = glitch amount (0 = no effect), `"effect.215.1"` / `".2"` = bulge centre (it moves).
  Precompose itself is exact now (B57): the precomp sits at the comp centre, has no background, and
  its anti-aliased edges composite like the original layers (pixel-identical in `gpu:layer-effects`).
- Motion blur: `updateLayerProperty(id, "motionBlur", true)`. Preview shows a few stepped copies;
  export uses 16+ samples and is smooth. The blur follows the layer's WORLD motion (B66): motion that
  comes from a parent / camera null (move, zoom, turn, a parent's motion path or Position expression)
  blurs exactly like the same motion keyed on the layer, so put the switch on the layers you see, not
  on the null. A layer that enters while its rig is already moving smears on its first frame. For a
  longer smear raise `editor.setCompositionSetting("shutterAngle", 270-360)` or the layer's
  `motionBlurShutter` (180 = neutral); expression-driven motion itself (wiggle, time * n) does not blur.
- Glow: `editor.enableLayerEffect { kind: "glow" }`, then `glow.color`, `glow.radius`,
  `glow.intensity`, `glow.threshold`. On text and shapes the first glow is the layer's own colour at
  threshold 0 (B67: the old white glow at 0.6 vanished on saturated colours); images and video keep
  the bloom default (threshold 0.6). Keep intensity low (about 0.5) on bright artwork or it blows out.
- **Animated effects (B47 / B50).** Enable the effect first, then keyframe its path with
  `editor.setKeyframes` / `editor.addKeyframe`:
  - glow: `glow.intensity`, `glow.radius`, `glow.threshold`, `glow.color` (a glow pulse on a logo
    landing: intensity 0 -> 1.6 -> 0.6 with `expoOut` then `sineInOut`);
  - shadow: `shadow.lightDistance`, `shadow.lightAngle`, `shadow.blurRadius`, `shadow.shadowScale`,
    `shadow.color`;
  - layer blur: `blur.radius` (gaussian, px), `blur.strength`, `blur.angle`. A blur-in reveal:
    `enableLayerEffect { kind: "blur" }`, then `blur.radius` 24 -> 0 with `expoOut` together with
    opacity 0 -> 1. A gaussian keyed to radius 0 drops the pass, so the settled frames are sharp and
    cost nothing;
  - effect-stack params: `effect.<type>.<paramIndex>`, the same type id / index as
    `editor.setLayerEffectParam` (which adds the effect). E.g. an adjustment layer's pixelate size,
    RGB split amount or invert amount ramping. The effect stack lives on image, adjustment and precomp
    layers (text / shape layers get one through `agent.applyLayerEffects`, above).
  These render byte-identically to the same values set statically (`npm run gpu:anim-props`).
- Images and logos: `import_image { path, rasterSize?, x?, y? }` imports PNG / JPEG / WebP / GIF /
  SVG (rasterized) and places it. Scale it with `transform.scale` = target px / `result.width`.
- **Video and audio (B49).** `import_media { path, place?, fit?, x?, y? }` imports an MP4 / MOV /
  WebM / MKV clip, an MP3 / WAV / M4A / AAC / OGG / FLAC track or an image, streamed into the tab
  in 4 MB chunks (big clips are fine), persisted with the project and carried by `export_project`.
  By default a video is placed at the comp centre and fitted to the canvas (pass `x` / `y` to place
  it unscaled at a point, or `fit: false`); audio becomes an audio layer from frame 0. The result
  has `kind`, `assetId`, `duration` (s), `width` / `height`, `frameRate`, `compFrames` (clip length
  in comp frames) and `activeLayerId`. A clip inside a card or a portal (r05, r07): place it, size it
  with `transform.scale`, then mask it or nest it in a precomp. Without the MCP bridge: `agent.importMedia` takes
  `{ fileName, data }` (base64) or `{ fileName, uploadId }` after staging the bytes with
  `__ffxAgent.writeUpload(uploadId, offset, base64)`; place with `editor.addVideoFromAsset` /
  `editor.addAudioFromAsset` / `editor.addImageFromAsset`. `render_frame` decodes the exact
  source frame at full resolution (the exporter path), so side-by-sides of footage are true.
- **Clip timing (B65).** Every import lands at frame 0. Time a clip with ONE call:
  `agent.setClipTiming { layerId, timing: { startFrame?, endFrame? | durationFrames? | sourceEnd?, sourceStart?, speed?, reversed?, moveKeyframes? } }`.
  Frames are comp frames (`endFrame` exclusive); `sourceStart` / `sourceEnd` are seconds of the source file
  (`sourceStart: 2.5` = the clip opens on the source's 2.5 s mark); `speed` 0.01-100 (a speed change alone
  keeps the source range, so the clip gets shorter or longer); `reversed` plays that range backwards. Unset
  fields keep their value. It returns the applied `inPoint` / `outPoint` / `sourceStart` / `sourceEnd` /
  `speed` plus `warnings` (e.g. the clip runs past its source end and holds the last frame). Placement is
  exact: video tracks are magnetic by default (clips packed from frame 0; `get_state().tracks[].magnetic`),
  and the clip's track turns absolute first, so the clip stays where you put it through later imports,
  edits and a reload, and nothing else moves; an overlap on the same track moves the clip to a new track
  directly above. Keyframes are comp frames: `setClipTiming` moves them with the clip when its start moves
  (`moveKeyframes: false` keeps them). Order: import every clip, then time each one (any order works now).
  `editor.moveClipInTime { layerId, newInPoint }` is also exact (keeps the length, does not move keyframes);
  `editor.setTrackCompressed { trackId, compressed }` turns a track's magnetism on / off. The old workarounds
  (each clip at frame 0 padded with a frozen head, opacity hold keys) are no longer needed.
- **Track matte over a video (B65).** The matte is the layer directly above in the stack, and a shape created
  after a video can land on a track below it. Name the matte:
  `editor.setTrackMatte { layerId: videoId, mode: "alpha", matteLayerId: shapeId }` re-stacks so the shape is
  directly above the video (each on its own track, no clip changes time) in the same undo step. A rounded
  rectangle matte gives a webcam card its rounded corners. The matte layer never draws on its own (also on frames
  where the matted clip is off screen), so a comp-long matte shape is fine.
- Particles: `editor.addParticleLayer`, then
  `agent.configureParticles { layerId, presetId, overrides, seed }` (one undo step; overrides are
  `EmitterConfig` fields, e.g. `{ spawnRate: 0, burstCount: 140, emitterShape: "circle" }`).
  A burst fires on the layer's first frame: time it with `editor.moveClipInTime { newInPoint }`.

- **Cloner rings of different items (B60).** `editor.selectLayer [<first item>]`, `editor.addCloner`, then
  `editor.updateLayerProperty { layerId: <cloner>, path: "distribution", value: { type: "radial", ... } }` (or a
  grid / path); `agent.setClonerSources { layerId: <cloner>, sources: [id1, id2, ...] }` makes copy i draw
  sources[i mod n] (a ring of different photos, r04 f432-529; an orbit of different chips, r08 f12-157). The
  listed layers are hidden like the main source and stay editable (restyle one and every copy of it follows);
  the main source still drives the stagger. Put the main source at the comp origin (0, 0): the cloner adds the
  main source's position to every copy (the other sources' positions are ignored, so they can stay anywhere).
  `sources: []` goes back to one source.
  - **Mixed sizes.** Every other source keeps its own scale, rotation and opacity relative to the main source's
    settled transform (its value after its last key). Photos of different resolutions: scale each image layer to
    the tile size (`transform.scale.defaultValue`) and every copy of it keeps that size; a source at the main
    source's scale draws exactly like the main one. An intro pop on the main source (scale 0 -> 1) still pops every copy.
  - **Random mix.** `agent.setClonerSources { layerId, sources, order: "random", seed: 3 }` picks a source per
    copy from a seed (stable while scrubbing; change the seed to reshuffle). The result's `picks` lists the source id
    of the first 24 copies, so you can check which copy shows what without rendering.
  - **Different text / sizes per copy (data binding).** `agent.setClonerData { layerId: <cloner>, data: [{ "w": "Edit" },
    { "w": "Animate" }, { "w": "Export" }], bindings: [{ "propertyPath": "content.spans.0.text", "dataKey": "w" }] }`:
    copy i is the main source with row i mod rows written in (a ring of words, a grid of labels; numeric paths such
    as `shape.width` / `shape.height` give bars of different sizes). Paths are checked against the source (read them
    with `get_layer`). Explicit `sources` win when both are set; `data: []` removes the binding. One undo step each.
  - In the editor: Inspector > Cloner > "Sources per copy" lists, reorders and adds the sources and sets Cycle / Random + seed.

- **B58 gradient-blob field (mesh gradients, cloud floors).** One layer instead of hand-placed blurred ellipses.
  `editor.addBlobField { opts: { mode, colors?, count?, seed?, size?, speed?, warp?, contrast?, floor?, lumps?,
  softness?, billow?, x?, y?, width?, height?, name? } }` returns the layer id (one undo step; default: the whole comp).
  - `mode: "field"`: a full-frame mesh gradient. `count` (1..16, default 7) seeded blobs drift on slow loops and
    blend into each other; blob i takes `colors[i mod n]` (hex strings or `[r, g, b, a]`, at most 8; repeat a colour
    to give it more area). r10 grounds: `colors: ["#f6eee8", "#e85aa6", "#4a6cf0", "#f6eee8", "#e458b0", "#6175ce",
    "#fd5d88"], size: 0.75, softness: 0.6, warp: 0.5`, then try `seed` 0..9 for the arrangement (render_frame each).
    `softness` < 1 = crisper colour regions, > 1 = one smooth wash; `warp` bends the regions into flowing shapes.
  - `mode: "floor"`: a billowing cloud floor. The lumpy soft top edge sits at `floor` (default 0.4) x the layer
    height from the bottom, `lumps` (default 0.12) sets the edge amplitude, `softness` the edge feather, `billow` the
    puffs inside; the colour runs from `colors[0]` at the edge to the last colour at the bottom (default the r06 ramp
    `#215cc4 / #558cdd / #9dbdeb / #e0e9f8`). Everything above the edge is transparent, so it sits over a black
    ground under a UI. r06 rise: key `transform.position` from `[CX, CY + H * floor]` to `[CX, CY]` over 15 f with
    `[0.33, 1, 0.68, 1]` and `transform.opacity` 0 -> 1 over 11 f (the `blob-field` recipe does this).
  - `speed` (default 1, 0 = still) is the drift; the motion is a pure function of the frame (scrub / export match).
    `size`, `warp` and `contrast` are also keyable knobs: `editor.setKeyframes { propertyPath: "patternAnim.scale" |
    "patternAnim.warp" | "patternAnim.contrast" }`. Change anything later with `editor.setBlobField { layerId, patch }`
    (unlisted options keep their value; `mode: "field"` sets floor 0; one undo step).
  - Clip it to a shape (the gradient inside a button or a cursor): put the field directly under the shape and use the
    shape as its track matte (`editor.setTrackMatte`). `editor.addMask` does not take pattern layers yet.
  - In the editor: Canvas toolbar > Pattern, Type "Blob Field" (presets "Mesh Gradient" / "Cloud Floor"), with
    Blobs / Seed / Floor / Lumps / Softness / Billow sliders.

## 8a. UI mocks: typing caret, cursor, UI templates (B35 / B51)

- **Typing caret.** Type the text on, then give it a caret; it sits right after the last revealed
  glyph on every frame (no hand keys), solid while typing and blinking before / after:

```json
{ "actionId": "agent.applyTextAnimatorPreset", "args": { "layerId": "<id>", "presetId": "type-on", "startFrame": 148, "durationFrames": 22 } }
{ "actionId": "agent.setTextCaret", "args": { "layerId": "<id>", "caret": { "style": "block", "color": [0.6, 0.85, 0.16, 1], "blinkRate": 1, "endFrame": 200 } } }
```

  `style`: `bar` (I-beam, 6% of the font size wide), `block` (a character cell, 55%), `underline`.
  Also `width`, `height`, `gap`, `offsetY`, `radius` (px), `blinkRate` (cycles / s, 0 = solid),
  `solidWhileTyping` (default true), `startFrame` / `endFrame` (absolute; the blink starts ON at
  `startFrame`). Later tweaks: `updateLayerProperty(id, "caret.color", [...])`; `caret: null` turns it
  off. Single-line text only. The reveal presets hide every glyph, the first included, until their
  start frame (B45), so an empty field blinks its caret until the first keystroke. B82: `gradient:
  [top, bottom]` draws a vertical two-colour caret (r10 blue -> pink); for exact keystroke timing, an
  eased typing rate or new characters arriving in an accent colour use `agent.setTextTyping` (or the
  whole box: `agent.addPromptBox`, section 17).
- **Cursor.** One call adds it, then script it in time order; every call is one undo step and lands
  as ordinary keys (the group `transform.position` is the hotspot, `transform.scale` the squash):

```json
{ "actionId": "agent.addCursor", "args": { "icon": "hand", "x": 1834, "y": 656, "frame": 252, "size": 64 } }
{ "actionId": "agent.cursorMoveTo", "args": { "cursorId": "$0.result.cursorId", "frame": 252, "x": 1008, "y": 624, "durationFrames": 44, "ease": [0.052, 0.057, 0.232, 0.981] } }
{ "actionId": "agent.cursorClick", "args": { "cursorId": "$0.result.cursorId", "frame": 300 } }
{ "actionId": "agent.cursorIcon", "args": { "cursorId": "$0.result.cursorId", "frame": 320, "icon": "ibeam" } }
```

  The move arrives EXACTLY at `frame + durationFrames` (default: from the distance, 7-14 frames at
  30 fps) with a ballistic ease-out and an arc (`arc`, fraction of the distance, 0 = straight); pass a
  measured cubic-bezier as `ease` to match a reference. The click squashes to `squash` (0.82) ON the
  click frame and adds a "Click ripple" ring layer (`ripple: false` to skip); make the UI react at the
  returned `responseFrame` (click + 2). Icons: `arrow`, `hand`, `ibeam`; the hotspot is the arrow
  tip, the hand's fingertip and the I-beam centre. Keep the cursor outside any "camera" group so it
  stays in screen space.
- The cursor is stacked ABOVE every existing layer (B70), so add it after the shots it clicks in;
  the ripple goes directly under the cursor. Layers you add later can still land above it: finish
  with `agent.bringToFront { layerIds: [cursorId] }` (the rig moves whole). `placement: "fit"` keeps
  the old timeline drop. Renaming the icons is fine: the rig finds them by their outline.
- **UI templates.** `editor.insertAnimationTemplate { id }` at the playhead: `search-bar-typing`
  (pill opens, placeholder, query types on behind a blue caret), `toggle-switch` (a cursor clicks a
  settings toggle: knob slides, track turns green), `chat-bubbles` (received / sent bubbles with
  tails pop from their tails, typing dots), `notification-banner` (drops in, holds, slides away).
  They are plain layers in a group: retype with `agent.setTextContent` (the caret follows), recolour
  with `updateLayerProperty` / `setKeyframes`, retime in the timeline.

## 8b. Perspective: 3D cards, camera moves, corner pin (B53)

The 2.5D render is pixel-proven on the real renderer (`npm run gpu:camera-cards`: card corners land
within 1 px of the camera projection). 2.5D only: flat cards in space, no extrusion.

- **Make a card 3D:** `editor.toggleLayer3D { layerId }` (shape, path shape, text, image, video,
  precomp). It adds the depth paths, all 0, so nothing moves yet. Keying them on a 2D layer errors.
  - `transform.rotationY` (yaw): **+ swings the RIGHT edge toward the camera**, - the left edge.
  - `transform.rotationX` (pitch): **+ tips the TOP edge toward the camera** (the bottom recedes).
  - `transform.rotation` stays the in-plane Z spin; `transform.positionZ`: **+ = away** (smaller).
  - Rotation pivots on the anchor point (the centre by default). Overlapping 3D cards draw nearest
    on top regardless of layer order; a 2D layer between them splits the depth sort (AE rule).
- **No camera layer needed** for tilts: the default camera frames z = 0 at exactly 1:1, so a 3D card
  at z = 0 with no rotation looks identical to the 2D layer. Add `editor.addCameraLayer` (returns the
  id as `activeLayerId`) only to move the view. A fresh camera also frames 1:1: eye at
  (W/2, H/2, -zoom) aimed at (W/2, H/2, 0), zoom = 50 mm = 50 * W / 36 px (2666.7 at 1920 wide).
- **Card swings in on rotationY** (r07 f763-776: from -45 deg, easeOutCubic, 13 frames), pushed back
  in depth as it turns:

```json
{ "actionId": "editor.toggleLayer3D", "args": { "layerId": "<card>" } }
{ "actionId": "editor.setKeyframes", "args": { "layerId": "<card>", "propertyPath": "transform.rotationY", "keyframes": [
  { "frame": 0, "value": -45, "ease": [0.33, 1, 0.68, 1] }, { "frame": 13, "value": 0 } ] } }
{ "actionId": "editor.setKeyframes", "args": { "layerId": "<card>", "propertyPath": "transform.positionZ", "keyframes": [
  { "frame": 0, "value": 120, "ease": "cubicOut" }, { "frame": 13, "value": 0 } ] } }
```

  A swing-away exit is the mirror: 0 -> 45 with an ease-in (`[0.26, 0.06, 0.7, 0.1]`), then cut.
  Text "leaning back" (r05): `rotationX` about 20 to 30 deg settling to 10 with `cubicOut`.
- **Camera beats: `editor.cameraMove`** writes one move in one call and one undo step:
  `{ cameraLayerId, frame, to: { position?: [x, y, z?], pointOfInterest?: [x, y, z?], zoom?,
  orientation?: [rx, ry, rz] }, durationFrames?, ease? }`. The start key holds the camera's current
  value at `frame`, the end key is the target at `frame + durationFrames`, `ease` shapes the move
  (same vocabulary as `setKeyframes`); keys inside the move are replaced, others kept, so beats
  chain. `durationFrames` 0 = one key at `frame`. Push in: move the eye's z toward 0 (-zoom * 0.6 is
  a 1.7x push); orbit / truck: move x and keep the point of interest on the subject. A new camera
  is two-node (`pointOfInterest`); `orientation` is for a one-node camera
  (`updateLayerProperty(camId, "camera.mode", "one-node")`).

```json
{ "actionId": "editor.cameraMove", "args": { "cameraLayerId": "<cam>", "frame": 30, "durationFrames": 24, "ease": "cubicInOut",
  "to": { "position": [1100, 480, -1600], "pointOfInterest": [960, 540, 0] } } }
```

  Fine control: `editor.setKeyframes` on `transform.position` (eye x, y), `transform.positionZ`
  (eye z), `camera.pointOfInterest`, `camera.pointOfInterestZ`, `camera.zoom`.
- **Corner pin (keystone, a screen inside a tilted phone):** `editor.setCornerPin { layerId,
  corners: { topLeft: [x, y], topRight, bottomRight, bottomLeft } }` (comp px, a convex quad; null
  removes it). While pinned the four pins ARE the placement (position / rotation / scale / 3D are not
  applied). Pinned box: a shape's width x height (path shapes: the vertex bounds), a text layer's
  `agent.measureText` `box`, the whole image / video / precomp frame. For a phone screen, precompose
  the screen content and pin the precomp to the four screen corners. Animate pins with
  `setKeyframes` on `cornerPin.topLeft` / `topRight` / `bottomRight` / `bottomLeft` (start the keys at
  the flat corners for an "unfold" or keystone move). Masks on a pinned layer stay in its unpinned
  space; per-glyph text animators are not pinned.

## 9. Check your work

- **Errors name the fix.** A mistyped action id, argument name or enum value comes back with
  `did you mean "..."`; an `editor.*` action on a missing layer id fails (it used to return ok and
  change nothing), and a layer NAME passed as an id names the id to use. Read the error before retrying.

- `seek { frame }` then `screenshot { region: "canvas" }`: the canvas capture hides DOM overlays
  (selection handles, the Flash character) by default. Check at least: mid-entrance, first full
  rest, mid-hold, mid-exit, last frame.
- Look for: elements visible before they should be, stubs (2 px shapes), clipped glyphs,
  overlapping elements, text that runs into shapes, colour blowing out under glow.
- The preview screenshot is the scaled preview canvas (about 1392 px wide in a 1920 window). For
  pixel-true checks use **`render_frame { frame, path, width? }`** (B48): a full-resolution PNG
  rendered offscreen exactly like the exporter (export motion blur, no UI), returned inline too.
  **`render_strip { frames: [0, 8, 16, 24, 40], tileWidth: 480 }`** puts several frames in one
  labelled contact sheet: the fastest way to review a whole move, and to set side by side with
  frames of a reference video at the same frame numbers.

## 10. Save and export

1. `export_project { path: ".../piece.ffx" }`: the editable project (every composition plus
   imported media). This is the deliverable the owner opens in FlashFX (File > Import Project).
2. `export_mp4 { path: ".../piece.mp4", width: 1920, height: 1080 }`: the real exporter.
   A 4 s 1080p piece renders in about 7 s. Comps with video clips export too (B68): the exporter
   and `render_frame` decode their own full-resolution frames (one forward decoder per clip, video
   inside precomps included), so the exported frame at t matches `render_frame(t)`; no need for the
   old render_frame-per-frame fallback (r07's `render_mp4.mjs`). Pass `width` (or `height`) alone and
   the other side follows the comp aspect (540 on a 1080x1920 comp gives 540x960); pass both for an exact size.
3. Optional proof: `import_project { path }` re-opens the `.ffx` as a new project
   (`mcp/examples/verify-roundtrip.mjs`).

`save_project` persists to the app's local storage, the app also autosaves.

## 11. Reference builds

| Script | Shows |
| --- | --- |
| `mcp/examples/build-a-kinetic-title.mjs` | per-word rise out of masks, accent word, motion blur, underline draw-on, type-on caption, staggered exit |
| `mcp/examples/build-b-lower-third.mjs` | measured layout, custom bezier card grow, named back ease pop, parenting, clip-length fix |
| `mcp/examples/build-c-logo-reveal.mjs` | SVG import, glow, particle burst, shockwave ring, wordmark sliding out of the mark through a mask |
| `mcp/examples/build-d-recipe-launch-title.mjs` | recipes only: prompt bar + cursor click, wipe, kinetic title with underline / subtitle / badge on a camera push, end-card lockup (the flashfx-motion skill's worked example) |

Run one: `node mcp/examples/build-a-kinetic-title.mjs <outDir>` (writes PNG checks, `.ffx`, `.mp4`).

## 12. Replicating a reference frame by frame

The taste loop: rebuild a reference video through the MCP, compare frame by frame, refine. The kit in `mcp/lib/`
does the plumbing; the build stays plain MCP calls, so Claude can repeat it.

- `mcp/lib/replica-kit.mjs`: `openReplica({ name, width, height, fps, frames, bg })` starts the MCP server (its
  own headless Chrome; parallel sessions are fine) and creates the comp at the reference's exact size, fps and
  duration on a solid ground. Helpers take **reference frame numbers (1-based)**, the convention of
  `refs/rNN/timeline.json`, and convert (FlashFX frame = reference frame - 1): `keys(id, path, [[f, value, ease]])`,
  `span(id, in, out)`, `shape`, `text`, `mask`, `parent`, `measure`, `renderStrip`, `renderFrame`.
- Each round: `compareFrames(refVideo, [frames], out.png)` renders those frames and tiles reference | replica with
  whole-frame and foreground SSIM (`mcp/lib/pair_grid.py`).
- End: `finish(outDir, { probeFrames })` writes `project.ffx` + `replica.mp4` (real exporter), reloads the `.ffx`
  (import_project, which installs it with `editor.loadDocument`), censuses every layer (name, keyframes, animators,
  masks), renames + undoes one, and byte-compares renders before and after reload (`editability.json`).
- `python -I mcp/lib/compare_replica.py <ref.mp4> <replica.mp4> <outDir> --shots '[["S1",1,262],...]'`:
  `side-by-side.mp4` (hstack, frame counter), per-frame luma SSIM after a global temporal alignment, worst 10 frames.
  Read `ssim_fg_mean` (foreground-only SSIM) next to the whole-frame mean: flat grounds inflate whole-frame SSIM
  (one static pill on a grey ground scores 0.96 whole-frame, 0.70 foreground).
- 2D camera moves: a transparent shape (fill `[0, 0, 0, 0]`) at the comp centre that the scene layers are parented
  to; key its scale / position. Children inherit position, rotation, scale AND opacity.
- Worked replicas (build scripts, notes on what matches and what does not):
  `artifacts/replicas/rNN/build.mjs` + `notes.md` of the replication step.

## 13. Recipes (taste layer)

`list_recipes` lists the recipes in `mcp/recipes/` with their params; `apply_recipe { id, params, startFrame,
endFrame?, parentId?, dryRun? }` builds one. Apply back to front (background, `scene-camera`, content,
`cursor-click`, `transition` last). Chain `returns` between recipes (a title's `inkBottom` places its underline,
the prompt bar's `sendX` / `sendY` / `pressFrame` drive `cursor-click`, a transition's `cutFrame` is where the
shots change). Recipe time params are frames at 30 fps, scaled to the comp fps. Everything a recipe creates is
ordinary named layers and keyframes, so the sections above apply when you retouch it. The full workflow is the
Claude Code skill `mcp/skill/flashfx-motion/SKILL.md`; the numbers behind the recipes are in `TASTE.md`.

## 14. Frosted / liquid glass (B38)

`editor.setShapeGlass(layerId, glass)` turns a shape layer (rectangle, rounded rect, circle / ellipse, star or path)
into glass: everything BELOW it is blurred inside its outline (the corners follow the radius), brightened / saturated,
bent outward across the rim like a lens edge, and the rim catches a highlight from `lightAngle`. The shape itself
still draws on top, so its fill is the tint and its stroke the hairline edge.

- Frosted caption pill over a photo (r06): `editor.addShapeLayer({ type: 'rectangle', x, y, width: 830, height: 150,
  radius: 75, fill: [0.12, 0.1, 0.09, 0.18], stroke: [1, 1, 1, 0.35], strokeWidth: 1.5 })`, then
  `editor.setShapeGlass(id, { blur: 28, refraction: 10, highlight: 0.45, lightAngle: -110, brightness: -0.04 })`.
  Or one call: `apply_recipe { id: 'glass-pill', params: { label: 'Unleash your Creativity' } }`.
- Params (a partial patch; omitted ones keep their value or the default): `blur` px (18), `refraction` px (8; 0 =
  flat frosted glass), `highlight` 0..1 (0.35), `lightAngle` degrees, screen Y down (-120 = upper left), `edgeWidth`
  px of the bent / lit rim band (16), `brightness` / `saturation` -1..1 on the backdrop (0.06 / 0.15), `enabled`.
  `null` removes the glass. One undo step.
- Animate: `editor.setKeyframes(id, 'glass.blur' | 'glass.refraction' | 'glass.highlight' | 'glass.lightAngle', keys)`.
  A lightAngle keyed over +360 is the edge-light sweep; glass.blur 0 -> 30 frosts the backdrop in.
- Layer order matters: the glass blurs only what is below it in the render stack (put the photo / video under it,
  the caption text above it, e.g. parented to the pill).
- Cost: each glass layer adds a scene copy and a full-frame blur. Keep it to a few glass layers on screen at once.
  Not applied on 3D, corner-pinned or matte-source layers (they draw as plain shapes).
- Check it with render_frame (the preview shows it too). Proof: `npm run gpu:glass`.
- Adjustment layers take masks too (B69): `editor.addMask` on an adjustment layer limits its effects to the mask.

## 15. Design-tool UI kit (B76)

For edits dressed as a screen capture of a vector app (r11: a glyph rotates, an anchor slides, the app chrome
follows). Animate the edit FIRST, then add the chrome over the same frames; every part is sampled from the real
resolved target (parents, motion paths, point-pose morphs), so it sits exactly on the edit. It is baked: re-run
after re-timing the target (delete the old kit group). Each call is one undo step; kit layers stack under any
cursor rig.

- Selection box: `agent.addSelectionBox { targetId, startFrame?, endFrame?, options?: { handles: "all" |
  "corners" | "none", color, handleSize, strokeWidth, padding } }`: 1 px blue outline + white handles on the
  oriented bounds; a group whose position / rotation and the outline size carry linear keys only where the
  target moves. Targets: rectangle, ellipse, star, path / outlined glyph, image, video (outline text first with
  `editor.outlineTextLayer`).
- Anchor squares: `agent.addAnchorSquares { targetId, ..., options?: { points?: [i...], highlight?: [i...] } }`
  puts a square on path vertices (read indices from `agent.getLayer` shape.vertices); highlighted ones are filled
  blue (the dragged anchor). For a drag, morph with `editor.setShapeMorph { ..., align: "vertices" }`: the drawn
  corner and the square then move together (with the default morph the squares follow the logical anchors
  while the drawn outline is resampled).
- Readout tooltip: `agent.addReadout { targetId, ..., options?: { preset: "move" | "size" | "angle" | "position",
  lines?: [{ label, quantity, unit, point? }], follow: "target" | layerId | [x, y], offset, decimals: 2,
  decimalMark: "," } }`. Values are measured per frame (deltas against startFrame: "Angle: 2,88deg" at the 20 %
  point of a 90 deg easeInOutCubic turn, exactly r11's numbers) and stored as a B75 counter span with a
  `samples` table, so the text keeps its font and can be edited with `agent.setTextCounter`. `follow:
  cursorId` keeps the tooltip beside the pointer.
- Guide label: `agent.addGuideLabel { text, startFrame?, endFrame?, options?: { targetId, point: "center" |
  "top" | i, x, y, offset, line } }`: the magenta word ("anchor", "center", "Line Extension"), optionally with a
  1 px pin line to the point.
- Guide line: `agent.addGuideLine { startFrame?, endFrame?, options: { from, to, extend?, color?, width? } }`: a 1 px
  line whose ends follow `[x, y]` or `{ layerId, point?: "center" | "top" | "bottom" | i }` (a group such as a cursor
  follows its hotspot): the pen rubber band (`from: { layerId: path, point: lastIndex }, to: { layerId: cursorId }`),
  a magenta "Line Extension" (`extend: 80`) or the vertical centre guide.
- Cursors: `agent.addCursor { icon: "pen" | "crosshair" | "rotate" | "directSelect" | "resize", rimColor }` and
  `agent.cursorIcon { cursorId, frame, icon }` (a design icon an older rig lacks is added to it). r11's macOS
  pointer: `color: [0, 0, 0, 1], rimColor: [1, 1, 1, 1]`.
- One call: `apply_recipe { id: 'design-chrome', params: { layerId, readout: 'angle', guide: 'center' } }`.
- Proofs: `npm run verify:design-kit` (box / squares / readout == target every frame) and `npm run gpu:design-kit`.

## 16. 3D card swarm (B81)

For the "wall of UI floating in space" shot (r10 S10: about 16 dashboard cards and 12 prompt pills at different
depths, the cluster turning slowly while the camera flies in). One call builds it; everything lands as ordinary
editable 3D layers (one undo step), stacked under any cursor rig.

- `agent.addCardSwarm { count?, seed?, sources?, volume?, cluster?, options?, name? }` returns `{ clusterId,
  cardIds, items: [{ id, kind: "card" | "pill", partIds, position, world, rotation, width, height, variant }],
  layout: { minSpacing, minDistance, relaxed }, ... }`.
  - Layout: seeded and pure (same seed = the same swarm), centres inside `volume` (`{ center: [x, y, z], size:
    [w, h, d], shape: "box" | "ellipsoid" }`, default centre (W/2, H/2, 540), size (1.1 W, 1.05 H, 1080), so every
    card is at or behind the z = 0 plane), no two centres closer than `options.minSpacing`, camera-facing with a
    small random tilt (`options.tilt`, default 8 deg). Pills sit in the front 55 % of the depth (`pillDepth`).
  - Sources: `sources: [assetId | layerId, ...]` are cycled by the cards (images from `import_image { place:
    false }` become image cards; shape / text / precomp layers are duplicated, the originals hidden). Without
    sources: placeholder UI cards (light #f7f5f5 / dark #1c1c1e, accent chip, title bar, content block) and
    violet pills labelled with r10's prompts (`options.labels: [...]` or `false`). `options.detail: "plain"` =
    one layer per card.
  - Cluster turn: `cluster: { yawFrom: -20, yawTo: 15, startFrame: 0, endFrame: 31, ease? }` (default ease
    easeInOut [0.42, 0, 0.58, 1]), or `yawKeys: [{ frame, value, ease? }, ...]`, `pitch` / `pitchKeys` for a tilt.
    The cluster is a 3D group flagged `orbitChildren`: rotating it ORBITS the cards about the volume centre (true
    3D parenting), so near cards slide one way and far cards the other, and the depth order follows the turn.
    Retime it with `editor.setKeyframes { layerId: clusterId, propertyPath: "transform.rotationY" }`.
- Move a card: `editor.updateLayerProperty` on its id, `transform.position.defaultValue` (x, y relative to the
  volume centre) and `transform.positionZ.defaultValue` (+ = farther). Its printed bars / label are children
  flagged `sortWithParent` (they depth-sort with the card and stay on it).
- Camera fly-through: `editor.addCameraLayer`, then `editor.cameraMove` beats (r10: dolly in from f26 over 27 f
  with the measured `[0.61, 0.076, 0, 0.809]`, then tilt down + push with `pointOfInterest` lower and an
  easeInCubic). A fresh camera has zoom 50 * W / 36 at z = -zoom.
- S9 to S10 (card shrinking into the swarm): keep the hero card 2D on top and key its scale down with the
  measured easeIn while the swarm and camera start; or use it as one of the `sources`.
- Limits: layer motion blur does not see the orbit (it reads the 2D transform): leave it off on swarm cards;
  per-glyph animated text under the cluster is not orbit-composed (plain labels are); the canvas selection
  outline of an orbiting card shows its un-orbited 2D box.
- One call with the camera: `apply_recipe { id: 'card-swarm', params: { count: 16, pills: 12, seed: 10 } }`.
- Proofs: `npm run verify:card-swarm` (layout determinism / spacing / volume, the action on the real stores,
  one-step undo, the resolver's true orbit) and `npm run gpu:card-swarm` (true 3D projection within 1.5 px,
  opposite parallax, near-over-far occlusion that flips with the orbit, decals and labels on their card,
  byte-identical export / import).
## 17. Typing prompt box (B82)

For AI-app prompt boxes, search bars and form fields that type (r10 S7 / S11 / S12, r06 S2, r04 S1). ONE call builds
the whole box as editable layers in a group (one undo step, stacked under any cursor rig):

```json
{ "actionId": "agent.addPromptBox", "args": { "x": 960, "y": 540, "width": 872, "height": 96, "radius": 36, "theme": "dark",
  "text": "Add user authentication with login and signup", "startFrame": 427, "endFrame": 490,
  "typing": { "startFrame": 432, "durationFrames": 25 }, "arrivalColor": "#e780f6", "arrivalFrames": 4,
  "caret": { "gradient": ["#6175ce", "#e85aa0"], "width": 4 }, "sendFrame": 462, "flash": true, "entrance": "slideFromRight" } }
```

- Timing: `typing.durationFrames` (first character on `typing.startFrame`, last on start + duration - 1), or `cps`, or
  `frames` (one absolute frame per character, spaces included: a measured human rhythm). `ease` shapes the typing RATE
  (r10 S4: `"cubicInOut"` = slow start, fast middle). Default: after the entrance at 24 chars / s.
- `arrivalColor` + `arrivalFrames`: each new character is drawn in that colour on its arrival frame and mixes (linear light)
  to the text colour over N frames.
- `caret`: `{ color | gradient: [top, bottom], blink (cycles / s, false = solid), shape: bar | block | underline, width,
  height, gap }`; it sits right on the head (gap 0), solid while typing, and the blink restarts ON at the last keystroke.
  `caret: false` = none.
- Layout: `theme` dark (#241e21 / #f3eeed) or light (white + hairline / #111), or `fill` / `textColor` /
  `placeholderColor`; `placeholder` shows until the first keystroke; `buttons: { send: true, row: ["+", "Attach",
  "Themes"] }` (a row makes a taller card: text on top, chips + send below); `align: "center"` types centred so the line
  grows both ways; `autoGrow` (or `{ maxWidth }`) makes the box follow the typed line; `mask: true` types asterisks.
- `entrance`: `pop` or `slideFromRight` (slides in from 0.55 x width to the right and widens 62 -> 100 % as it lands,
  easeOutCubic over `entranceFrames` = 18, fading in over 6 frames).
- `sendFrame`: the send button squashes 100 -> 85 -> 100 % (+1 / +4 frames); `flash: true` (or `{ colors }`) fades in a
  blue / violet / orange gradient over 2 frames, then the box fill wipes back from the left (sendFrame + 9 .. + 21).
- Returns `sendCenter` (aim `agent.cursorMoveTo` there and `agent.cursorClick` on `sendFrame`), the final `box` rect,
  `typing.frames` and `caretPath` (the caret centre / left edge on every keystroke frame, comp px). `warnings` flags a line
  wider than the box.
- Any text layer: `agent.setTextTyping { layerId, typing: { startFrame, durationFrames | cps | frames, ease, arrivalColor,
  arrivalFrames } }` adds the same schedule (use it instead of a type-on animator); `agent.setTextCaret { caret: { gradient:
  [top, bottom] } }` gives any caret the gradient. Edit later with `updateLayerProperty` `typing.frames` /
  `typing.arrivalColor` / `caret.gradient`.
- Limits: the typed text is one line (wrap = widen the box or lower `fontSize`); typing frames are absolute, so re-run
  `agent.setTextTyping` after moving the clip.
- One call from a brief: `apply_recipe { id: 'prompt-box', params: { text, theme, press } }`.
- Proofs: `npm run verify:prompt-box` and `npm run gpu:prompt-box`.
