---
name: flashfx-motion
description: Build a clean, professional, fully editable motion graphic in FlashFX from a one-line brief (titles, launch teasers, product promos, UI mocks, end cards, social reels) through the FlashFX MCP server, using its measured taste rules and animation recipes, checking the frames, and exporting an MP4 plus the editable .ffx project. Use when the user asks to make, animate or render a motion graphic, title, intro, teaser, promo or reel with FlashFX.
---

# flashfx-motion

You are a motion designer working in FlashFX through its MCP server. The contract: **you build it, FlashFX
renders it, the user can open and edit every layer.** Every piece ends with an MP4 and an `.ffx` project.

Quality comes from three things the MCP gives you: the taste rules (numbers measured on professional
reference videos), the recipes (those numbers packaged as parameterized moves), and frame checks
(`render_strip`). Use all three. Do not freestyle keyframes for something a recipe already does.

## 0. Setup (once)

1. Node 22+, Chrome / Edge, a GPU (WebGPU). The FlashFX repo checked out, `npm install` done.
2. Register the server from the repo root:
   `claude mcp add flashfx -- node mcp/flashfx-mcp.mjs`
   (faster boot: `npm run build` first; the server serves the newest of `dist/` and the dev server).
   Against production instead: `claude mcp add flashfx -- node mcp/flashfx-mcp.mjs --url https://editor.flashfx.app`.
3. Install this skill: copy `mcp/skill/flashfx-motion/` to `~/.claude/skills/flashfx-motion/` (all
   projects) or to `.claude/skills/flashfx-motion/` in your project.
4. Check: the tools `list_recipes`, `apply_recipe`, `render_strip`, `export_mp4` are listed in `/mcp`.

The server runs on your own machine and your own Claude subscription: no API key is needed.

## 1. Read the rules and the menu

- Read the resource `flashfx://taste` (or run the prompt `/mcp__flashfx__taste`). Keep its section 1
  (the seven rules) in mind for every decision.
- Call `list_recipes` once. Each recipe lists its params (defaults included), natural length
  (`length30`, frames at 30 fps) and the references it came from.
- For anything not covered, `list_features` lists every raw action, and `flashfx://authoring` explains them.

## 2. Plan before you build

Write a short plan in your reply first. Fill this table:

| Shot | Frames (comp fps) | Idea (one per shot) | Recipes + key params | Transition out |
| --- | --- | --- | --- | --- |

Rules for the plan (TASTE.md sections 3, 5, 10):
- Format: square 1080x1080 (feed), vertical 1080x1920 (Reels / Shorts / TikTok), landscape 1920x1080
  (YouTube). 60 fps for social motion design (the references), 30 fps is fine for long pieces.
- Shots of 1.5-3 s (median 2 s). An 8 s piece has 3-4 shots. End on a rest of at least 1 s.
- One ground colour, one ink, one accent; Inter / Inter Tight, plus Instrument Serif italic for a single
  accent word if wanted.
- Hard cuts by default; at most one or two signature transitions (`transition` recipe) on the big beats.
- Copy: short. A headline is 2-5 words. Supporting lines under 6 words.

## 3. Build with recipes

1. `create_project { name, format: "short" | "long", frameRate, durationFrames, clipLength: "comp" }`.
   For square: `run_action { actionId: "editor.setCompositionSize", args: { width: 1080, height: 1080 } }`.
2. Apply recipes **back to front** (creation order is stacking order):
   1. `background`
   2. `scene-camera` (optional; keep its `returns.cameraId`)
   3. content: `kinetic-title`, `blur-in-text`, `type-on`, `prompt-bar`, `pop-in`, `underline-draw`,
      `shape-morph`, `end-card`
   4. `cursor-click` (on top of the UI it clicks)
   5. `transition` last (it must cover everything)
3. Each call: `apply_recipe { id, params, startFrame, endFrame }`.
   - `startFrame` / `endFrame` are comp frames. With `endFrame`, exits land on it and the created layers
     are clipped to the shot. Recipe time params (`delay`, `entrance`, `stagger`, `hold`...) are frames
     at 30 fps and scale to the comp fps.
   - Chain results: `apply_recipe` returns `returns` (ids, measured positions, frames). Feed them on:
     `kinetic-title` returns `inkBottom` (place an `underline-draw` at `inkBottom + 0.15 * size`),
     `prompt-bar` returns `sendX`, `sendY`, `pressFrame` (the `cursor-click` target and `clickAt`),
     `transition` returns `cutFrame` (end the outgoing shot and start the next one there).
   - `parentId: <cameraId>` hangs a recipe's root layers on the scene camera.
   - Unsure? `dryRun: true` shows the expanded actions without changing anything.
4. Name things: every recipe takes a `name`; the user edits by layer name.

## 4. Check the frames (do not skip)

After each shot, `render_strip { frames: <checkFrames from apply_recipe>, tileWidth: 360 }` and look at
the image. At the end, one strip of 10-15 frames across the whole piece (every shot: entrance, rest, exit,
plus the cut frames).

Fix anything on this list before exporting:
- Something visible before its entrance or after its exit; a hard pop where a move was meant.
- Overlaps: text running into shapes or other text; elements crowding the 8 % margins.
- Two things starting and stopping on the same frame (stagger them by 3-6 f30).
- A message that is not readable for at least 0.7 s.
- Type too small to read on a phone (under 2.5 % of the short side), or too many sizes (keep 3).
- Glow blowing out, colours fighting, more than one accent.
- The last frame not at rest.

Fix by: `undo` then re-apply with new params (cleanest), or tweak one property with
`run_action editor.setKeyframes` / `editor.updateLayerProperty` (see `flashfx://authoring`). Re-render the
same strip to confirm.

## 5. Export and save

1. `export_project { path: "<outDir>/<name>.ffx" }`: the editable project (open in FlashFX with
   File > Import Project). This is the main deliverable.
2. `export_mp4 { path: "<outDir>/<name>.mp4" }` (comp size and fps by default; 8 s at 1080p takes about
   20-60 s).
3. `save_project` keeps it in the browser's project list too.
4. Report: the plan table, the recipes used with their params, and both file paths.

## Worked example (8 s square launch title)

Brief: "8 s launch title for FlashFX MCP early access, in the refs' style". Plan at 1080x1080, 60 fps,
480 frames:

| Shot | Frames | Idea | Recipes | Out |
| --- | --- | --- | --- | --- |
| 1 | 0-166 | Claude is asked for the piece | `background` light grey, `scene-camera` push 1.0 -> 1.05, `prompt-bar` query "make a launch title for FlashFX MCP", `cursor-click` on the send button at `pressFrame` | `transition` wipe-up, cut at frame 166 |
| 2 | 166-330 | The title answers | `kinetic-title` "FlashFX MCP" + accent, `underline-draw` under it, `blur-in-text` "Claude builds it. FlashFX renders it.", `pop-in` "EARLY ACCESS" | hard cut |
| 3 | 330-480 | Sign-off | `end-card` FlashFX mark + wordmark, tagline "editor.flashfx.app" | end on a 1.5 s rest |

Then `render_strip` on every shot, fix, `export_project`, `export_mp4`. The same plan as a script (every call
an MCP tool call, recipes only): `node mcp/examples/build-d-recipe-launch-title.mjs <outDir>`.

## Limits to know

- Masks are composition-space: a masked title does not follow a moving camera, so keep camera pushes on
  masked titles small (<= 1.1).
- `reorderLayers` does not change stacking yet: create back to front.
- A circle with non-uniform scale stays a circle and rounded rects wider than about 2048 px draw lens ends
  (B63): build big soft shapes at half size with scale 2.
- Imported fonts are not inside the `.ffx`: stick to the bundled families for portable projects.
