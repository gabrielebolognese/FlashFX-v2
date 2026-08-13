# FlashFX AI — implementation plan & status

**This is the canonical AI plan.** The real system is `src/ai/` + `src/schema/` + the contract in
[`docs/ai-contract/`](./ai-contract/). (The old `AI_IMPLEMENTATION_ANALYSIS.md` /
`AI_PIPELINE_STEP_BREAKDOWN.md` were a dead OpenAI-Assistants design and have been deleted.)

## Architecture (prompt → composition)

Two model stages feed a **deterministic, zero-token compiler**:

```
description + canvas
  → [Director]  (1 model call, forced tool)  → DirectorOutput { brief, styleContract, panelPlan }   (ms)
  → compilePlan (pure)                        → frame-space panels + per-panel Jobs                  (frames)
  → [Coder]     (1 model call PER PANEL)      → CoderFragment { panelId, layers[] } per panel        (frames)
  → assemble + validateDirectorPlan (pure)    → Composition + report
  → commit (browser)                          → editor store
```

- **Director** decides duration/format/tone/subjects, a palette (semantic roles, not literals),
  easings, beat, shape language, stagger doctrine, and the panel timeline (with boundary
  present-lists). Model `claude-opus-5`, structured output FORCED via `tool_choice`, retry-once on
  validation failure. Colors are **role names**; the Coder later binds them.
- **Coder** turns ONE panel's plan (a `Job`: the frame-space panel + styleContract + neighbor
  present-lists + an `idNamespace` like `p2:` + a `layerBudget`) into that panel's layers
  (`CoderFragment`). Layers are the strict compact union in `src/schema/layers.ts`: shape/text/
  group/image/video/cloner, each with `transform`, optional `in/out`, and up to 6 **motion-preset
  attachments** (`fadeIn`, `slideIn`, `popIn`, `staggerReveal`, … from `src/ai/presetCatalog.ts`).
- **Compiler** (`src/ai/index.ts` `compile()`) is pure: `compilePlan` + `assemble` + semantic
  validation. `commit.ts` applies the result to the editor.

## Status

**Built & harness-tested** (`npm run verify:schema | verify:director | verify:compiler | verify:beats`):
- The whole **schema/contract** package incl. the frozen JSON-schemas for forced decoding
  (`exportDecodingSchemas().directorOutput` / `.coderFragment`).
- The **Director** stage end-to-end (`src/ai/director/`), incl. a **real Anthropic client**
  (`createAnthropicClient`) and a node runner (`scripts/director-run.mjs`).
- The **deterministic compiler** (`compilePlan` + `assemble` + `validateDirectorPlan` + `commit`).
- The **Coder stage** (`src/ai/coder/`): `runCoder(job) → CoderFragment`, retry-once, Coder-local
  validator. `verify:coder` (fake client) + `scripts/coder-run.mjs` (real end-to-end run).
- Dev hook `window.__aiCompile('showreel')` compiles+commits a **fixture** (hand-authored
  director+fragments) onto the canvas.

**What's missing:** the stages exist in isolation. Nothing ties `description → Director → Coder(per
panel) → compile → commit` into one call, the errors only visible after assembly aren't fed back,
the regeneration inputs don't persist, and there's no browser path (the key can't live client-side).

### Milestones to a working in-app AI (definitive order)

- **M1 — Pipeline orchestrator** `generate(description, canvas, …, client) → { composition, styles,
  report, aiMeta, usage }`. Runs Director → `compilePlan` → Coder per panel → `compile()`. The single
  entry point the app, the node runner, and tests all use. Provable here (fake client) + live via the
  node runner. **Needs nothing from you.** ← NEXT
- **M2 — Auto-fix loop** (inside the orchestrator). `runDirector`/`runCoder` already self-retry on
  their OWN validation; M2 catches the cross-stage errors only `compile()` sees (assembly seams,
  ownership) and re-runs the offending stage with the errors fed back (bounded, e.g. 2 repairs).
  Provable here. **Needs nothing from you.**
- **M3 — `aiMeta` persistence** — whitelist brief/styleContract/panelPlan/seed/digest/tier through
  `src/project-system/services/validation.ts` (it's on the core type but stripped on save/load).
  Round-trip harness. **Needs nothing from you.**
- **M4 — Key-holding proxy** — a Supabase edge function (Deno, the `drive-assets` pattern) holding
  `ANTHROPIC_API_KEY` as a secret, proxying Director+Coder calls to Anthropic. **I write it; you set
  the secret + deploy** (two commands, below). The ONLY milestone that needs you.
- **M5 — Browser wiring (the feature)** — a browser client hitting the proxy; replace the AiChatPanel
  mockup with prompt → orchestrator → commit onto the canvas, progress in the Tasks panel. Needs M4.
- **M6 — Edit & assets (polish)** — regenerate/tweak via `aiMeta`; bind real image/video assets;
  usage/cost + tier UI.

M1–M3 are all buildable and provable here now, with no key. M4 is your two commands. M5 lights it up.

## What I need from you (and when)

Nothing is needed to **build and prove the Coder stage** — it's pure code + a fake-client harness.

The key/infra is only needed to run against the **real model**:

- **Local dev runs (node):** the runners read the key **only** from the `ANTHROPIC_API_KEY`
  environment variable. Set it in your shell or a **gitignored `.env` you manage yourself**:
  `export ANTHROPIC_API_KEY=sk-ant-...`. I never handle, store, or print the key. This already works
  for `scripts/director-run.mjs`; the Coder gets a `scripts/coder-run.mjs` the same way.
  ⚠️ **Never** put it in a `VITE_` variable — those get bundled into the browser and would leak the key.
- **Browser wiring (later):** the key must stay server-side. The plan is a **Supabase edge function**
  (the "worker", same pattern as the existing `supabase/functions/drive-assets`) that holds
  `ANTHROPIC_API_KEY` as a **Supabase secret** (`supabase secrets set ANTHROPIC_API_KEY=...`) and
  proxies to the Anthropic API. The browser's `DirectorClient`/`CoderClient` then points at that
  function URL, so the key never ships to the client. When we reach step 4, I'll need you to (a) set
  that secret and (b) `supabase functions deploy` the proxy; I'll write the function.

## Verification
- Pure/provable here: `verify:schema`, `verify:director`, `verify:compiler`, `verify:beats`,
  and the new `verify:coder` (fake client). Keep `typecheck`/`lint`/`build` green.
- Real-model (needs your key, node): `scripts/director-run.mjs` and (next) `scripts/coder-run.mjs`.
- Browser: `window.__aiCompile('showreel')` today; the full prompt→canvas flow after step 4.
