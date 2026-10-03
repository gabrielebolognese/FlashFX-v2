# Contributing to FlashFX

Thanks for taking a look. FlashFX is early and actively developed, and feedback from graphics / WebGPU /
motion-design folks is especially welcome.

> **Note:** this repo does not yet have a `LICENSE`. Until one is added, the code is "all rights
> reserved" by default - please open an issue to discuss before building on it or sending large PRs.

## Getting set up

You need a **Chromium-based browser with WebGPU** and **Node 18+**.

```bash
npm install
npm run dev        # Vite dev server (generates icons first)
```

The editor is local-first and runs with **no environment variables** - it works fully offline.
`.env.example` documents the optional Supabase / billing / observability vars.

## Before you push

All of these must pass (they gate CI):

```bash
npm run typecheck  # strict tsc over all of src/
npm run lint       # ESLint
npm run build      # production build (the reachability gate)
npm test           # runs every scripts/verify-*.mjs acceptance harness
```

## How the code is organized

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). The short version:

- **`src/core/`** - pure domain logic. No React, no DOM, no WebGPU, so it runs in workers and is
  harnessable. New pure logic should come with a `scripts/verify-*.mjs` harness (we bundle the real TS
  with esbuild and assert with `node:assert` - there is no test runner).
- **`src/engine/`** - the WebGPU renderer, timeline/playback, and the WebCodecs video subsystem.
- **`src/store/`** - Zustand stores. `editor.ts` is the mutation API; undoable edits go through the
  command pattern in `store/history.ts`. Components call actions, they do not reconstruct state.
- **`src/ui/`** - React presentation.

## Conventions

- **Frame-purity is non-negotiable.** Anything that renders per frame must be a pure function of the
  frame. Seeded randomness only (`mulberry32`); never `Math.random()` / `Date` in a render path.
- TypeScript is strict (`noUnusedLocals` / `noUnusedParameters`). Do not silence errors with `any` /
  `@ts-ignore` / `!`.
- Keep pure logic in `core/` free of React / DOM / WebGPU imports.

## Reporting bugs

A WebGPU app has a lot of surface. An issue with **your browser + GPU, repro steps, and what you
expected vs saw** (a screen recording helps) is the most useful thing you can send.
