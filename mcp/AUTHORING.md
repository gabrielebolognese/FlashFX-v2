# Authoring motion graphics through the FlashFX MCP (v0)

How an agent (Claude Code, Claude Desktop, any MCP client) should build a clean, editable piece in
FlashFX. Everything here was learned building the three reference pieces in `mcp/examples/`
(kinetic title, lower third, logo reveal); see `docs/MCP-AUDIT.md` for the full friction log.

The contract: **Claude builds it, FlashFX renders it, the owner can open and edit it.** So every
build ends with an `.ffx` project file, not only an MP4.

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
{ "name": "create_project", "arguments": { "name": "Launch title", "format": "long", "frameRate": 30, "durationFrames": 120 } }
```

- `long` = 1920x1080, `short` = 1080x1920. 30 fps is the house default.
- Background: the comp background is a stack. Add one layer and style it (colours are RGB 0..1,
  `radial` uses normalized `centerX/centerY/radius`):

```json
{ "actionId": "editor.addBackgroundLayer", "args": [] }
{ "actionId": "editor.updateBackgroundLayer", "args": { "id": "$0.result", "updates": { "type": "radial", "centerX": 0.5, "centerY": 0.46, "radius": 0.75,
  "stops": [ { "color": [0.09, 0.1, 0.13], "position": 0, "opacity": 1 }, { "color": [0.015, 0.016, 0.02], "position": 1, "opacity": 1 } ] } } }
```

- **Clip length (important).** New layers are 4-second clips, like in the UI. In a longer comp,
  finish the build by stretching every layer, or it disappears after 4 s:

```js
const st = await call('get_state');
await call('run_actions', { actions: st.layers.map((l) => ({ actionId: 'editor.updateLayerProperty', args: { layerId: l.id, path: 'outPoint', value: DUR } })) });
```

## 2. Layers: naming and stacking

- `renameLayer` every layer with its role: `Title line 1`, `Card`, `Accent bar`, `Avatar`,
  `Spark burst`. The owner edits by name; a timeline of `Text 1`, `Rectangle 3` is not editable in
  practice.
- **Create back to front.** The renderer stacks by timeline track, and each new layer gets its own
  track on top. `editor.reorderLayers` does NOT change what draws on top today (queued as B44), so
  plan the order: background shapes first, then text, then foreground accents.
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
  fitted quads: pass them straight in.
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

## 5. Text

- `editor.createQuickText { x, y, text }`: x is the CENTRE of the text, y the centre of the line
  box. For all caps at size S the glyphs span roughly `y - 0.68 S` (cap top) to `y + 0.11 S`
  (baseline).
- Set the size in BOTH places: `animOverrides.fontSize.defaultValue` (what renders, animatable)
  and `content.spans.0.style.fontSize`. Colour, weight, family: `content.spans.0.style.*`.
  Tracking: `animOverrides.letterSpacing.defaultValue` (px).
- **Measure, do not guess:** `measure_text { layerId }` returns the centre, the ink box
  (`left/right/top/bottom`), per-line widths and line height, exactly as the renderer lays it out.
  Left-align by putting the centre at `left + ink.width / 2` (`horizontalAlign` alone does nothing
  on an auto box, and a fixed-width box misplaces animated glyphs today, queued as B45).
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
- Known leak: `type-on` and `blur-in` show the first glyph before their start frame (B45). Hold the
  layer at opacity 0 until the reveal starts (two keyframes, the first set to `hold`).
- Per-glyph animators work on single-line text: one text layer per line.

## 6. Shapes and colour

- `editor.addShapeLayer { opts: { type, x, y, width, height, fill, radius, name, stroke?, strokeWidth? } }`
  (B46): one undo step, x / y are the CENTRE, colours RGBA 0..1, NO stroke unless you pass one, and it
  returns the new id. Use it instead of `addShapeWithDimensions` (which adds the UI's 1 px grey stroke:
  you would have to zero `shape.strokeWidth.defaultValue`). `type: "circle"` with width != height is an
  ellipse (a circle stretched by the layer scale).
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
- **Shape morphs (B62)**: `editor.setShapeMorph { layerId, poses: [{ frame, shape, ease }], align? }`
  turns any shape layer into a path whose outline morphs through the poses. `shape` (layer-local px,
  centred on the layer position): `{ type: "rectangle", width, height, radius? }`,
  `{ type: "ellipse", width, height }`, `{ type: "star", width, height, points?, innerRatio? }`,
  `{ type: "polygon", width, height, sides? }`, `{ type: "path", points: [[x, y], ...], closed? }`.
  `ease` shapes the morph to the NEXT pose (same vocabulary as `setKeyframes`; `backOut` or a quad
  with y > 1 overshoots the outline for a pop; `"hold"` snaps). Auto-alignment (default) keeps
  outlines from twisting; different vertex counts morph. For the heavy-morph look, pair it with
  scale / rotation keys on the same eases and a `shape.fillColor` colour key:

```json
{ "actionId": "editor.setShapeMorph", "args": { "layerId": "<id>", "poses": [
  { "frame": 0,  "shape": { "type": "rectangle", "width": 220, "height": 220, "radius": 24 }, "ease": [0.65, 0, 0.35, 1] },
  { "frame": 18, "shape": { "type": "star", "width": 300, "height": 300, "points": 6, "innerRatio": 0.5 }, "ease": "backOut" },
  { "frame": 36, "shape": { "type": "ellipse", "width": 240, "height": 240 } } ] } }
```

## 7. Masks

- `editor.addMask { layerId, type: "rectangle" }`, then `get_layer` to read the new mask id (the
  last entry of `masks`).
- Mask position and size are COMPOSITION pixels (not layer-local) and do not move with the layer.
  That is what makes "rise out of a fixed window" and "slide out from behind the logo" work: animate
  the layer, keep the mask still.
- `editor.updateMaskProperty { path: "position.defaultValue" | "size.defaultValue" | "feather.defaultValue" | "mode" }`;
  keyframe with `editor.addMaskKeyframe`. Masks now clip animated and accent-styled text too.

## 8. Effects, images, particles

- Motion blur: `updateLayerProperty(id, "motionBlur", true)`. Preview shows a few stepped copies;
  export uses 16+ samples and is smooth.
- Glow: `editor.enableLayerEffect { kind: "glow" }`, then `glow.color`, `glow.radius`,
  `glow.intensity`, `glow.threshold`. Keep intensity low (about 0.5) and threshold high (about 0.6)
  on bright artwork or it blows out.
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
    RGB split amount or invert amount ramping. The effect stack lives on image and adjustment layers.
  These render byte-identically to the same values set statically (`npm run gpu:anim-props`).
- Images and logos: `import_image { path, rasterSize?, x?, y? }` imports PNG / JPEG / WebP / GIF /
  SVG (rasterized) and places it. Scale it with `transform.scale` = target px / `result.width`.
- Particles: `editor.addParticleLayer`, then
  `agent.configureParticles { layerId, presetId, overrides, seed }` (one undo step; overrides are
  `EmitterConfig` fields, e.g. `{ spawnRate: 0, burstCount: 140, emitterShape: "circle" }`).
  A burst fires on the layer's first frame: time it with `editor.moveClipInTime { newInPoint }`.

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
  off. Single-line text only. With the stock `type-on`, the first glyph (and so the caret's first
  step) shows before the start frame (B45): for an empty field that blinks before typing, key the
  animator offset from `-1 / length` instead of 0 (`animators.0.offset`).
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
  returned `responseFrame` (click + 2). Icons: `arrow`, `hand`, `ibeam`. Keep the cursor outside any
  "camera" group so it stays in screen space.
- **UI templates.** `editor.insertAnimationTemplate { id }` at the playhead: `search-bar-typing`
  (pill opens, placeholder, query types on behind a blue caret), `toggle-switch` (a cursor clicks a
  settings toggle: knob slides, track turns green), `chat-bubbles` (received / sent bubbles with
  tails pop from their tails, typing dots), `notification-banner` (drops in, holds, slides away).
  They are plain layers in a group: retype with `agent.setTextContent` (the caret follows), recolour
  with `updateLayerProperty` / `setKeyframes`, retime in the timeline.

## 9. Check your work

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
   A 4 s 1080p piece renders in about 7 s.
3. Optional proof: `import_project { path }` re-opens the `.ffx` as a new project
   (`mcp/examples/verify-roundtrip.mjs`).

`save_project` persists to the app's local storage, the app also autosaves.

## 11. Reference builds

| Script | Shows |
| --- | --- |
| `mcp/examples/build-a-kinetic-title.mjs` | per-word rise out of masks, accent word, motion blur, underline draw-on, type-on caption, staggered exit |
| `mcp/examples/build-b-lower-third.mjs` | measured layout, custom bezier card grow, named back ease pop, parenting, clip-length fix |
| `mcp/examples/build-c-logo-reveal.mjs` | SVG import, glow, particle burst, shockwave ring, wordmark sliding out of the mark through a mask |

Run one: `node mcp/examples/build-a-kinetic-title.mjs <outDir>` (writes PNG checks, `.ffx`, `.mp4`).
