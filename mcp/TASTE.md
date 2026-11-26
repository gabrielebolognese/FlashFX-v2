# FlashFX taste rules

How clean, professional motion design is timed, eased, set and coloured, written as numbers you can type
into `editor.setKeyframes` / `apply_recipe`. Every number below was measured on the owner's 7 reference
videos (frame-by-frame breakdowns: 87 shots, 357 elements, 550 keyed animations with fitted cubic-bezier
eases) and checked by rebuilding 4 of them through this MCP (r02, r04, r06, r07, all at timing offset 0).

- Measurements: `mcp/taste/taste-stats.json` (aggregated by `mcp/taste/taste_stats.py` from the
  per-reference timing sheets `refs/rNN/timeline.json`).
- References: r01 designer intro (white canvas, playful pops), r02 green-on-white kinetic explainer,
  r03 blue SaaS explainer, r04 iOS search-bar piece on light grey, r05 surreal lyric video, r06 dark AI
  product promo (prompt bar, camera), r07 vertical creator promo. Specs: 60 fps except r03 (30 fps).
- Reference ids (`r04 S1.E7`) point at a shot / element in that reference's breakdown.
- The recipes (`list_recipes`) already encode these rules. Use this file to choose params, to judge a
  render_strip, and when you build something no recipe covers.

Frame numbers are given at **30 fps (f30)** and **60 fps (f60)**. Recipe params are always f30 and are
scaled to the comp fps (`f(n)` in a recipe).

## 1. The seven rules

1. **Ease out, almost always.** Things arrive fast and settle slowly: 46 % of all measured moves are an
   ease-out family, only 17 % ease-in (exits and accelerations into a cut), 10 % ease-in-out (moves between
   two rests). Real motion is never linear except progress, typing, scrolling and slow drifts.
2. **Short.** A move takes about 0.4 s: median entrance 0.43 s (13 f30 / 26 f60), opacity changes 0.27 s,
   exits 0.28 s. Over 1 s is a camera move or a drift, not an entrance.
3. **Stagger, never sync.** Elements of one group start 0.1 s apart (median, 3 f30 / 6 f60). Nothing
   starts and stops together.
4. **Hold to read.** Every message gets a rest: median hold 0.68 s, at least 1 s for a line people must
   read, about 0.25 s per extra word on top.
5. **One idea per shot, cut on the beat.** Median shot 2.0 s (p25 1.4 s, p75 3.2 s). A third of shot
   changes are hard cuts (28 of 87); fancy transitions are for the one or two big beats.
6. **Restraint in colour and type.** One ground, one ink, one accent. One family (plus an italic serif
   accent at most). Big type is tight, small type is open.
7. **Overshoot is seasoning.** Only 21 of 550 moves overshoot, median peak 2.8 %, p75 8.9 %, max 16 %.
   Use it on pops (badges, buttons, logos, tiles), never on text lines or camera moves.

## 2. Easing

Measured families (count of keyed animations, median fitted bezier, median duration). "Use" is the curve
to pass; the measured median is listed so you can see where it comes from (a component-wise median of
noisy fits is not itself a curve, so prefer the "Use" column).

| Family | n | Measured median bezier | Duration p25 / median / p75 | Use (cubic-bezier) | For |
| --- | --- | --- | --- | --- | --- |
| easeOutCubic | 84 | 0.142, 0.346, 0.21, 0.942 | 0.20 / 0.43 / 0.73 s | `[0.33, 1, 0.68, 1]` (`cubicOut`) | default entrance, slides, UI growth (r06 disc-to-bar, r07 card swing) |
| easeOutCirc | 55 | 0.112, 0.766, 0.506, 0.921 | 0.43 / 0.70 / 1.03 s | `[0, 0.55, 0.45, 1]` (`circOut`) | longer settles, camera pull-backs, big reveals |
| easeOutExpo | 14 | 0.043, 0.773, 0.149, 0.99 | 0.23 / 0.57 / 1.07 s | `[0.16, 1, 0.3, 1]` (`expoOut`) | snappy UI (r04 bar slide-in 44 f60 `[0, 0.731, 0.205, 0.969]`), underline draws |
| easeOutQuint | 4 | 0.177, 0.623, 0.024, 1.003 | 0.49 s | `[0.22, 1, 0.36, 1]` (`quintOut`) | text reveals, end lockups (r06 dome) |
| ease / easeOut (soft) | 98 | 0.386, 0.19, 0.176, 0.956 | 0.27-0.33 s | `[0.25, 0.1, 0.25, 1]` | small secondary moves, fades |
| easeIn (+Cubic, Quart, Expo) | 79 | 0.653, 0.101, 0.577, 0.627 | 0.28 s (In), 0.49 s (InCubic) | `[0.55, 0, 1, 0.45]` or `[0.7, 0, 0.84, 0]` | exits, whips, accelerating into a cut (r04 push right into the zoom `[0.983, 0.277, 0.589, 0.601]`) |
| easeInOut (+Cubic, Quart) | 48 | 0.424, 0.088, 0.578, 1 | 0.41 s (InOut), 0.83 s (InOutCubic) | `[0.42, 0.09, 0.58, 1]`, heavy: `[0.76, 0, 0.24, 1]` | A-to-B moves between two rests, morphs, camera pushes |
| easeOutBack (overshoot) | 11 | 0.433, 1.466, 0.1, 1.157 | 0.47 s | `[0.34, 1.56, 0.64, 1]` (r06 send button) | pops: buttons, badges, tiles, logo marks |
| hold | 52 | step | 0.07 / 0.68 / 3.0 s | `"hold"` | caret states, list steps, colour swaps, strobes, single-frame flashes |
| linear | 73 | ~straight | 0.45 s | `"linear"` | typing, scroll, progress, slow drifts, spins in a loop |

Overshoot numbers (measured, peak above the target): r01 S1.E7 scale 3.1 % (`[0.41, 0.436, 0.252, 1.221]`,
21 f60), r01 S4.E1 scale 8.9 % (17 f60), r02 S4 cards 6-16 % (`[0.52, 1.576, 0.06, 1.135]`, 29 f60),
r01 S2.E6 card rotationY 1.3 %. Rule: 3-9 % on a pop, 0 on type.

**Do:** pass the measured quad straight into `setKeyframes` when you match a reference
(`refs/rNN/timeline.json` carries them). **Don't:** leave `addKeyframe` defaults (linear) on real motion;
use `easeIn` for an entrance (it reads as hesitation); put overshoot on a camera.

## 3. Timing

| Beat | f30 | f60 | Seconds | Evidence |
| --- | --- | --- | --- | --- |
| Head (empty frames before the first move) | 4-8 | 8-16 | 0.13-0.27 | every ref opens on motion within 0.25 s |
| Entrance, text / UI | 12-16 | 24-32 | 0.4-0.53 | easeOutCubic median 0.43 s |
| Entrance, small element (icon, dot) | 6-10 | 12-20 | 0.2-0.33 | scale median 0.43 s, p25 0.20 s |
| Pop with overshoot | 8-10 | 16-20 | 0.27-0.33 | easeOutBack 0.47 s, r06 send pop 5 f60 |
| Opacity fade | 4-8 | 8-16 | 0.13-0.27 | opacity median 0.27 s, p25 0.10 s |
| Move between two rests | 12-25 | 24-50 | 0.4-0.83 | easeInOut 0.41 s, InOutCubic 0.83 s |
| Exit | 8-12 | 16-24 | 0.27-0.4 | easeIn median 0.28 s: exits are faster than entrances |
| Hold (one message) | 20-30+ | 40-60+ | 0.68-1+ | hold median 0.68 s |
| Shot | 45-95 | 90-190 | 1.5-3.2 | shot median 2.0 s |
| Whip / smash zoom | 1-2 | 2-4 | 0.03-0.07 | r04 whip zoom 3 f60 to 151 %, r05 smash cuts |
| Camera push / drift | whole shot | whole shot | 1-3 | r04 S2 push, r06 drift |
| Tail (end on a rest) | 6-10 | 12-20 | 0.2-0.33 | end cards hold 1 s+ (r04 S5, r06 S6) |

Overlap: the next element starts while the previous is still settling (4-10 f30 offset). Typing runs at
**24 characters / s** (r06: 29 characters in 72 f60), with human jitter of 2-5 f60 per key; 12 chars / s
reads as deliberate.

## 4. Stagger

- Between elements of one group: median **0.1 s** (3 f30 / 6 f60), p25 0.05 s, p75 0.2 s (138 measured gaps).
- Words of a headline: 2-4 f30 (r04 S3 statement words at f60 355 / 358 / 366 / 373 / 380 = 3-8 f60).
- Letters: 1-1.5 f30 (blur-in, type-on).
- List rows / cards: 4-6 f30.
- Large groups (10+ tiles): spread the whole group over at most 1.4 s (r04 S4: 10 tiles over 42 f60).
- Per-unit ease: each word eases out cubic on its own; the stagger itself is linear (the
  `kinetic-title` recipe sets the selector `easeLow: 1` and a linear offset sweep for exactly this).

## 5. Typography

**Scale** (font size as % of the comp's short side; 142 text elements measured): median **6.3 %**,
p25 3.9 %, p75 8.8 %.

| Role | % short side | 1080 px comp | Weight | Tracking (1/1000 em) |
| --- | --- | --- | --- | --- |
| Hero word / number | 15-28 % | 160-300 px | 700-900 | -20 to -40 |
| Headline | 8-11 % | 86-118 px | 600-800 | -10 to -30 |
| Statement / subhead | 6-7.5 % | 65-80 px | 500-600 | -10 to 0 |
| Supporting line | 3-4.5 % | 32-48 px | 400-500 | 0 |
| Label / caption (all caps) | 2-3 % | 22-32 px | 500-600 | +40 to +120 |
| Micro (UI chrome) | 1.1-2 % | 12-22 px | 400 | 0 to +20 |

Examples: r02 headline "Attention / is expensive" 89 px on 1080 (8.2 %, Inter Tight) with an Instrument
Serif Italic accent word at 100 px (9.3 %, the serif accent is set 5-15 % larger to match the sans
x-height); r01 "Motion Designer." 100 px (9.3 %, Archivo Expanded); r04 statement 40 px SF Pro on 1080
(3.7 %); r05 lyric lines Helvetica Bold; r06 wordmark Sohne 500.

- Families (bundled, see AUTHORING.md section 5): **Inter / Inter Tight** for almost everything (the free
  stand-in for SF Pro, Sohne, Helvetica), **Archivo Expanded** for wide display titles, **Instrument Serif
  italic** for the accent word, **Space Mono** for code, **VT323** for pixel. Never more than two families
  in a piece.
- Accent: one word per line at most, in the accent colour and / or the serif italic (r02, r03, r07 all do
  it). Never accent every line.
- Line height 1.0-1.15 for display, 1.3-1.4 for body. Two-line headlines: break at the meaning, not at the
  width.
- Optical centring: `createQuickText` y is the line-box centre. All-caps glyphs sit about 0.28 x size above
  it (place caps at y + 0.28 S to centre them on a shape), mixed case about 0.2 x size. Measure with
  `agent.measureString` / `measure_text` instead of guessing widths.
- **Margins:** keep type inside 8 % of the frame width on each side (the recipes fit headlines to 84 % of
  the width). Vertical frames: keep the top 12 % and the bottom 20 % clear of key text (platform UI).
- **Grid:** centre-aligned compositions dominate (r02, r04, r06, r07). Left-aligned blocks share one left
  edge (a typed prompt and its placeholder share the same x; r06 bar contents). Spacing between stacked
  elements: about 0.6-1 x the larger element's font size.

## 6. Effects

- **Motion blur:** on 53 of 357 elements (15 %): only things that travel fast (rising words, whips, a
  spinning ring, a cursor, a flicked card). Turn on `motionBlur` per layer, never globally. Comp shutter
  180 deg (`editor.setCompositionSetting { key: "shutterAngle", value: 180 }` is the default look). A
  child moved by its parent blurs weakly today (B66): put the blur on the fast layer itself.
- **Blur-in** (opacity + gaussian per glyph): wordmarks and supporting lines. Start blur about 40 % of
  the font size, resolve in 10-16 f30 (r06 wordmark 10 f60, end wordmark 16 f60).
- **Glow:** a pulse when a logo or a key object lands: intensity 0 -> peak -> 20 % of peak. Peak 0.3-0.5 on light
  grounds, up to 1.6 on dark (r06 rim glow, r04 end card). Threshold about 0.55 so it does not wash out.
  A permanent strong glow on a light ground looks cheap.
- **Soft halo:** a blurred accent shape under a UI element (r04 pill halo `#a9c6f2`, r06 bar under-glow):
  blur radius about 45 % of the element height, accent at 25-35 % alpha.

## 7. Colour

| Ground | Ink | Accent | Reference |
| --- | --- | --- | --- |
| `#e4e6e3` light grey | `#060506` | `#0988f6` blue | r04 (placeholder `#929293`, pill `#fefefe`) |
| `#fefffe` white | `#050505` | `#14bf03` green | r02 (soft glow `#e8f7e6`) |
| `#ffffff` white | `#080907` | `#b0f622` lime | r01 |
| `#f8f6fd` lavender white | `#0e0d12` | `#2436a7` royal blue | r03 |
| `#000000` black | `#ffffff` | `#55aeeb` -> `#ad5bde` blue-purple | r06 |
| `#ffffff` -> `#0c0b0f` | `#040404` | `#8cd804` lime | r07 |

- Grounds are flat (or a very soft radial), never a busy gradient behind text.
- Ink is near-black `#05-#0b`, not pure `#000`, on light grounds; white on dark.
- One saturated accent, used on 1-3 things per shot (an accent word, a button, an underline).
- Supporting text is a step quieter: grey `#5c5f66` - `#929293` on light, `#8b8f98` on dark.
- Colour changes: keyed in linear light (`shape.fillColor`, `text.color`), `"hold"` for an exact swap on
  a beat (r04 S2 colour list).

## 8. UI mocks (bars, typing, cursors)

- Search / prompt pill: height about 15-18 % of its width (r04 497 x 90, radius = height / 2), white on
  `#e4e6e3` or graphite on black. It opens from a dot: scale pop, then width grows with `cubicOut` over
  12 f30 (r06 disc-to-bar 20 f60).
- Placeholder grey, then the query types at 24 chars / s behind a 6 %-of-size caret in the accent colour
  (r04 blue `#0988f6`), solid while typing, blinking at 1 Hz before and after.
- Send button pops after typing with `[0.34, 1.56, 0.64, 1]`; a press squashes to 0.84-0.88 and springs
  back in 6-10 f30.
- Cursor: ballistic `[0.052, 0.057, 0.232, 0.981]` (r06 measured), 7-14 f30 of travel, a slight arc,
  click 2-3 f30 after arrival, UI responds 2 f later.

## 9. Camera (2D null)

- A transparent null at the comp centre is the camera: scale = zoom, position = pan. Content hangs on it.
- Push-in across a shot: 1.0 -> 1.04-1.08, easeInOut (r04 S2, r06 S3).
- Whip / smash zoom on a beat: 1.0 -> 1.45-1.5 in 2-3 f60 with motion blur (r04 S1 f133-136).
- Pull-back to settle: 1.15-1.2 -> 1.0 with `cubicOut` over 22 f30 (r04 S4 f498-529).
- Big moves (r06 zoom-out 1 -> 0.5 with `[0.525, 0.498, 0.414, 0.911]`) carry a whole sequence: one
  continuous camera beats five cuts.
- Masks are comp-space and do not ride the camera: keep pushes small (<= 1.1) on masked titles.

## 10. Transitions (which fits when)

Measured across 87 shot changes: hard cut 28 (32 %), push-out 4, fade 3, ring-zoom 3, zoom 2, white
flash 2 (+ 2 flash variants), gradient / band wipe 2, the rest one-offs (morph, card-flip, circle-wipe,
pixelate, whip-pan, blur-dissolve).

| Transition | Length | When |
| --- | --- | --- |
| Hard cut | 0 | default: between beats of the same idea, on the music beat (r04 every shot, r05 lyric lines) |
| Cut on motion (whip / smash zoom into the cut) | 1-3 f60 | energy up: the outgoing shot accelerates (easeIn) into the cut (r04 S1 to S2) |
| Push (slide the whole shot out) | 12-20 f30 | moving to the next point in a list or story (r02 push-down 41 f60, r03 push-outs 12-20 f30) |
| Band wipe (accent band then cover) | 14-18 f30 | a chapter change or the reveal of a result (r06 S6 white-over-blue wipe 32 f60) |
| White flash | 2 f60 up, 4-6 down | an impact, a "boom" moment, a hard style change (r05) |
| Morph (one shape becomes the next layout) | 16-20 f60 | when two shots share an object (r06 disc becomes the prompt bar) |
| Fade / fade to black | 7-30 f30 | the ending only, or a mood change (r03 end fade 42 f30) |

Do: pick one transition language per piece (cuts + one signature wipe). Don't: put a wipe between every
shot, or fade between beats that should cut.

## 11. Endings

- End on a rest: the lockup holds at least 1 s (r04 S5 70 f60, r06 S6 140 f60).
- Lockup: mark spins in (-90 -> 0 deg, 7 f60) and pops (0.29 -> 1.01, `[0, 0.746, 0.817, 1.133]`), then the
  lockup slides (`[0.595, -0.143, 0.531, 1.082]`, 42 f60) while the wordmark blurs in (r06).
- A URL or call to action is small (2.5-3 %), grey, fades up last.

## 12. Do / don't, with the reference to look at

| Do | Don't | Look at |
| --- | --- | --- |
| Words rise out of an invisible line window, 3 f30 apart, ease out cubic | Fade a whole headline in at once | r02 S1, r04 S3, recipe `kinetic-title` |
| One accent word in serif italic or the accent colour | Accent several words, or mix 3 families | r02 "expensive", r03 script accents |
| Grow UI from a dot, then type into it | Pop a finished UI in fully formed | r06 S2, r04 S1, recipe `prompt-bar` |
| Overshoot 3-9 % on a button or badge | Overshoot text or the camera | r06 send pop, r02 S4 cards, recipe `pop-in` |
| Hold each message 0.7-1 s before the next beat | Keep everything moving all the time | r04 S2 list holds, r07 word fades |
| Cut on the beat; save the wipe for the big reveal | Transition between every shot | r04 (all cuts), r06 S6 wipe, recipe `transition` |
| Motion blur on the fast mover only | Blur every layer | r04 S4 ring, r02 whips |
| Push the camera 4-8 % across a shot | Static frames for 3 s, or a camera that never rests | r04 S2, r06 S3, recipe `scene-camera` |
| Keep text inside 8 % margins, measure before placing | Edge-to-edge headlines, guessed sizes | recipes auto-fit to 84 % width |
| End on a lockup that rests 1 s+ | End mid-motion | r04 S5, r06 S6, recipe `end-card` |

Side-by-sides of the rebuilt references (what matching these numbers looks like):
`artifacts/replicas/rNN/side-by-side.mp4` of the replication step (internal benchmarks: never post them,
they reproduce other creators' work).

## 13. Recipe map

| Recipe | Encodes |
| --- | --- |
| `background` | flat grounds of section 7 |
| `kinetic-title` | sections 2-5: per-word cubic-out rise through a mask, 3 f30 stagger, fit to 84 % width, ease-in exit |
| `blur-in-text` | section 6 blur-in, supporting type scale |
| `type-on` | 24 chars / s typing with caret (section 8) |
| `prompt-bar` | the whole UI-mock beat of section 8 |
| `pop-in` | overshoot pops (sections 1.7, 2) |
| `underline-draw` | expo-out draw-on, ease-in retract |
| `scene-camera` | section 9 |
| `shape-morph` | ease-in-out morphs with overshooting spin (F2 heavy morphs) |
| `transition` | section 10 band wipe / white flash |
| `cursor-click` | measured cursor ease and click timing |
| `end-card` | section 11 lockup |
