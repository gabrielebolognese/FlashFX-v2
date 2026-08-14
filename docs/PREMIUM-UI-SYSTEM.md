# FlashFX Premium UI — Design System

The single source of truth for the premium-UI renovation. Dark-only, WebGPU-safe, refines (does not
replace) the existing navy-blue identity, and takes Final Cut Pro's value discipline. Execution order
lives in [`PREMIUM-UI-PLAN.md`](./PREMIUM-UI-PLAN.md).

## Context — why it feels "raw", and the shape of the fix

FlashFX doesn't have a *bad* design; it has **no design system**. Measured today: **181 distinct
hardcoded hex colors**, **13 ad-hoc font sizes** (`text-[8px]`…`text-[15px]`), **~3,182 inline
arbitrary Tailwind classes**, **26 `backdrop-blur`**, **~150 `shadow`** — every component invents its
own look, and inconsistency is exactly what reads as "raw Samsung." Premium (Apple / Linear / FCP)
comes from ruthless consistency out of a tiny token set.

Two grounding facts shape the whole plan:
1. **A correct token layer already exists but is DEAD.** `src/index.css :root` + `tailwind.config.js`
   define `surface-0..5`, `edge`, `accent` in the right blue-tinted spine — but **zero components use
   them** (grep of `bg-/text-/border-surface|edge|accent` = 0). So we *refine + wire* the existing
   tokens and find/replace the 181 hexes onto them; we don't invent from scratch.
2. **The app's real perf trap is `backdrop-blur` over the live WebGPU viewport/timeline** — its cost ≈
   blurred-area × playback-repaint-rate. This constrains the material rules below.

**Locked direction (founder):** refine the amber → a deeper, sparingly-used premium gold; keep a
**subtle-blue** coherent neutral scale (not charcoal); a top-center **dynamic island** for
**progress + toasts/errors only** (Tasks panel stays separate); **dark-only** for now (light theme = a
later var swap).

---

## 1. Color tokens

~20 semantic tokens collapse the 181 hexes. Defined once as CSS vars on `:root`; Tailwind reads them.
`text-primary` is a **cool off-white, never pure `#FFFFFF`** (halation on dark reads amateur).
Hierarchy comes from the **value step**, not from hue.

### Surfaces (the blue ladder — depth = a lighter step, never a shadow)
| Token | Hex | Use |
|---|---|---|
| `--ffx-bg-sunken` | `#070F1C` | Deepest wells: timeline track well (kept **darker** than panels so clips float on value — FCP's move), viewport letterbox, gutters, collapsed rail |
| `--ffx-bg` | `#0A1424` | App/root shell background |
| `--ffx-surface-1` | `#0E1B2E` | **Dominant panel fill** — inspector body, timeline chrome, sidebars |
| `--ffx-surface-2` | `#142338` | Raised — cards, inputs, buttons, clip bodies, list rows at rest |
| `--ffx-surface-3` | `#1A2A42` | Overlays — menus, popovers, dropdowns, dynamic-island base |
| `--ffx-surface-4` | `#21344E` | Hover on rows / active input / **neutral** toolbar-toggle pill (NOT gold) |
| `--ffx-surface-5` | `#2A3F5C` | Pressed / selected-neutral rows, scrollbar thumb, range tracks |

### Lines (white-alpha, so they adapt to any surface — replaces 487 solid `#1a2a42` borders)
| Token | Value | Use |
|---|---|---|
| `--ffx-hairline` | `rgba(255,255,255,0.08)` | Structural dividers between panels/rows/sections (renders true 0.5px on 2×) |
| `--ffx-border` | `rgba(255,255,255,0.14)` | Stronger edge — input borders, focused outline, segmented separators |

### Accent (the gold — under **5% of pixels**)
| Token | Hex | Use |
|---|---|---|
| `--ffx-accent` | `#D9A521` | THE gold. Selection border (~2px, the only saturated thing on screen), the **one** primary action per view, active tab underline, focus ring, playhead, determinate progress ring. **Refined ~15% less-saturated from the neon `#f7b500`.** |
| `--ffx-accent-hover` | `#F0BD45` | Brighter gold — hover/pressed on primary + active tab; lighter progress-ring stop |
| `--ffx-accent-wash` | `rgba(217,165,33,0.12)` | Selection/active-tab background wash (paired with the gold border — **never** a solid gold fill) |
| `--ffx-accent-dim` | `#A87D18` | Muted gold — disabled-accent, low-emphasis gold |
| `--ffx-on-accent` | `#12161C` | Near-black text/icon **on** gold fills (white-on-gold reads cheap) |

### Text (hierarchy via value step)
| Token | Hex | Use |
|---|---|---|
| `--ffx-text-primary` | `#E6EDF6` | Primary — inputs, active labels, values, headings (~94%, cool off-white) |
| `--ffx-text-secondary` | `#94A3B8` | Section/menu/inspector labels, hints (de-facto `slate-400`, 218 uses) |
| `--ffx-text-tertiary` | `#64748B` | Eyebrows, meta, placeholder, timeline sub-labels (`slate-500`, **547 uses** — the app's most-used text class) |
| `--ffx-text-muted` | `#475569` | Muted/disabled, collapsed-rail labels |

### Semantic (desaturated to live inside the cool-dark world — a candy-bright green/red reads as a different app)
| Token | Hex | Use |
|---|---|---|
| `--ffx-success` | `#3DBE7A` | "Saved ✓", completion |
| `--ffx-danger` | `#E5545A` | Errors/destructive — **distinct** from selection gold so status never collides with selection |
| `--ffx-info` | `#4C86D6` | Info + the **numeric-field-editing focus ring** (FCP shows blue only while a field is being typed) |
| `--ffx-live` | `#FF3B5C` | Timeline **skimmer** / hover-scrub line — a thin pink line, distinct from the white real-playhead and gold selection (FCP's three-way separation). Never a fill. |

---

## 2. Type scale

Native system stack (renders as **SF Pro** on macOS — zero download, native optical sizing; the single
biggest "blends into a Mac" lever). **Drop the Inter `@import`.** Weights constrained to **400/500/600
(no 700)**. `tabular-nums` on any numeric context.

`--ffx-font-ui: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Segoe UI", system-ui, sans-serif`
`--ffx-font-mono: "SF Mono", ui-monospace, "SFMono-Regular", "Cascadia Code", "JetBrains Mono", monospace`

| Name | px | Weight | Line-height | Tracking | Use |
|---|---|---|---|---|---|
| `overline` | 10 | 600 | 12px | +0.4px | UPPERCASE section/group labels, panel-header eyebrows (the single most-reused label pattern) |
| `caption` | 11 | 500 | 14px | +0.05px | Metadata, clip/chip labels, badges, timecode. Collapses ~876 of the smallest usages (8–9px rounds **up** to 11 except ultra-dense clip labels) |
| `body` | 12 | 450 | 16px | 0 | **Default UI text** — menu items, inspector rows, inputs, toolbar/button labels |
| `body-strong` | 12 | 600 | 16px | 0 | Active/selected labels, the right-aligned numeric value column (hierarchy from weight, not color) |
| `title` | 13 | 600 | 18px | −0.1px | Panel/section/inspector titles, dialog & side-panel headers |
| `stat` | 15 | 600 | 20px | −0.2px | Emphasis numerals — cut-count/time-saved, export %, FPS/duration. `tabular-nums` **required** |
| `display` | 22 | 600 | 26px | −0.4px | Splash/dashboard/onboarding/empty-state headings **only** (outside the dense editor) |

---

## 3. Spacing, control heights, radius

**Spacing** — 4px grid: `2,4,6,8,10,12,16,20,24,32,40,48`. Map the ~3,182 arbitrary values onto this;
kill the `3/5/7/9/13/15px` one-offs. Dense pro tools lean hardest on 4/6/8/12.

**Control heights — locked to 3** (consistent heights are the single most "designed" feeling in a
dense tool):
- `--h-compact: 24px` — timeline chips, dense toolbar
- `--h-default: 28px` — standard controls, inspector rows, menu items
- `--h-comfortable: 32px` — primary buttons

Component padding: button `6/10` · input `5/8` · menu-item `6/10` · panel `12` · section-gap `16` ·
list-row-gap `2` · inspector-row-gap `4`. Every cluster gets 8–16px breathing room — **density with
air**; cramming to panel edges reads cheap.

**Radius** (big rounded corners read consumer; pro tools stay 4–8px):
- `--radius-sm: 4px` — inputs, chips, small toggles, **timeline clips**
- `--radius-md: 6px` — buttons, cards, clip bodies, segmented cells
- `--radius-lg: 8px` — panels, popovers, menus
- `--radius-xl: 12px` — modals
- `--radius-island: 14px` — the dynamic island (the one signature exception)
- `--radius-pill: 999px` — segmented toggles, status pills, collapsed island
- Nested rule: inner radius = outer − inner padding (concentric corners stay parallel).

---

## 4. Elevation & materials — the performance core

**Depth = a lighter surface step + a hairline (+ a top-highlight), NOT a shadow.** Cut the ~150
inline shadows to two floating tiers. High-count elements (clips, list rows, cards, inputs) get
**surface-step + top-highlight + hairline, zero box-shadow** — N shadowed elements = N compositor
layers competing with the WebGPU timeline.

| Token | Spec | Use |
|---|---|---|
| `--shadow-overlay` | `0 8px 24px -4px rgba(0,0,0,.50), 0 2px 6px -2px rgba(0,0,0,.40)` | THE shadow tier — floating overlays ONLY (menus, popovers, palette, island) |
| `--shadow-modal` | `0 16px 48px -8px rgba(0,0,0,.60), 0 4px 12px -4px rgba(0,0,0,.45)` | Optional 2nd tier — full blocking modals only |
| `--elev-top-highlight` | `inset 0 1px 0 rgba(255,255,255,.05)` | Apple's 1px light top edge on raised surfaces (replaces bottom borders/shadows on inline elements) |
| `--focus-ring` | `0 0 0 2px rgba(217,165,33,.55), 0 0 0 4px rgba(217,165,33,.15)` | Gold focus/selection ring; swap to info-blue while a numeric field is being **typed** |

### Material rules (the app-specific perf policy — non-negotiable)
- **`backdrop-blur` is ALLOWED on exactly 4 surfaces**, all transient + floating over *static* content:
  (1) the dynamic island, (2) menus/dropdowns/popovers, (3) the command palette, (4) the modal scrim.
- **`backdrop-blur` is BANNED** on: timeline, ruler, track headers, inspector, any pinned side panel,
  the toolbar, timeline clips, and anything pinned over the playing viewport. Reason: blur re-samples
  and re-blurs its backdrop **every frame**, and here the backdrop is a live WebGPU viewport/timeline
  repainting at playback FPS. **Cut the 26 blurs to ~4.**
- When blur IS used: `backdrop-filter: blur(24px) saturate(1.8)` (the `saturate(1.8)` is Apple's
  vibrancy trick), cap radius 20–30px, and **always** ship a semi-opaque fallback bg (`surface-3` @
  ~0.82) so it stays readable and cheap if blur is dropped.
  - `--material-menu`: `rgba(26,42,66,0.85)` + `blur(28px) saturate(1.8)` + `--ffx-border` + `--shadow-overlay` + top-highlight
  - `--material-island`: `rgba(20,35,57,0.78)` + `blur(20px) saturate(1.8)` + radius 14px + `--shadow-overlay` + top-highlight
- **Pinned chrome is SOLID** (toolbar/panels/timeline/inspector at 100% opacity). Translucency is
  earned by floating over static content, never the default.
- **Zero `backdrop-blur` AND zero `box-shadow` in playback hot paths** (clips, playhead, ruler, waveforms).

---

## 5. Motion

**Fast, decelerating, `transform`/`opacity`-ONLY** (both GPU-composited — no layout/paint, so animation
never contends with the WebGPU render). Nothing over ~320ms in chrome.

- Durations: `--dur-instant 80ms` (hover), `--dur-micro 120ms` (press/toggle/tab/tool), `--dur-standard
  200ms` (dropdown/panel reveal), `--dur-large 300ms` (modal/island expand). **Hard ceiling 320ms.**
- Easing: `--ease-out cubic-bezier(0.2,0,0,1)` (entering), `--ease-in cubic-bezier(0.4,0,1,1)` (leaving),
  `--ease-move cubic-bezier(0.4,0,0.2,1)` (position), `--ease-spring cubic-bezier(0.34,1.3,0.64,1)` —
  overshoot **only** for the island expand, banned everywhere else.
- **Never animate** `width/height/top/left/margin/padding/box-shadow/backdrop-filter`, or `background-color`
  in hot paths. Size changes use `transform: scale()` in a fixed max-size frame. `will-change: transform`
  only *while* animating, removed after.
- **Playback-critical: ZERO CSS transitions on the playhead, skimmer, timecode readout, ruler** — driven
  by the engine's `requestAnimationFrame`, must update at 0ms (a transitioned playhead lags the frame/audio
  clock and looks broken). `index.css` already models this with the transform-only `.animate-ffx-loadbar`
  keyframe — extend that discipline.
- List/menu enter: 24ms stagger, capped at 200ms total. `@media (prefers-reduced-motion: reduce)` →
  collapse to opacity-only/instant.

---

## 6. The Dynamic Island

A top-center hub for **progress + toasts/errors only** — the transient *aggregate* summary. It replaces
the scattered bottom-right/over-canvas status chips and unifies the three divergent progress accents
(export=yellow, captions/silence=cyan, tasks=amber) onto **one gold ring**. The **Tasks log panel stays
a separate detailed surface** the island routes to (FCP's background-tasks *gauge* vs *window* split).

- **Placement:** fixed top-center, docked in the toolbar's center zone (once the toolbar is zoned:
  tools-left / transport+timecode-center / view-toggles-right). Resolves the `ImageSizePrompt` collision.
- **Z-tier:** `z-95`, part of a new z-scale: canvas-banner 40 < island 95 < overlays/menus 90–99 <
  modals 100 < recovery 200 < settings/palette 9999.
- **States:** *idle* → a minimal pill or absent (quiet, no persistent chrome). *progress* → a thin
  **determinate gold ring** (donut filling clockwise, FCP's gauge) + one-line status, aggregating ALL
  running work into one ring. *toast* → icon + short message, auto-collapse (`Saved ✓` in success green).
  *error* → warning icon + message in danger red, sticky until dismissed.
- **Material:** `--material-island` (blur permitted here — small, transient, floats over the *static*
  toolbar, not the live viewport). **Expand animates `transform: scale()` + opacity in a fixed frame**
  (never width/height) with the one allowed spring overshoot; ring fill is `stroke-dashoffset`/transform only.
- **Interaction:** click/expand routes to the separate Tasks panel (`AutoCaptionProgress` already calls
  `openTasks` — reuse it).
- **Migrates in:** `AutoCaptionProgress` chip, `ExportModal` progress, `ImageSizePrompt`,
  `MultiFieldWarning`, and a **new `Saved ✓` toast** (no save indicator exists today).
- **Stays separate:** `TasksPanel` (the detailed log), `SubtitleReviewPanel` (interactive review),
  `AgentBuildOverlay` (ambient full-screen effect).

---

## 7. Premium principles (the through-line)

1. **Value discipline over decoration** — a narrow, evenly-stepped surface ladder; depth from lighter
   surfaces + hairlines, not shadows or borders.
2. **One accent, used sparingly** — gold under 5% of pixels; neutral hover states; color reserved for
   meaning (status) and one primary action.
3. **Relentless reuse** — one button/input/menu/field system used everywhere. This is Apple's real
   "secret," and the cure for 3,182 one-off class combinations.
4. **Native by default** — the system font (SF), off-white not pure white, hairline separation,
   `tabular-nums` on numbers.
5. **Perf is a design constraint** — blur only on floating-over-static surfaces, shadows only on two
   floating tiers, transform/opacity-only motion, and the timeline/canvas hot paths stay untouched.
