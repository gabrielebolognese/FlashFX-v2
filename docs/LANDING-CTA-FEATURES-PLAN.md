# FlashFX — Landing-page CTA → "stunning thing appears" plan

## 0. Goal

Every CTA on the marketing site (`editor.flashfx.app` is the editor) should deep-link into the editor
and immediately show something relevant and impressive: a big particle animation, a stunning
procedural loop, a 3D-feeling scene, a plain-English build, a template gallery. This plan maps each
CTA to a deep-link `?template=<id>`, grounded in **what the editor can actually render today** — and is
honest where a feature doesn't exist yet.

### CTA inventory (from the landing page)

| CTA | Landing location | Button copy | Deep-link id | Reality |
|-----|------------------|-------------|--------------|---------|
| Particles | `sections/ParticleGeneration.tsx:170` | "Make your own" | `particles` | ✅ **Live** (enhance to a bigger scene) |
| Procedural | `sections/ProceduralAnimation.tsx:49` | "It's easier than you think" | `procedural` | ✅ Real engine — buildable now |
| 3D | `sections/ThreeDSupport.tsx:114` | "Try it now" | `depth` | ⚠️ No real 3D — honest 2.5D interim |
| Edit in plain English | `demos/PromptToArt.tsx:783` | "What do you want to build?" | `prompt` | ⚠️ Feature doesn't exist — see §3.4 |
| Templates (all) | `sections/TemplateStart.tsx:143` | "Explore all templates" | `templates` | ✅ after a small tab-store lift |
| Template cards ×4 | `sections/TemplateStart.tsx:56` | the cards are links | `calendar` / `title` / `bar-chart` / `logo` … | ✅ 1-liners (animation templates) |
| All on web | `sections/AllOnWeb.tsx:166` | "Don't believe me?" | `showcase` | ✅ a combined demo scene |

---

## 1. Grounding — honest capability audit (verified in code)

**Renders today (safe for stunning seeds):**
- **Particles** — `addParticleLayer()` (`store/editor.ts:1830`), real GPU particle system (`renderer.ts:3568`).
- **Procedural** — `addProceduralBinding(layerId, presetName)` (`store/editor.ts:4551`) drives real animation; consumed in `interpolation.ts:1269-1298`; **grid presets expand one layer into a whole field of phase-offset instances** in `renderer.ts:3341-3380`. Presets: transform (`Radial Spin, Pulse, Bounce, Orbit, Wobble, Float, Fade Pulse, Spin & Scale`), grid (`Diagonal Cascade, Radial Pop, Horizontal Wave, Random Twinkle`), tile scrolls. **WORKS.**
- **Expressions** — `useExpressionStore.getState().setExpression(layerId, 'Position', code)` (`expressions/store.ts:21`); evaluated per-property in `interpolation.ts:295` via a sandboxed worker. Language: `time, value, index, frame, fps, wiggle(), noise(), loopOut(), Math.*`, etc. **WORKS** (async 1-frame lag, invisible during playback).
- **Shapes / text / groups / images** and **animation templates** (`insertAnimationTemplate(id)`, `store/editor.ts:3979`) — all render.

**Does NOT exist (be honest):**
- **3D** — `is3D` is a dead persisted flag (`getIs3D` has zero call sites; `renderer.ts` never reads it). No Z position, no camera, no X/Y-axis rotation. The "Draft 3D" button is hard-disabled ("no 3D layers yet"). Real 3D = a major renderer project (camera + projection matrix + z-sort in WGSL). **What IS real for depth:** perspective-warp filters (`renderer.ts:1398,1497`), the **2.5D projected drop shadow** (`LayerShadow`, `types.ts:300`), glow/blur, and parallax via parenting/scale.
- **"Edit in plain English" / prompt-to-art** — no natural-language editing, no text-to-scene, no generation backend. The closest real thing is the **command palette** (Ctrl+K fuzzy keyword match, `CommandPalette.tsx`). "AI image" is only client-side background-removal + upscale (`store/aiImage.ts` — no generate). The advertised copy is a marketing mock with nothing behind it.
- **Cloner** — resolves but the renderer has **no cloner branch** (`renderer.ts:3395-3410`); it renders as garbage. **Never put a cloner in a seed.**

**Plumbing gap:** the MediaPool active tab is local `useState` (`MediaPool.tsx:67`), so a deep-link can't focus the Animations browser until it's lifted into `useMediaPoolStore` (`store/mediaPool.ts`). Workspace IS a store (`setEditorWorkspace`, `panels.ts:81`).

---

## 2. Shared architecture

Everything routes through the **existing deep-link system** (`src/templates/`), extended with new
registry entries. No new mechanism.

- **Registry entry shape** (`templates/types.ts`): `{ name, width, height, videoFormat, autoplay?, apply(editor) }`. `apply` runs against the loaded editor store after the fresh project opens (`launchTemplate` already waits for the scene to load — `templates/launch.ts:23`).
- **Seed-builder hooks an `apply()` can call:**
  - Seed primitives: `editor.addParticleLayer()`, shape/text/group adds, `editor.updateBackgroundLayer(...)`.
  - Full animation: `editor.insertAnimationTemplate('<id>')` (seek to 0 first).
  - Procedural: create a layer → read its id back from `useEditorStore.getState().composition.layers` → `editor.addProceduralBinding(id, 'Orbit')`.
  - Expressions: `useExpressionStore.getState().setExpression(id, 'Position', code)`.
  - Focus workspace: `usePanelStore.getState().setEditorWorkspace('animate')`.
  - Focus a browser tab: `useMediaPoolStore.getState().setActiveTab('animations')` — **after** the tab-store lift (§3.5).
- **Id-readback pattern** (procedural/expression seeds need layer ids): because store actions mutate state, seed builders re-read `useEditorStore.getState()` after each add rather than trusting the single `apply(editor)` snapshot. Package these as small builder helpers in a new `src/templates/seeds/` folder (keeps `registry.ts` a thin whitelist).
- **Honesty guardrail (non-negotiable):** demos for features that don't exist (3D, plain-English) must be **honestly framed** — a real depth effect, or an explicitly-labelled "preview," never a fake that pretends a missing capability is real. The landing copy should match. Flag any CTA whose promise the product can't keep (§3.3, §3.4).

---

## 3. Per-CTA plans

### 3.1 Particles — `particles` (enhance) ✅
Live today (a single fire burst). **Upgrade to a "big particle generation" hero:** dark gradient stage
+ a large centred emitter + 1–2 accent emitters (different presets/colours) + a title label fading in;
autoplay. All real (`addParticleLayer` + background + text). Pure seed-builder work.

### 3.2 Procedural — `procedural` ✅
A genuinely stunning loop from real presets, no keyframes:
- Centre star on **`Radial Spin`** (continuous rotation → sunburst).
- A background shape on **`Radial Pop`** or **`Diagonal Cascade`** grid preset → the renderer expands it
  into a 5×5 field of pulsing, phase-offset instances.
- A ring of ~8 circles each on **`Orbit`**, phase-staggered via `updateProceduralBinding` (different
  `loopDurationFrames`).
- A couple of accents on **`Float`/`Pulse`**; dark gradient bg; autoplay.
Everything animates from `frame` alone — ideal for a link-and-play demo.

### 3.3 3D — `depth` (honest 2.5D interim) ⚠️
Real 3D does not exist and won't without a renderer project (camera/Z/projection). **Do NOT ship a fake
"3D layer."** Instead ship a genuinely-impressive **2.5D depth** scene that is honest about being a
composited-depth effect:
- 3–4 parallax planes (bg → mid → subject → foreground) at different scales, each with a slow, slightly
  different position/scale push (real keyframes) → parallax.
- A hero card with a **perspective-warp** filter (real GPU shader) for a tilted, dimensional read.
- **Projected 2.5D drop shadows** (`LayerShadow`) on the subject + card for grounded depth.
- Subtle glow/blur on far planes for atmosphere.
This reads as "3D-ish" truthfully. **Decision for you:** either (a) ship this as the "3D" CTA now
(recommend, but consider softening the landing copy to "3D-style depth" / "2.5D"), or (b) gate the CTA
until real 3D ships. A **real-3D track** (camera, `positionZ`, `rotationX/Y`, perspective projection +
z-sort in the WGSL renderer) is scoped in §5 as a separate large effort.

### 3.4 Edit in plain English — `prompt` ⚠️ (the honest hard one)
The feature the button promises (type English → the editor builds it) **does not exist**. Options, in
increasing effort/honesty:
- **Interim A — "watch it build" demo (recommended first):** the CTA opens a project and runs a
  scripted, **clearly-labelled** sequence (reuse the tutorial director engine) that shows a prompt bar,
  "types" the example prompt, and auto-builds a matching scene. Framed as a *preview* of prompt-to-scene
  — impressive, and honest because it's presented as a demo, not as understanding the user's input.
- **Real feature B — LLM prompt-to-scene:** a real prompt bar → a Supabase edge function calls an LLM
  that returns a **structured scene spec / list of editor actions** (constrained schema), which the
  client validates and applies (reusing the same store actions + `insertAnimationTemplate`). This is a
  real, buildable feature (we already have the action vocabulary and the edge-function pattern for
  `drive-assets`), but it needs an LLM key, a safety/validation layer, and cost controls. Separate track.
- **Interim C — command palette:** deep-link opens the editor with Ctrl+K palette pre-opened — real, but
  keyword-not-NL; weakest match to the promise.
**Recommendation:** Interim A now (labelled preview), commit to Real feature B as the flagship follow-up,
and align the landing copy so it doesn't claim NL understanding until B ships.

### 3.5 Templates "Explore all templates" — `templates` ✅ (needs the tab lift)
Open the editor's animation-template gallery. Steps:
1. **Lift the MediaPool active tab into `useMediaPoolStore`** (`store/mediaPool.ts`): add `activeTab` +
   `setActiveTab`; in `MediaPool.tsx:67` read/write it from the store (mirrors how `sortMode` already
   is). One small, safe refactor.
2. `apply()` for `templates`: open a scratch project, `setEditorWorkspace('animate')`,
   `useMediaPoolStore.getState().setActiveTab('animations')` → the user lands in the editor with the
   full animation gallery ("Use this" on every template). No seeded scene needed.
*(A future dashboard-level gallery that needs no open project is a bigger add — noted in §5.)*

### 3.6 Template cards ×4 — `calendar` / `title` / `bar-chart` / `logo` (etc.) ✅
Each card = a one-line registry entry: open a fresh project, `seekTo(0)`,
`editor.insertAnimationTemplate('<animationTemplateId>')`, autoplay. Maps directly onto the animation
templates already built (`calendar-month`, `title-rise`, `lower-third-slide`, `bar-chart-grow`,
`logo-pop`, `bullet-list`). Pick the 4 that match the landing cards; the rest are spare.

### 3.7 All on web — `showcase` ✅ (lower priority)
A single rich scene that shows the range running live in-browser: a procedural field + a particle accent
+ an animated title + a chart — composited into one autoplaying piece. Effectively a "greatest hits"
seed; can reuse several seed builders. Good for "Don't believe me?".

---

## 4. Honesty guardrails (applies to §3.3 and §3.4)

- Never render a fake "3D layer" or claim NL understanding the product doesn't have. Interims are either
  **real effects** (2.5D depth) or **explicitly-labelled previews** (the prompt "watch it build" demo).
- Where a CTA's promise outruns the product, **flag the landing copy** so marketing and product match
  (e.g. "3D-style depth" until real 3D; "coming soon / preview" on plain-English until the LLM feature).
- This keeps the launch credible — a user who clicks "Try 3D" and gets an honest, gorgeous 2.5D scene is
  delighted; one who gets a broken fake is not.

---

## 5. Phasing

- **Phase 1 — the real, shippable ones (no new capability needed):**
  1. Lift MediaPool tab → store (§3.5 step 1).
  2. `src/templates/seeds/` builders + registry entries for: `particles` (enhanced), `procedural`,
     `templates`, and the 4 `calendar`/`title`/`bar-chart`/`logo` card ids, plus `showcase`.
  3. Verify: typecheck 0 / lint 127 / build; a `verify:seed-templates` harness that asserts every
     registry id builds a valid, cloner-free layer set that survives validation (mirrors
     `verify:anim-templates`). Browser-check each link plays.
- **Phase 2 — honest interims for the gaps:**
  4. `depth` — the 2.5D parallax/perspective/shadow scene (§3.3).
  5. `prompt` — the labelled "watch it build" demo (§3.4 Interim A), reusing the tutorial director.
- **Phase 3 — the real features behind the promises (large, separate tracks):**
  6. **LLM prompt-to-scene** (§3.4 B): edge function + constrained scene-spec schema + client applier +
     safety/cost controls.
  7. **Real 3D**: camera + `positionZ` + `rotationX/Y` + perspective projection & z-sort in the WGSL
     renderer, plus transform/inspector UI. Its own multi-prompt effort.
  8. (Optional) a dashboard-level template gallery that needs no open project.

Files touched: `src/templates/registry.ts` (+ids), new `src/templates/seeds/*`, `src/store/mediaPool.ts`
+ `src/ui/panels/MediaPool.tsx` (tab lift), `scripts/verify-seed-templates.mjs` + `package.json`. Phase 2
adds a `depth` seed + a prompt-demo director. Phase 3 is new subsystems.

---

## 6. The landing-page id table (hand this to the landing session as we build each)

| CTA | `?template=` id | Opens | Status |
|-----|-----------------|-------|--------|
| Particles "Make your own" | `particles` | Big particle hero, autoplay | ✅ live (enhance P1) |
| Procedural | `procedural` | Spinning/orbiting procedural field | 🔨 P1 |
| Templates "Explore all" | `templates` | Editor on the Animations gallery | 🔨 P1 (tab lift) |
| Template card 1 | `calendar` | Project + calendar animation | 🔨 P1 |
| Template card 2 | `title` | Project + title animation | 🔨 P1 |
| Template card 3 | `bar-chart` | Project + bar chart | 🔨 P1 |
| Template card 4 | `logo` | Project + logo sting | 🔨 P1 |
| All on web | `showcase` | Combined live "greatest hits" scene | 🔨 P1 |
| 3D "Try it now" | `depth` | Honest 2.5D depth scene | 🔨 P2 (+ copy tweak) |
| Edit in plain English | `prompt` | Labelled "watch it build" preview | 🔨 P2 → real LLM P3 |

> Same anchor pattern as particles for all of them: `https://editor.flashfx.app/?template=<id>`,
> `target="_blank"`. Only the id changes.
