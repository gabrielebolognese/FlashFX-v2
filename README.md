<div align="center">

<img src="public/flashfx-mark.svg" width="72" alt="FlashFX" />

# FlashFX

**A motion-graphics studio that runs entirely in your browser, on WebGPU.**

[![CI](https://github.com/gabrielebolognese/FlashFX-v2/actions/workflows/ci.yml/badge.svg)](https://github.com/gabrielebolognese/FlashFX-v2/actions/workflows/ci.yml)
[![Live demo](https://img.shields.io/badge/demo-editor.flashfx.app-f7b500)](https://editor.flashfx.app)
![WebGPU](https://img.shields.io/badge/WebGPU-required-0a0f16)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)

Think After Effects + Cinema 4D MoGraph, rendered client-side on the GPU, plus an AI that generates *editable* scenes instead of flat video. Built by one person.

### [▶ Try it live](https://editor.flashfx.app) · no install, no sign-up to look around

<!-- TODO (owner, before launch): a demo GIF is the single biggest driver of stars. Record 10-20s of the
     cloner + physics + an AI build, save it as docs/demo.gif, and uncomment the <img> below.
<img src="docs/demo.gif" width="760" alt="FlashFX demo" />
-->

</div>

---

## What it is

FlashFX is a single-page motion-graphics and short-form video editor. The UI is React; everything that
matters - compositing, animation evaluation, effects, video decode, export - runs in a **WebGPU +
Web Worker** runtime driving an `OffscreenCanvas`. There is no WebGL fallback: it is GPU-first by design.

It is the kind of thing that normally only exists as a native desktop app (After Effects, Cinema 4D),
and most "web video editors" are really trim-and-caption tools. FlashFX is trying to be an actual
**motion-graphics engine** in the browser:

- a **real keyframe system** (linear / bezier / hold / spring), graph editor, motion paths with
  arc-length spacing, speed ramps and time-remapping;
- an **expression engine** (sandboxed in a worker) so properties can be driven by code;
- **MoGraph**: a C4D-style **cloner** that expands one layer into N instances as a pure function of
  `(params, index)`, with an effector stack (random / falloff / step / time / target);
- **2D physics** (Rapier), **particles**, **field sampling**, **pen/vector tooling**, **2.5D camera**,
  **precompositions**, **track mattes**, **IK rigging**, **audio-reactive** animation and
  **spreadsheet/JSON data binding**;
- **100+ GPU effects** (color, blur/glow, distortion, stylize, keying, LUT color grading) authored in
  WGSL, plus per-character/kinetic typography;
- **MP4 (H.264 / AAC) export** via WebCodecs, rendered frame-for-frame from the same engine as the
  preview, so what you see is what you get.

It is **local-first**: projects live in IndexedDB and it runs fully offline. An optional backend
(Supabase) adds accounts and cloud sync, but the editor needs zero keys to run.

## The AI part (the interesting bit)

Most "AI video" tools hand you an uncontrollable clip. FlashFX's pipeline is built to produce an
**editable scene**: a planner ("Director") turns a prompt into a structured plan, a **deterministic
compiler** turns that plan into real layers, keyframes and effects, and the result drops into the
timeline as a normal, tweakable composition (one undo step). You can then open any layer and change it.

> Type a prompt → get a keyframed, on-brand, editable motion-graphics scene. Not a black-box video.

## Meet Flash

There is a character living in the editor - **Flash** (the logo, with a body, drawn entirely in SVG).
He hops around, reacts, and when you ask the AI to build something he pops up to confirm ("you want me
to build this? I'll take the wheel for a bit - sit back and relax"), then sits at a little laptop and
works while the scene generates. The goal is to make the tool feel like collaborating with a motion
designer, not operating panels.

## Why it might be worth a look (for developers)

- A **WebGPU 2D compositor** with a multipass pipeline (isolated layer passes, premultiplied-over
  blend, pooled render targets) - there are very few open examples of this.
- **Frame-purity** is a hard constraint: the timeline scrubs non-sequentially, so the renderer and every
  procedural system (cloner, particles, physics, the Random effector) must be byte-identical for a given
  frame. Randomness is seeded (`mulberry32`); `Math.random`/`Date` are banned in the pure paths.
- A **WebCodecs decode pool** (via mediabunny) with a present-on-clock scheduler, texture cache and
  hard memory caps, because naive WebCodecs usage stalls the hardware decoder's output pool.
- Pure, framework-free domain logic in `src/core` and feature modules, each with a tiny
  `scripts/verify-*.mjs` acceptance harness (there is no test runner; ~100 harnesses bundle the real TS
  with esbuild and assert with `node:assert`).

## Tech

TypeScript (strict), React 18, Zustand, Vite · WebGPU · WebCodecs · Web Workers / OffscreenCanvas ·
Rapier 2D (WASM) · mediabunny · Supabase (optional).

## Running locally

**Requires a Chromium-based browser with WebGPU enabled** (recent Chrome/Edge/Arc). Node 18+.

```bash
git clone https://github.com/gabrielebolognese/FlashFX-v2.git
cd FlashFX-v2
npm install
npm run dev        # Vite dev server
```

No environment variables are needed to run the editor - it is local-first and null-checks the backend,
so it works fully offline. `.env.example` documents the optional Supabase / billing / observability vars.

```bash
npm run typecheck  # strict tsc
npm run lint       # ESLint
npm run build      # production build
npm test           # runs all scripts/verify-*.mjs acceptance harnesses
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for a technical deep-dive: the WebGPU compositor,
frame-purity, the MoGraph cloner, the WebCodecs video pipeline, and the AI compiler.

## Status

**Early and actively developed, pre-launch.** The engine is deep but not everything is polished, some
GPU paths are newer than others, and there are rough edges. If you hit one, an issue with a repro is
genuinely useful. Feedback from graphics / WebGPU / motion-design folks especially welcome.

## License

> **TODO (owner):** choose a license before promoting this. With no `LICENSE` file, the default is "all
> rights reserved," which blocks contributions and discourages stars. If you want community adoption,
> a permissive license (MIT/Apache-2.0) maximizes stars but allows commercial forks; a source-available
> license (e.g. BSL, Elastic, PolyForm) protects the product while keeping the code readable. This is a
> business decision - pick deliberately.

---

<sub>FlashFX is an independent project and is not affiliated with or endorsed by Adobe (After Effects) or
Maxon (Cinema 4D); those names are used only to describe the category of tool.</sub>
