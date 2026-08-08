# FlashFX — Animation Templates ("use this" → inserts a fully-keyframed animation)

## 0. Goal

A browsable library of **pre-built animations** — not just graphics, but the **layers + keyframes +
interpolation** together. The user opens a gallery (animated calendar, number counters, lower-thirds,
animated lists, chart draw-ons, logo stings…), clicks **"Use this"** (or drags to the canvas), and a
complete, ready-made animation drops onto the timeline **at the playhead**, as a group they can then
freely edit piece-by-piece. One undo removes it. We want **a lot** of these, and adding more must be
cheap.

This is distinct from two things already in the repo:
- **Deep-link templates** (`src/templates/`) seed a whole *project* from a URL. Animation templates
  insert *into the current composition*.
- **Animation Items** (`src/animation-items/`) are single, data-driven widgets re-resolved every frame
  by an engine (parametric, not directly editable). Animation **templates** expand into ordinary
  shape/text/group layers with real keyframes the user owns and edits. Different value prop; some
  visual overlap is fine.

---

## 1. Grounding — verified facts that shape the design

From a three-part read of the code (insertion primitives, UI surfaces, data model):

- **Layers are flat.** `Composition.layers: Layer[]`; parenting is by `parentId` (a group is just a
  flat `GroupLayer` with `collapsed`, **no `children` array** — `core/types.ts:401`). Children carry
  `parentId = group.id`.
- **Keyframes have no id** (`core/types.ts:16`): `{frame, value, interpolation, handleIn, handleOut,
  tangentMode?}`. Identity is the frame. `InterpolationType = 'linear'|'bezier'|'hold'|'spring'`
  (`:14`). `AnimatableProperty` (`:26`) is the id-bearing unit (`{id,name,valueType,defaultValue,
  keyframes}`).
- **Transform** = five `AnimatableProperty`s: `position`(vec2), `rotation`(deg), `scale`(vec2, 1=100%),
  `anchorPoint`(vec2), `opacity`(number, 1=100%) — field is `anchorPoint`, not `anchor`.
- **Text keyframes live in `animOverrides`** (`fontSize/lineHeight/letterSpacing/strokeWidth`), NOT in
  the span style (`core/types.ts:127`). Content is `content.spans[].{text,style}`; align is
  `layoutConfig.horizontalAlign`.
- **Factories mint fresh ids** and identity transforms: `createRectangleLayer/CircleLayer/StarLayer/
  PolygonLayer/TextLayer/GroupLayer`, `createProperty(name,valueType,default)`,
  `createKeyframe(frame,value,interpolation='linear')` (handles default `[0,0]`), `uid()`
  (`core/factory.ts:42-451`). Keyframes are pushed into the returned properties by hand.
- **No existing "insert a pre-animated group at the playhead" primitive.** The closest reusable
  pieces (all `store/editor.ts`): `pasteClipboard` (`:4041`) and `duplicateSelection` (`:4141`) for the
  clone→track→settle→`exec` loop; `createGroup` (`:3918`) for parent-linking + top-of-stack insertion;
  `ensureLayerHasTrack` (`:638`), `settleComposition` (`:762`), `sel()` (`:121`), the `exec({label,
  execute,undo})` undo wrapper (`:881`). Playhead = `useTimelineStore.getState().currentFrame`.
- **Gotcha:** the existing paste path (`instantiatePastedLayer`, `:962`) hard-nulls `parentId` and only
  remaps ids for physics bindings — so it flattens groups. We avoid this entirely by **building
  presets with the factories at insert time** (ids are already fresh and parent-linked), rather than
  cloning a JSON blob.
- **Inserted layers are standard shape/text/group** and already pass the `validation.ts` whitelist and
  serialize/deserialize round-trip — **no persistence changes needed** (contrast cloner/precomp, which
  were silently stripped until whitelisted). Presets must only use whitelisted layer types + genuine
  `AnimatableProperty` objects (else keyframes get stripped).
- **UI home:** `MediaPool` (`ui/panels/MediaPool.tsx`) is a tabbed left panel mounted in every non-review
  layout (reachable from `main.tsx`). A new tab = one entry in `TABS` (`:48`), one case in the `PoolTab`
  union (`:22`), one branch in the content switch (`:288`). It already has the sub-tab pattern
  (Icons Static/Animated), lazy-loading (`AnimatedIconsTabLazy`), a virtualized grid, and a
  drag-to-canvas dataTransfer convention (`handleDragStart`, `:158`).
- **Catalog pattern to mirror:** `ANIMATION_ITEM_PRESETS` (`animation-items/presets.ts:17` — named
  config + a store action that takes a name) for the data+insert shape, plus `animation-builder`'s
  `PRESETS` taxonomy (`{id,name,category:'intro'|'idle'|'outro'|'effect',description}`) for gallery
  filtering.

---

## 2. Architecture

New module **`src/animation-templates/`** (distinct from `src/templates/`), pure and harness-testable,
with a thin store action wiring it into the editor — mirroring the cloner engine convention.

```
src/animation-templates/
  kit.ts          # authoring helpers: easing constants + keyframe/track/motion builders
  types.ts        # AnimationTemplate, BuildCtx
  catalog.ts      # AnimationTemplate[] — the whole library (imports per-category files)
  categories/     # calendar.ts, titles.ts, counters.ts, lists.ts, charts.ts, ... (the builders)
  instantiate.ts  # PURE: template + playhead + fps + center → ready Layer[] (rebased, parent-linked)
  preview.ts      # PURE: evaluate a template's layers at time t → draw primitives (for Canvas2D preview)
```

### 2a. Templates are **builder functions**, not static JSON

Authoring dozens of animations as raw keyframe JSON is unmaintainable. Instead each template is a
function that assembles layers with the factories and a small motion kit:

```ts
// types.ts
export interface BuildCtx {
  center: [number, number];   // where to place the animation (comp center or drop point)
  frameRate: number;
  params?: Record<string, unknown>; // template-specific knobs (month, highlightDay, text, colors…)
}
export interface AnimationTemplate {
  id: string;                 // stable slug: 'calendar-month', 'counter-percent'
  name: string;
  category: TemplateCategory; // 'calendar' | 'titles' | 'counters' | 'lists' | 'charts' | ...
  description: string;
  tags: string[];             // search
  durationFrames: number;     // template length at authoring fps (24/30)
  authorFps: number;          // fps the keyframes were authored at (rebased on insert)
  thumbnail?: string;         // optional static poster (data-URL); preview.ts is the live fallback
  build: (ctx: BuildCtx) => Layer[]; // fresh-id, parent-linked, 0-based keyframes
}
```

`build` returns layers with **fresh ids** (from factories), **`parentId` already linked** to the group
it creates, keyframes authored **0-based** (frame 0 = animation start), positions relative to
`ctx.center`. Because everything is freshly minted, there is **no clone / id-regen / idMap step** — we
sidestep the paste-path gotchas.

### 2b. The motion kit (`kit.ts`) — where the "a lot of them, cheaply" comes from

A tiny library so every template reads like choreography, not plumbing:

- **Easing constants** (reuse the app's own handles from `menuDefinitions.ts`): `EASE_OUT`, `EASE_IN`,
  `EASE_IO`, plus `SPRING` (interpolation `'spring'`) for bouncy pops. Centralized here.
- **`track(name, valueType, keys)`** → an `AnimatableProperty` from `[{f,v,ease?}]`.
- **Property setters:** `animate(layer, 'transform.opacity', keys)`, `animate(layer,
  'transform.position', keys)`, etc. (thin `deepSet` onto the factory layer).
- **Motion presets (compose keyframes):** `fadeIn(l, at, dur)`, `flyIn(l, at, dur, from)`,
  `popIn(l, at, dur)` (scale 0→1 spring), `scaleIn`, `drawOn` (stroke dash reveal / mask), `pulse(l,
  at, period)` (loop), `float`, `wiggle`, `countUp(textLayer, at, dur, from, to, fmt)` (emits per-frame
  text values → keyframed via a numeric proxy + a text builder), `stagger(layers, at, step, fn)`.
- **Builder shorthands:** `circle(center, r, color)`, `label(text, pos, {font,size,weight,color,align})`,
  `roundedCard(pos, w, h, r, color)` — thin wrappers over the factories that also set fill/stroke.

Adding a template becomes ~15–40 lines of readable choreography.

### 2c. Instantiation (`instantiate.ts`, PURE) + one thin store action

**Pure** `instantiateTemplate(template, { playhead, frameRate, center }): Layer[]`:
1. `layers = template.build({ center, frameRate, params })`.
2. Rebase time: `scale = frameRate / template.authorFps`; for every `AnimatableProperty` in every
   layer, `kf.frame = round(playhead + kf.frame * scale)`; shift each layer `inPoint/outPoint` the
   same way. (Walker identical to `processAnimatables`' shape.)
3. Return the ready layers (group first for z-order).

**Thin store action** `insertAnimationTemplate(id, atCenter?)` in `store/editor.ts` (modeled on
`pasteClipboard`):
```
const playhead = useTimelineStore.getState().currentFrame;
const layers = instantiateTemplate(tpl, { playhead, frameRate: comp.settings.frameRate, center });
let working = composition;
for (const l of layers) working = ensureLayerHasTrack({ ...working, layers:[...working.layers, l] }, l);
const newComp = settleComposition(working);
const newSel  = sel(layers.map(l=>l.id), groupId);
exec({ label: `Insert “${tpl.name}”`, execute: () => set({composition:newComp, selection:newSel}), undo: () => set({composition:oldComp, selection:oldSel}) });
```
Gotchas handled: settle called once at the end (direct `set` bypasses auto-settle); group inserted
first so children stack under it; `ensureLayerHasTrack` packs non-overlapping same-type clips (fine).

### 2d. UI — the gallery (a MediaPool tab)

- Add `{ id:'animations', label:'Animations', icon:<Clapperboard/> }` to `MediaPool.TABS`; extend
  `PoolTab`; render `<AnimationTemplatesTab/>` in the switch.
- The tab: **category chips** (Calendar, Titles, Counters, Lists, Charts, Backgrounds, Transitions,
  Callouts, Emphasis, Logo) + a search box (matches name/tags) + a virtualized grid of **preview
  cards**. Each card: preview + name + a **"Use this"** button → `useEditorStore.getState().
  insertAnimationTemplate(id)`.
- **Drag-to-canvas:** reuse `handleDragStart` dataTransfer (`application/x-anim-template`, `{id}`); the
  Viewport drop handler calls `insertAnimationTemplate(id, dropPointInCompSpace)` so the animation lands
  where dropped. (Click = comp center.)

### 2e. Live previews (`preview.ts` + a Canvas2D card) — no WebGPU needed

Our templates use a constrained primitive set (shapes + text + group transforms/opacity), so we can
draw an animated thumbnail with **Canvas2D**, driven by the existing **pure** evaluators
(`core/interpolation.ts` `evaluateNumber`/`evaluateVec2`) — no renderer, no worker:
- `preview.ts` walks a built template's layers, evaluates each layer's transform + shape/text at time
  `t`, and emits draw ops; a `<TemplatePreview>` component runs a `requestAnimationFrame` loop into a
  small `<canvas>`, scaled to fit, looping the `durationFrames`.
- **Hover-to-play** (static first frame until hover) keeps the grid cheap; optional authored
  `thumbnail` poster as an even cheaper fallback.
- This is the one genuinely new rendering surface; scoped to its own phase and degradable (static
  poster works without it).

---

## 3. The catalog (what we can build — aim for a lot)

Authored as `categories/*.ts`. First-wave targets in **bold**; the rest are the easy follow-on backlog
(each is ~15–40 lines with the kit). ~50 to start, open-ended.

**Calendar & date/time**
- **`calendar-month`** (flagship): a rounded card; month title flies in; weekday header row
  (S M T W T F S) staggers in; a 7×N grid of day **circles + number labels** cascades in (staggered
  `popIn`); one **highlighted day** recolors + `pulse` loops with a ring draw-on. Params: `month`,
  `year`, `highlightDay`, `firstWeekday`, colors. Demonstrates graphics + keyframes + stagger + loop in
  one. (A `calendar-week` mini variant for tighter layouts.)
- **`countdown-days`** ("3 days left" flip), **`date-reveal`** (DD·MM·YYYY odometer),
  **`analog-clock`** (hands sweep — hour/minute rotation keyframes), `digital-clock`.

**Titles & lower-thirds**
- **`title-rise`** (headline + underline draw-on), **`lower-third-slide`** (name + role bar slides in,
  holds, slides out — intro+outro), `kicker-title`, `split-title` (two lines counter-slide),
  `mask-wipe-title`, `type-on-title` (per-word stagger).

**Counters & numbers**
- **`counter-number`** (0→N count-up, eased), **`counter-percent`** (with a % and a sweeping ring),
  **`counter-currency`** ($ odometer), `stat-callout` (big number + label pop), `plusminus-delta`
  (green/red rise).

**Lists & steps**
- **`bullet-list`** (staggered dot+text reveal), **`checklist`** (items reveal then checkmarks
  draw-on), `numbered-steps`, `pros-cons` (two columns), `feature-grid` (staggered cards).

**Charts & data (keyframed, editable — vs the parametric gauges)**
- **`bar-chart-grow`** (bars scaleY from 0, staggered), **`donut-sweep`** (arc draw-on + center
  counter), `line-draw` (polyline draw-on), `progress-ring`, `rating-stars` (stars pop + fill).

**Scenes** (looping illustrated backdrops — BUILT: `beach-waves`, `forest`, `night-sky`, `galaxy`)
- **`beach-waves`** (sun+glow, drifting clouds, rolling foam waves, bobbing ball), **`forest`** (layered
  swaying trees + drifting leaves + glowing sun), **`night-sky`** (glowing moon, twinkling stars,
  looping shooting star, hill silhouette), **`galaxy`** (glowing core + planets on tilted elliptical
  orbits over a starfield). Backlog: `sunset`, `rain`, `mountains`, `city-skyline`, `underwater`, `snow`.
  Built on kit loop helpers (`floatLoop`/`swayLoop`/`spinLoop`/`twinkle`/`glow`/`orbit`), authored
  back-to-front so track-stacking gives correct z-order.

**UI** (device/app mockups — BUILT: `phone-messages`)
- **`phone-messages`** (chat bubbles pop into a phone one by one, with a typing indicator). Backlog:
  `notification-stack`, `app-onboarding`, `progress-checkout`, `like-counter`.

**Fun** (delightful one-offs — BUILT: `pen-writing`, `clock`, `fireworks`)
- **`pen-writing`** (a pen glides across paper as handwriting draws on, line by line — uses a nested
  nib parented to the pen body), **`clock`** (sweeping hour/minute/second hands via nested rotating
  pivot groups), **`fireworks`** (launch streaks + radial spark bursts via `burstOut`). Backlog:
  `coffee-steam`, `rocket-launch`, `confetti-pop`, `heartbeat-ekg`, `loading-orbit`.

  > Nesting note: `assemble()` now only parents children whose `parentId` is null, so templates can
  > build multi-level hierarchies (pivot groups, pen nib). Parent rotation composes into children
  > (`interpolation.ts:471-482`), which is what makes clock hands and orbits work.

**Backgrounds & shapes**
- **`gradient-drift`** (animated gradient bg loop), `blob-morph` (polygon vertex tween), `grid-parallax`,
  `confetti-burst` (shape particles via staggered fly-out), `geometric-loader` (loop).

**Transitions & reveals**
- **`wipe-reveal`** (mask box open), `curtain-open`, `box-open`, `circle-iris`, `slide-stack`.

**Callouts & annotations**
- **`arrow-pointer`** (draw-on + bob), `circle-highlight` (ring draw-on + pulse), `underline-scribble`,
  `speech-bubble-pop`, `tooltip-tag`.

**Emphasis / idle loops** (loopable, applied to a spot)
- **`pulse-loop`**, `float-loop`, `wiggle-loop`, `breathe-loop`, `shine-sweep`.

**Logo / brand stings**
- **`logo-pop`** (scale+glow reveal), `badge-spin`, `emblem-assemble` (parts fly together), `shine-reveal`.

> Each entry is independent data — reordering/adding is a one-file change, so the catalog grows
> incrementally without touching the engine or UI.

**Where users get them (roadmap):** v1 = the built-in curated catalog (code/data, ships in the app).
Later: **user-saved templates** ("select layers → Save as animation template" — snapshot the selected
subtree via the same instantiate format, store in IndexedDB/Supabase), then **cloud template packs**
(Supabase-hosted, seasonal/brand packs) and community sharing. The deep-link system can also carry a
`?insert=<templateId>` to drop one straight into a new project.

---

## 4. Testing (`npm run verify:anim-templates`)

The build+instantiate core is **pure**, so it gets a real harness (esbuild + `node:assert`, per repo
convention). Assert, for **every** template:
- `build(ctx)` returns ≥1 layer; exactly one root group; all children `parentId` point at layers in the
  set; all ids unique.
- Every animated field is a genuine `AnimatableProperty` with a non-empty `keyframes` array; keyframe
  `value`s non-null; frames monotonic per property.
- `instantiateTemplate` rebases correctly: with `playhead=P`, the earliest keyframe lands at `P`;
  fps-rescale is applied; `inPoint>=P`.
- **Round-trip:** each built layer survives `validateComposition` → `serialize`/`deserialize`
  unchanged in the fields that matter (this catches any accidental use of a non-whitelisted field —
  the exact class of bug that bit cloner/precomp).
- The calendar flagship: correct cell count for a given month, highlighted cell recolored, header row
  present.

`typecheck` 0, `build` OK, `lint` at the 127 baseline gate as always.

---

## 5. Phased build

1. **Engine + flagship (provable):** `kit.ts`, `types.ts`, `instantiate.ts`, a `catalog.ts` with
   **4–6 templates including `calendar-month`**, the `insertAnimationTemplate` store action, and a
   **minimal Animations tab** (static cards + "Use this", no live preview yet). Ship
   `verify:anim-templates`. This proves end-to-end insert + undo + round-trip.
2. **Live previews:** `preview.ts` + `<TemplatePreview>` Canvas2D (hover-to-play), drag-to-canvas
   insert at the drop point.
3. **Catalog expansion:** fill out the categories to ~50 templates; category chips + search polish;
   per-template params surfaced (a small "customize" popover: month, text, colors) before insert.
4. **User-saved + cloud (optional):** "Save selection as template", IndexedDB store, then Supabase
   packs + community.

Files touched: new `src/animation-templates/**`; `store/editor.ts` (+`insertAnimationTemplate`);
`ui/panels/MediaPool.tsx` (+tab) and a new `AnimationTemplatesTab.tsx`; Viewport drop handler (Phase 2);
`scripts/verify-anim-templates.mjs` + `package.json` script. No `validation.ts`/serialization changes
(standard layers).

---

## 6. Risks / open questions

- **Preview fidelity:** the Canvas2D previewer approximates the WebGPU look (fills, text, opacity,
  transforms) — good enough for a gallery, but glow/shadow/gradients won't match exactly. Static
  posters are the fallback for templates that rely on effects. (Phase 2, degradable.)
- **Layer count:** the full calendar is ~70–80 layers. Fine for the renderer, one undo entry, and it
  round-trips — but offer a `calendar-week` mini variant for tighter comps. Nothing else approaches
  that count.
- **`countUp` text:** per-frame changing text isn't a normal keyframable field. Options: (a) a numeric
  proxy property + a resolve-time text formatter (needs a small hook), or (b) bake N text keyframes as
  discrete `hold` steps. Phase 1 uses (b) (simple, editable, round-trips); revisit (a) if we want
  smooth arbitrary-precision counters. (Note: `animation-items` already has parametric counters if the
  user wants the non-editable version.)
- **Determinism:** `build` may use randomness for authoring variety (e.g. confetti) — seed it so
  inserts are reproducible; keyframe evaluation itself is already pure.
- **Params UX:** how much to expose before insert (month/text/colors) vs. edit-after. Plan: insert with
  sensible defaults; a lightweight pre-insert "customize" popover in Phase 3.
