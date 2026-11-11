# FlashFX

[![CI](https://github.com/gabrielebolognese/FlashFX-v2/actions/workflows/ci.yml/badge.svg)](https://github.com/gabrielebolognese/FlashFX-v2/actions/workflows/ci.yml)

FlashFX is a motion-graphics and short-form video editor that runs entirely in the browser. The interface is React; compositing, animation evaluation, effects, video decoding and export run in a WebGPU and Web Worker runtime, with no WebGL fallback. It is aimed at motion designers and video creators who want keyframed, After Effects style animation without a desktop install, and at developers interested in a WebGPU 2D compositor. Projects are stored locally in IndexedDB, so the editor works offline with no backend; an optional Supabase backend adds accounts, cloud sync, billing and managed AI.

Hosted editor: <https://editor.flashfx.app>

## Features

**Animation**
- Keyframes with linear, bezier, hold and spring interpolation, an interpolation graph editor and keyframe assistants.
- Motion paths with arc-length sampling, position paths, time remapping, separate dimensions and motion blur shutter controls.
- Expressions that drive properties from code, evaluated in a worker.
- Animation presets, stagger, motion rigs and IK rigging, layer parenting through a scene graph.
- Audio-reactive animation with beat detection, and data binding from spreadsheet or JSON data.

**Layers and compositing**
- Layer types: video, image, text, shapes (rectangle, circle, polygon, star, pen paths), audio, groups, particles, Lottie icons, generative patterns, layout containers (hbox, vbox, grid), cloner, precomposition, beam, camera and adjustment layers.
- Precompositions with nested rendering, breadcrumb navigation and cycle protection.
- Adjustment layers that apply an effect stack to everything below them.
- Parametric and freeform path masks with After Effects style modes, expansion and Refine Edge; track mattes; blend modes.
- A 2.5D camera with 3D layer transforms.

**MoGraph and simulation**
- A cloner that expands one layer into many instances (grid, radial, path and field distributions) with an ordered effector stack: random, falloff, step, time and target.
- 2D rigid-body physics (Rapier), particles, plexus, destruction and field sampling.
- All procedural systems are frame-pure: seeded randomness only, so scrubbing to any frame gives identical output.

**Effects and color**
- More than 100 GPU effects written in WGSL: color, warp, blur and glow, stylize, glitch, HSL, curves, vignette and LUT color grading.
- Chroma keying, color matching, smart crop and reframe, cutout shadow, face blur and retouch tools.
- In-browser background removal and 2x image upscaling (Swin2SR through transformers.js).

**Text**
- Per-character text animators with range selectors, kinetic typography presets, text on a path, text outlines and text explode.
- Bundled fonts plus user-imported custom fonts.

**Video editing**
- A multi-track timeline with trim, split, snapping and scenes.
- WebCodecs decoding through a decoder pool with a texture cache, frame scheduler and proxy transcoding.
- Automatic captions transcribed in the browser with Whisper models, with a subtitle review panel.
- Silence detection and removal, scene detection, optical flow and motion tracking.

**AI scene generation**
- A two-stage pipeline: a Director model turns a prompt into a structured plan, a Coder model writes each panel, and the result is validated, compiled and committed to the timeline as ordinary editable layers in one undo step.
- Runs through a Supabase edge function (`ai-proxy`) with per-account usage metering, or with the user's own Anthropic API key stored in the browser.
- An AI chat panel and the "Flash" mascot character that presents the build.

**Projects, templates and export**
- Project dashboard, autosave, multi-composition documents and `.ffx` project files.
- An animation template library, deep-link templates (`/?template=<id>`), a brand kit, saved assets, an icon library and a command palette.
- MP4 export (H.264 video, AAC audio) through WebCodecs, rendered by the same engine as the preview. Presets for 720p, 1080p and 4K, four quality levels and a selectable frame rate.
- Optional accounts (email and password, Google sign-in), cloud project sync with storage quotas, and a Pro plan billed through Paddle that unlocks AI, expressions, 3D and the premium pack.
- Onboarding flow, interactive tutorials, a consent banner and optional Sentry and PostHog telemetry.

## Getting started

### Prerequisites

- Node.js 18 or newer (CI runs Node 20) and npm.
- A Chromium-based browser with WebGPU enabled (recent Chrome, Edge or Arc). Browsers without WebGPU show an "unsupported browser" screen.

### Download and install

```bash
git clone https://github.com/gabrielebolognese/FlashFX-v2.git
cd FlashFX-v2
npm install
```

The `preinstall` script writes `ignore-scripts=true` to `.npmrc`, so dependency postinstall scripts do not run.

### Configuration

No environment variables are required. Without them the editor runs local-first with no accounts and no backend.

To enable the optional services, copy `.env.example` to `.env` and fill in the values you need:

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Supabase project for accounts and cloud sync. When set, the app requires sign-in before opening projects. |
| `VITE_OAUTH_GOOGLE` | Set to `false` to hide the Google sign-in button. |
| `VITE_PADDLE_CLIENT_TOKEN`, `VITE_PADDLE_PRICE_ID`, `VITE_PADDLE_ENV`, `VITE_PADDLE_PRICE_LABEL` | Paddle billing. Billing is on only when both the token and the price id are set. |
| `VITE_SENTRY_DSN` | Sentry error reporting. |
| `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST` | PostHog analytics, sent only after the user consents. |
| `ANTHROPIC_API_KEY` | Shell variable for the local AI scripts only. Never prefix it with `VITE_`. |

Every `VITE_*` value is inlined into the browser bundle, so only public or publishable keys belong there. The edge functions read their own secrets (`ANTHROPIC_API_KEY`, `PADDLE_WEBHOOK_SECRET`, `GOOGLE_SERVICE_ACCOUNT_JSON`), which are set with `supabase secrets set` and never placed in `.env`.

### Run in development

```bash
npm run dev
```

This regenerates the icon chunks and starts the Vite dev server. Open the URL Vite prints in a WebGPU-capable browser.

## Build and deploy

```bash
npm run build     # production build into dist/
npm run preview   # serve the production build locally
```

The output is a static single-page app in `dist/`. Any static host with HTTPS (WebGPU needs a secure context) and a catch-all rewrite to `index.html` works. The repo already contains that rewrite for two kinds of host: `public/_redirects` (Netlify, Cloudflare Pages) and `vercel.json` (Vercel, with `npm run build` and `dist` preconfigured). Set the `VITE_*` variables in the host's build environment, because Vite inlines them at build time.

The optional backend lives in `supabase/`: SQL migrations in `supabase/migrations/` and three edge functions in `supabase/functions/` (`ai-proxy`, `paddle-webhook`, `drive-assets`). The full procedure, including Supabase auth redirect URLs and Paddle setup, is in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Usage

1. Open the app and create a project from the dashboard.
2. Add media, shapes or text, then animate properties with keyframes in the timeline and inspector.
3. Apply effects, masks, cloners, physics or templates from the panels and context menus.
4. Use the export dialog to render an MP4, choosing resolution, quality and frame rate.

### npm scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server (generates icons first). |
| `npm run build` | Production build into `dist/` (generates icons first). |
| `npm run preview` | Serve the production build. |
| `npm run typecheck` | Strict TypeScript check over `src/`. |
| `npm run lint` | ESLint over the repo. |
| `npm test` | Run every `verify:*` harness in sequence and fail if any fails. |
| `npm run verify:<name>` | Run one acceptance harness, for example `npm run verify:cloner`. There are 114 of them. |
| `npm run gpu:masks`, `npm run gpu:adjustment` | Headless Chrome WebGPU harnesses. They need a local GPU and are not part of `npm test`. |
| `npm run icons` | Regenerate `public/icons/` from `lucide-static`. |
| `npm run director:run` | Run the AI Director against the real model and print the plan, token usage and cost. Needs `ANTHROPIC_API_KEY`. |
| `npm run apple:secret` | Run `scripts/apple-client-secret.mjs`, a helper left from Apple sign-in, which the app no longer offers. |

There is no test framework. Each `scripts/verify-*.mjs` harness bundles the real TypeScript with esbuild and asserts with `node:assert`. `scripts/coder-run.mjs` runs the full Director and Coder pipeline from the command line, and `scripts/run-batches.sh` chains unattended Claude Code build sessions described in [docs/AUTO_BATCH_SETUP.md](docs/AUTO_BATCH_SETUP.md).

CI (`.github/workflows/ci.yml`) runs typecheck, tests and build on every push to `main` and on pull requests; lint runs but does not block.

## Project structure

| Path | Contents |
| --- | --- |
| `src/core/` | Pure domain model and logic: types, interpolation, scene graph, masks, effects, precomp, camera math. No React, DOM or WebGPU. |
| `src/engine/` | Runtime: WebGPU renderer, timeline and playback clock, WebCodecs video subsystem, captions, audio, caches. |
| `src/codec/` | MP4 exporter and audio mixer. |
| `src/store/` | Zustand stores. `editor.ts` owns the composition; undoable edits use the command pattern in `history.ts`. |
| `src/ui/` | React panels, layouts, context menus, overlays and the Flash character. |
| `src/ai/`, `src/schema/` | AI Director and Coder pipeline, prompts, and the schemas it validates against. |
| `src/cloner/`, `src/physics/`, `src/particles/`, `src/expressions/`, `src/field-sampling/`, `src/stagger/`, `src/patterns/`, `src/procedural/` | Self-contained feature modules. |
| `src/project-system/` | IndexedDB projects, serialization, migration, `.ffx` files and cloud sync. |
| `src/auth/`, `src/billing/`, `src/legal/` | Accounts, plans and Paddle checkout, consent and legal pages. |
| `src/animation-templates/`, `src/templates/`, `src/tutorial/`, `src/onboarding/` | Template library, deep-link templates, tutorials and onboarding. |
| `supabase/` | Database migrations and edge functions. |
| `scripts/` | Verify harnesses, GPU harnesses, icon generation and AI run scripts. |
| `public/` | Static assets: icon chunks, Lottie files, WASM and decoder files. |
| `docs/` | Architecture, deployment, setup guides, plans and audits. |

## Tech stack

- TypeScript (strict), React 18, Zustand, Vite 5, Tailwind CSS, lucide-react
- WebGPU with WGSL shaders, Web Workers and OffscreenCanvas
- WebCodecs, mediabunny, mp4-muxer, mp4box
- Rapier 2D (WASM), earcut, polygon-clipping, opentype.js
- transformers.js and @imgly/background-removal for in-browser ML
- Zod for the AI schemas
- Supabase (Postgres, Auth, Storage, Deno edge functions), Paddle, Anthropic API
- ESLint, GitHub Actions

## Further documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): compositor, frame purity, cloner, video pipeline and AI compiler.
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): hosting, environment and post-deploy checks.
- [docs/AUTH-SETUP.md](docs/AUTH-SETUP.md) and [docs/PADDLE-SETUP.md](docs/PADDLE-SETUP.md): accounts and billing setup.
- [docs/ai-contract/README.md](docs/ai-contract/README.md): the AI output contract (motion presets, easing, palette roles, style).
- [docs/EXPORT-TRUSTWORTHINESS.md](docs/EXPORT-TRUSTWORTHINESS.md) and [docs/2.5d.md](docs/2.5d.md): export pipeline and 2.5D camera notes.
- [docs/PRODUCT-ROADMAP.md](docs/PRODUCT-ROADMAP.md) and [docs/AE-FEATURE-BATCHES.md](docs/AE-FEATURE-BATCHES.md): roadmap and feature build plan.
- [CONTRIBUTING.md](CONTRIBUTING.md): setup, required checks and conventions.
- [CLAUDE.md](CLAUDE.md): detailed codebase notes for AI coding assistants.
- [content/devlog.md](content/devlog.md): development log.

The `docs/` folder holds many more plans and audits; some describe earlier states of the code, so treat the source as authoritative.

## Status

In active development, version 0.1.0, built by one person. The engine is broad but uneven: some GPU paths are newer than others, the Animation Builder mode is present in the code but hidden from the UI, and the Google Drive proxy is disabled. Export is MP4 only.

The repository has no license file, so no license is granted; open an issue before building on the code.

FlashFX is an independent project and is not affiliated with Adobe (After Effects) or Maxon (Cinema 4D); those names only describe the category of tool.
