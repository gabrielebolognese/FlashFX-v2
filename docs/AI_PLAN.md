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
- Dev hook `window.__aiCompile('showreel')` compiles+commits a **fixture** (hand-authored
  fragments) onto the canvas.

**Not built yet — the roadmap, in order:**
1. **Coder stage (`src/ai/coder/`)** ← NEXT. `runCoder(job, …)` mirroring `runDirector`: a
   forced-tool call emitting a `CoderFragment`, retry-once, plus Coder-local validation (panelId
   matches, ids carry the `idNamespace`, ≤ budget, boundary present-lists realized). Provable here
   with a fake client (`scripts/verify-coder.mjs`) — needs nothing from you.
2. **Auto-fix loop** — feed semantic-validation errors back to regenerate a corrected plan/fragment
   (bounded retries) instead of only reporting them.
3. **`aiMeta` persistence** — whitelist brief/styleContract/panelPlan/seed/digest/tier through
   `project-system/services/validation.ts` so regenerate survives save/load.
4. **Browser wiring + API-key proxy** — connect prompt → Director → Coder → compile → commit in a
   real UI, through a server proxy that holds the key (see below).

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
