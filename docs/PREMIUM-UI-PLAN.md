# FlashFX Premium UI — Renovation Plan (Systems)

Execution plan for the premium-UI renovation. The tokens/rules live in
[`PREMIUM-UI-SYSTEM.md`](./PREMIUM-UI-SYSTEM.md); this doc is the ordered set of **systems** we
renovate (self-contained units, not milestones), their dependencies, and the perf guardrails.

## Context

FlashFX has no design system — 181 hex colors, 13 font sizes, ~3,182 one-off classes — and that
inconsistency is what reads as "raw" instead of premium. A correct token layer already exists in
`index.css`/`tailwind.config.js` but is **dead** (zero component uses). The plan: refine + wire that
token layer, then migrate the app onto it, system by system, in dependency order, **never touching the
timeline/canvas hot paths with decorative effects**. Dark-only; the amber refines to a sparing gold;
neutrals stay subtle-blue; a top-center dynamic island owns progress + toasts.

## Guardrails (apply to every system)

- **Gates:** `tsc` 0 · `lint` at the 127 baseline · `build` green after every system.
- **Perf watch:** eyeball **timeline scrub + playback** after each system — these are the crash-risk
  paths. No new per-frame DOM cost, no new re-renders; respect existing memoization/virtualization.
- **No heavy deps** (no MUI/Chakra/framer-motion). Primitives = Tailwind + a tiny variant helper.
- **The two perf traps** — `backdrop-blur` (only the 4 allowed floating surfaces) and `box-shadow`
  (only the 2 floating tiers). Both **banned in playback hot paths** (clips, playhead, ruler, waveforms).
- **Mechanical where possible** — most of this is token find/replace with zero structural change, so it
  can't regress render or timeline perf.

## The systems (dependency order)

### 1. Token Foundation  ·  deps: none
Promote the dead token layer to the single source of truth and refine it. Rewrite `:root` with the
~20-token palette (refined gold `#D9A521`, white-alpha hairlines, semantic tokens), add
radius/space/control-height/duration/easing/shadow vars, and make **`tailwind.config.js` READ the CSS
vars** (`colors: { surface: 'var(--ffx-surface-1)' … }`) so the two stop drifting. Drop the Inter
`@import` for the native system/SF stack. Structure vars so a future `:root[data-theme='light']` is a
pure override.
- Files: `src/index.css`, `tailwind.config.js`
- Perf: zero runtime cost (CSS vars resolve at paint). Dropping the Inter webfont removes a network
  request + FOUT paint (a real "blends into macOS" + perf win). No JS.

### 2. Type Scale  ·  deps: Token Foundation
Add the 7-step scale (overline/caption/body/body-strong/title/stat/display) as Tailwind `fontSize`
tokens + utilities with baked line-height/tracking/weight; enable `tabular-nums` on numeric contexts;
constrain weights to 400/500/600.
- Files: `tailwind.config.js`, `src/index.css`
- Perf: native stack → free optical sizing/hinting. `tabular-nums` prevents digit-width reflow during
  scrub/playback (a paint win on the timecode/ruler, not just cosmetic).

### 3. Shared Primitives  ·  deps: Token Foundation, Type Scale
Build the component vocabulary the app lacks: `Button` (3 heights, one accent slot),
`Input`/`NumberField` (scrubbable, blue-focus-while-editing), `Field` row, `Modal` shell,
`Menu`/`Popover` shell, `Tab`, `StatusPill`, floating-panel shell. Fold `.input-field`/`.btn-tool` in.
This is what the copy-pasted modals collapse onto.
- Files: `src/ui/primitives/*` (new), `src/index.css`
- Perf: one button/input/menu system everywhere = fewer class combinations = smaller CSS + fewer
  style-recalc variants.

### 4. Accent Migration  ·  deps: Token Foundation
Find/replace the amber family (`#f7b500` ×507, `#ffc83d`, `#ffcc00`, `yellow-400`, and the
**cyan-400-as-accent** in the modals) onto `--ffx-accent`/`-hover`/`-wash`. **Enforce sparingness:**
gold only on selection border, the one primary action per view, active tab, focus ring, playhead,
progress ring — toolbar toggle-state becomes a **neutral `surface-4` pill, not gold**.
- Files: `App.tsx`, `ui/layout/PanelContainer.tsx`, `SilenceStripperModal.tsx`,
  `CaptionGenerationModal.tsx`, `ExportModal.tsx`, `agent-build/AgentBuildOverlay.tsx`
- Perf: pure token substitution, no layout change — cannot regress render/timeline perf.

### 5. Surface & Hairline Migration  ·  deps: Token Foundation
Collapse the 181 raw hexes + charcoal outliers (`#1c2433`/`#1a2233`/`#1e1c1b`/`#1e1e1e`) into the blue
surface ladder; convert the **487 solid `#1a2a42` borders → white-alpha `--ffx-hairline`**; remove
box-shadows from inline panels/cards/inputs/rows in favor of surface-step + top-highlight + hairline;
recess wells (`bg-sunken`) below panels (`surface-1`).
- Files: `App.tsx`, `ui/layout/PanelContainer.tsx`, `ui/panels/*`, `ui/layout/*`
- Perf: high-count elements (list rows, cards, clips) lose box-shadows — each removed shadow is one
  fewer compositor layer easing the compositor the WebGPU timeline shares.

### 6. Elevation & Material Rules  ·  deps: Surface & Hairline Migration
Enforce the one-shadow-tier + blur-only-on-4-overlays policy. Add
`--shadow-overlay`/`--shadow-modal`/`--elev-top-highlight`/`--focus-ring`; strip ~150 inline shadows to
the two tiers; **cut the 26 `backdrop-blur` to ~4** (island, menus, palette, modal scrim) and BAN blur
on timeline/ruler/track-headers/inspector/pinned chrome. Build `--material-menu`/`--material-island`
with semi-opaque fallbacks.
- Files: `src/index.css`, `ui/primitives/*` (Menu/Modal), `ui/panels/*` (pinned chrome → solid),
  timeline components
- Perf: **THE core app-specific perf system.** `backdrop-blur` over the live viewport/timeline re-blurs
  every frame (area × playback-FPS) — removing it from pinned/hot-path chrome is the biggest single
  reclaim.

### 7. Motion System  ·  deps: Token Foundation
Add duration/easing tokens; convert chrome transitions to transform/opacity-only; enforce **zero
transitions on playhead/skimmer/timecode/ruler**; add `prefers-reduced-motion` collapse; reserve the
spring overshoot for the island only. Extend the existing `.animate-ffx-loadbar` pattern.
- Files: `src/index.css`, `ui/primitives/*`, timeline + transport components
- Perf: transform/opacity are GPU-composited (no layout/paint). Zero-transition playback UI keeps the
  playhead locked to the rAF frame clock.

### 8. Timeline Skin  ·  deps: Foundation, Surface&Hairline, Elevation&Material, Motion
Recess the timeline well **darker** than panels so clips float on value; flatten clips (radius-sm + 1px
top-highlight, no shadow); drive clip tint from **role/track** as muted desaturated tints (video=blue-grey,
title=violet, audio=green, caption=gold), never candy-bright; selection = ~2px gold border + range
handles as the only saturated element; hover = ~6–8% white overlay; waveforms as desaturated
semi-transparent texture; white playhead + pink `--ffx-live` skimmer as thin lines.
- Files: `ui/panels/timeline/TrackArea.tsx`, `TrackRow.tsx`, clip render, ruler/playhead
- Perf: clips are the highest-count elements — surface tint + top-highlight, **zero shadow/blur** (banned
  in this hot path); role-tint is a static class (no per-frame cost); playhead/ruler carry zero CSS
  transitions.

### 9. Inspector Rhythm  ·  deps: Type Scale, Shared Primitives
Re-skin the **141-arbitrary-size** Inspector (the single largest type-drift source) onto FCP's
dense-premium rhythm: fixed 28px rows, right-aligned scrubbable `tabular-nums` value column, hairline
dividers + collapsible disclosure sections (no boxed cards), most sliders replaced by click-drag-scrub
fields, blue focus ring only while typing, 2 text colors + the type scale.
- Files: `ui/panels/Inspector.tsx`
- Perf: replacing sliders with scrubbable fields cuts DOM/paint per row.

### 10. Dynamic Island  ·  deps: Foundation, Type Scale, Motion, Elevation&Material
Build the top-center progress+toast/error hub (idle/progress/toast/error, gold determinate ring,
`--material-island`, spring expand) mounted in the toolbar center zone at `z-95`. Wire
export/silence/caption progress + a new `Saved ✓` toast + error toasts into it; clicking routes to the
existing Tasks panel (reuse `openTasks`).
- Files: `src/ui/island/*` (new), `App.tsx` (mount + z-tier), `ExportModal.tsx`, progress stores
- Perf: a single small transient blur surface floating over the **static** toolbar (the one place blur
  is cheap); expand animates transform+opacity in a fixed frame (no reflow).

### 11. Notification Consolidation & Z-Scale  ·  deps: Dynamic Island
Fold the scattered chips into the island (`AutoCaptionProgress`, `ImageSizePrompt`, `MultiFieldWarning`)
and retire their one-off shells; give the panels that stay separate (`SubtitleReviewPanel`,
`QuickTextPanel`, `TasksPanel`) the shared tokenized floating-panel shell. Define the z-scale
(canvas-banner 40 < island 95 < overlays 90–99 < modals 100 < recovery 200 < settings/palette 9999).
- Files: `AutoCaptionProgress.tsx`, `ImageSizePrompt.tsx`, `MultiFieldWarning.tsx`,
  `SubtitleReviewPanel.tsx`, `QuickTextPanel.tsx`, `TasksPanel.tsx`, `src/index.css` (z-scale)
- Perf: removes the over-canvas fixed chips from the viewport's paint region; one shared shell = fewer
  variants; a defined z-scale prevents stacking-context thrash.

## Dependency graph

```
1 Token Foundation ─┬─ 2 Type Scale ──┬─ 3 Shared Primitives ──┬─ 9 Inspector Rhythm
                    │                 │                        └─ (modals rebuild on primitives)
                    ├─ 4 Accent Migration
                    ├─ 5 Surface & Hairline ─ 6 Elevation & Material ─┐
                    └─ 7 Motion System ───────────────────────────────┤
                                                                      ├─ 8 Timeline Skin
                            2,7,6 ─────────────── 10 Dynamic Island ──┴─ 11 Notification Consolidation
```
**Recommended first system: #1 Token Foundation** — everything depends on it, it's mechanical, and it's
zero-runtime-cost. #4 (Accent) and #5 (Surface/Hairline) can follow immediately as pure find/replace.

## Cheap-surface hit-list (which systems fix the worst offenders)

| Surface | File | Fixed by |
|---|---|---|
| **SilenceStripperModal** (headline offender — cyan-as-accent, 5 ad-hoc sizes, raw hexes) | `ui/panels/SilenceStripperModal.tsx` | #3 Primitives, #4 Accent, #2 Type |
| **CaptionGenerationModal** (same cyan problem, copy-pasted chrome) | `ui/panels/CaptionGenerationModal.tsx` | #3, #4, #2 |
| **ExportModal** (a third progress accent — yellow-400) | `ui/panels/ExportModal.tsx` | #4, #10 Island |
| TasksPanel (fractional sizes, bespoke surfaces) | `ui/panels/TasksPanel.tsx` | #2, #5 |
| Floating chips (AutoCaption/Subtitle/QuickText, one-off shells) | `ui/panels/AutoCaptionProgress.tsx` + siblings | #3, #10, #11 |
| Inspector density (141 arbitrary sizes) | `ui/panels/Inspector.tsx` | #9 |
| AgentBuildOverlay (hardcoded `#f7b500`) | `ui/agent-build/AgentBuildOverlay.tsx` | #4 |
| App shell + PanelContainer chrome | `App.tsx`, `ui/layout/PanelContainer.tsx` | #4, #5 |

## Verification per system
- `tsc` 0 · `lint` 127 · `build` green.
- Visual eyeball of the changed surfaces (browser-gated — WebGPU isn't runnable in the harness env).
- **Perf: scrub + play a busy multi-clip timeline** after #5/#6/#7/#8 especially; confirm no new
  compositor layers over the viewport (DevTools Layers/Rendering) and no playhead lag.

---

*Status: system + plan documented. Awaiting "go" on the first system (#1 Token Foundation).*
