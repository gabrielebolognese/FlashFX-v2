# FlashFX — Guided Tutorial ("self-driving demo") Plan

## 0. Goal

FlashFX is now huge (M1–M22 + video/particles/physics/cloner/expressions/captions…). A brand-new
user opening it to an empty canvas is lost. Fix: on first open, a big **"Start the Tutorial"** CTA
spins up a fresh 16:9 project and then **FlashFX edits itself** — building one polished motion piece
step-by-step, narrated, with the exact tool/panel spotlighted each step — so the user *watches* what
the app can do. It finishes by **playing the result and handing the scene over** ("Now it's yours").

Decisions locked (from planning):
- **Structure:** one cohesive ~75s build into a single scene, with **skippable chapter markers**.
- **Coaching:** a **narration bar** + a **UI spotlight** (dimmed overlay with a cutout/arrow on the
  tool or panel in use).
- **Ending:** **play** the animation, then **unlock and hand over** the built scene.

Non-goals (v1): interactive "you-try-it" coach steps; audio voiceover; localization; showing
*literally* every feature (curated greatest-hits instead).

---

## 1. Grounding — how the app actually boots (verified)

- **Project shell:** `useProjectStore` (`src/project-system/hooks/useProjectStore.ts`) holds
  `view: 'dashboard' | 'editor'`, `activeProjectId`, and `createAndOpenProject(options)` /
  `openProject(id)`. `createAndOpenProject({ videoFormat: 'long' })` makes a **16:9** project
  (`'short'` = 9:16) and flips `view → 'editor'`. `ProjectApp` (`src/project-system/ui/ProjectApp.tsx`)
  renders `<Dashboard>` when `view==='dashboard'`, else the editor; on entering the editor it
  `loadDocument`s the scene and calls `playbackController.renderCurrentFrame()`.
- **Editor state is one live Zustand store** (`useEditorStore`, `src/store/editor.ts`) whose actions
  are the mutation API — so the tutorial drives *genuine* edits: `addRectangle/addCircle/addStar`,
  `addText`, `addKeyframe`, `updateLayerProperty`, `booleanSelectedShapes` /
  `compoundBooleanSelectedShapes`, `createColorStyle` / `linkLayerColorStyle` / `updateStyleColor`,
  `addCloner`, `addParticleLayer`, `outlineTextLayer`, `tidyUpSelection`, `selectLayer`,
  `setCurrentFrame`, plus tools via `useShapeToolStore.setActiveTool` and playback via
  `useTimelineStore` (`play`/`pause`/`seek`). Background via the background layer / `BackgroundPanel`.
- **No existing demo/sample-scene generator** — this is new.
- **Onboarding module already exists** (`src/onboarding/`, hidden-by-default with a bottom-left
  corner button). We reuse that entry point to make the tutorial re-launchable, and keep the
  welcome flow separate.

> Build-time note: confirm each store action's exact signature before scripting it (a few take
> args/frames). The storyboard below names the action; the implementer wires the real call.

---

## 2. First-open flow

- **Flag:** `localStorage['ffx-tutorial-seen']`. Show the CTA when the flag is absent **and**
  `useProjectStore.projects` is empty (true first run). Otherwise the dashboard behaves normally.
- **CTA:** a centered hero over the Dashboard — **▶ Start the Tutorial** (primary) + a quiet
  "Skip to dashboard" link. (Component: `TutorialLaunch`, rendered by `Dashboard` when the flag is
  unset, or as an overlay.)
- **Launch:** `createAndOpenProject({ name: 'Tutorial', videoFormat: 'long' })` → editor mounts and
  loads the empty 16:9 comp → set `useTutorialStore.start()`. `<TutorialRunner>` (mounted in the
  editor tree) waits for the comp to be ready, then runs the script. Set `ffx-tutorial-seen`.
- **Re-launchable:** rename the existing bottom-left corner button "Tutorial" (or add a Help ▸
  "Replay tutorial" item) → `useTutorialStore.start()` from anywhere in the editor. Replaying
  should start from a **fresh** Tutorial project (create-and-open again) so the build is clean.

---

## 3. Architecture — the "director" engine (`src/tutorial/`)

A tiny, data-driven step runner that drives the real editor store. No new deps.

```ts
// src/tutorial/types.ts
interface TutorialApi {
  editor: EditorStoreApi;      // useEditorStore.getState()
  timeline: TimelineStoreApi;  // useTimelineStore.getState()
  tools: ShapeToolApi;         // useShapeToolStore.getState()
  wait: (ms: number) => Promise<void>;
  setFrame: (n: number) => void;
  select: (ids: string[]) => void;
  lastLayerId: () => string;   // id of the most-recently-added layer (for chaining)
}
interface TutorialStep {
  id: string;
  say: string;                 // narration (markdown-lite)
  spotlight?: string;          // data-tutorial-id target, or 'canvas' | 'none'
  run?: (api: TutorialApi) => void | Promise<void>;
  hold?: number;               // ms to linger after run (default ~1200), scaled by playback speed
}
interface TutorialChapter { id: string; title: string; steps: TutorialStep[] }
```

- **`useTutorialStore`** (Zustand): `{ active, chapterIndex, stepIndex, paused, speed(1/2/4x),
  start(), stop(), pause(), resume(), skipToChapter(i), next() }`. Also `phase: 'idle'|'running'|'handoff'`.
- **`<TutorialRunner>`** (mounted once in the editor, renders nothing when idle): owns the async
  loop — for each step: set the active spotlight target, type/show `say` in the narration bar, run
  `step.run(api)` (real edits), `await wait(hold × 1/speed)`, advance. Fully **cancellable**
  (`stop()` breaks the loop and leaves the built scene). Respects `paused` (loop yields until
  resumed) so the user can freeze and take over.
- **`tutorialScript.ts`** — the storyboard as `TutorialChapter[]` data (§5). Pure data + closures;
  editable without touching the runner.
- **Input soft-lock:** while `phase==='running'` and not paused, a transparent capture layer over
  the editor swallows stray clicks (so the user watches, and their clicks don't fight the script).
  Pause lifts it.

### Spotlight system
- Add a `data-tutorial-id="…"` attribute to a handful of stable UI anchors: the shape-tool group,
  the pen/pencil group, the Inspector root + its Fill row + Effects tab, the Timeline panel, the
  Transport/Play button, the Export button, the Cloner tool, and the canvas.
- `<SpotlightOverlay target={id}>` queries `[data-tutorial-id=target]`, reads
  `getBoundingClientRect()`, and renders a full-screen dim (`bg-black/55`) with a **cutout** (an SVG
  mask or four surrounding rects) + a small arrow/label pointing at it. `target: 'canvas'` spotlights
  the canvas rect; `'none'` = narration only (no dim). Recomputes on window resize + when the target
  changes. This is the one genuinely fiddly bit — build it as a self-contained component (Phase 4).

---

## 4. Controls, pacing, robustness

- **Controls bar** (with the narration): `Skip` (→ jump to handoff), `Pause/Resume`, `1×/2×/4×`
  speed, and a **chapter progress strip** (clickable segments = `skipToChapter`). `Esc` = Skip.
- **Pacing:** `hold` per step (short for small edits, longer for “watch it animate”); scaled by
  speed. Narration “types in” quickly then holds.
- **Async steps awaited:** `outlineTextLayer` (loads a font), particle warmup, any settle. The
  runner always `await`s `run()`.
- **Asset-free:** the whole build uses generative primitives (shapes, text, particles, cloner,
  effects, boolean, gradients, styles) so it works offline with zero bundled media. *Optional* later:
  bundle one tiny sample image for an "import" beat.
- **Interruption-safe:** `stop()` at any step leaves a valid scene; the Tutorial project is a
  throwaway (a real saved project named "Tutorial" the user can keep or delete).
- **Determinism isn’t required** (this isn’t frame-pure resolve) but keep positions/colors as fixed
  constants so the build looks the same every run.

---

## 5. Storyboard — the cohesive build (chapters)

One ~10s 16:9 title/promo card, assembled live. ~9 chapters, ~75s at 1×. Each beat: **spotlight →
narration → real edit**. (Copy is placeholder; tighten at build time.)

1. **Meet the canvas** — spotlight `canvas`. *"This 16:9 stage is where it all happens."* Set a
   dark gradient background.
2. **Shapes** — spotlight shape-tool group. *"Rectangles, ellipses, stars — with live rounded
   corners."* `addRectangle()` → round its corners (drag-handle / `borderRadius`), `addCircle()`,
   `addStar()`; place them.
3. **Boolean with real holes** — spotlight canvas. *"Combine shapes — even punch clean cutouts."*
   Select circle + rectangle → `compoundBooleanSelectedShapes('difference')` → a ring/badge with a
   genuine hole (M22).
4. **Color & shared styles** — spotlight Inspector ▸ Fill. *"Style once, reuse everywhere."* Set a
   brand fill → `createColorStyle` → `linkLayerColorStyle` on two shapes → `updateStyleColor` and
   watch both update.
5. **Text** — spotlight text tool / Inspector. *"Add a headline, pick a font, align it."* `addText()`
   → set content + font + size → align center (M5).
6. **Animate** — spotlight Timeline. *"Keyframes bring it to life — with easing."* `addKeyframe` on
   position + scale + opacity at f0→fN so the title flies in; set an ease.
7. **Effects** — spotlight Inspector ▸ Effects. *"Depth in a click — glow, shadow, blur."* Enable
   glow + shadow on the title.
8. **Cloner + particles** — spotlight Cloner tool. *"Repeat anything into grids or radials, and add
   motion."* `addCloner()` → radial array of a small shape; `addParticleLayer()` → a burst.
9. **Outline & tidy** — spotlight canvas. *"Text → editable vector paths; auto-tidy your layout."*
   `outlineTextLayer` (async) on a sub-label; `tidyUpSelection()` on a group (M15/M17).
10. **Play & handoff** — spotlight Transport. *"Here's your piece —"* `setFrame(0)` → `timeline.play()`;
    after it loops once, `pause()`, lift the input lock, and show the **handoff** card: *"Now it's
    yours — drag a layer, scrub the timeline, or ▶ play. Export is up top when you're ready."*

> Trim/merge to hit ~75s; chapters 8–9 can be split if the "everything" feel needs more. Each
> chapter is independent data, so reordering/adding is cheap.

---

## 6. Persistence & entry points

- `ffx-tutorial-seen` gates the auto-CTA (first run only).
- Re-launch: corner button (rename → "Tutorial") + optional Help ▸ "Replay tutorial". Both call
  `start()` after a fresh `createAndOpenProject({ name:'Tutorial', videoFormat:'long' })`.
- The welcome onboarding (`src/onboarding/`) stays separate and hidden; we don't entangle them.

---

## 7. Phased build

1. **Skeleton:** `useTutorialStore` + `<TutorialRunner>` shell (narration bar + controls, no
   spotlight yet) + first-open CTA + flag + create-and-open. Wire `start/stop/pause/skip`.
2. **Engine + 3 beats:** the async step loop + chapters 1–3 end-to-end (background, shapes, boolean)
   against the real store, with input soft-lock. Prove pacing/handoff.
3. **Full storyboard:** chapters 4–10; tune positions/colors/timing so the build looks good.
4. **Spotlight overlay:** `data-tutorial-id` anchors + `<SpotlightOverlay>` (dim + cutout + arrow).
5. **Handoff + entry points:** play→unlock card, corner/Help re-launch, replay-from-fresh.

Files (new): `src/tutorial/{types.ts, store.ts, tutorialScript.ts, TutorialRunner.tsx,
SpotlightOverlay.tsx, NarrationBar.tsx}`, `TutorialLaunch.tsx` (dashboard CTA). Touch:
`ProjectApp`/`Dashboard` (CTA + flag), the editor root (mount `<TutorialRunner>`), a few panels/tools
(`data-tutorial-id`), the corner button label.

Verification: this is UI/interaction + real store calls, so it's **browser-verified** (like the
milestone UI work). The one unit-testable seam is any pure pacing/geometry helper (e.g. the
spotlight rect math) — harness if it grows non-trivial. Keep TypeScript strict-clean and lint at the
127 baseline.

---

## 8. Risks / open questions

- **Spotlight alignment** across panel layouts/resizes is the main polish risk — isolate it, drive
  it off `data-tutorial-id` + live `getBoundingClientRect`, recompute on resize.
- **Action arg/frame details** — confirm each store action's real signature when scripting; some
  need explicit frames or selection state.
- **"Everything" vs watchable** — curated to ~9 chapters; if it feels thin, chapters are data and
  easy to extend (video/physics/expressions beats can be added later, gated on bundling sample media
  for the video one).
- **Replay hygiene** — always replay from a *fresh* Tutorial project so a half-built prior run
  doesn't leak in.
