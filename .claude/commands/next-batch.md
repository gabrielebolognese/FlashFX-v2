---
description: Show the current AE-feature build batch and wait for "go" to implement it
allowed-tools: Read, Bash(grep:*)
---
## Current batch pointer

!`grep -nE "^\| B[0-9]" docs/AE-FEATURE-BATCHES.md`

---

You are handling the `/next-batch` command for the FlashFX feature build plan.

Do this now, and ONLY this — do not edit any files or start implementing:

1. Read `docs/AE-FEATURE-BATCHES.md`.
2. Find the **current batch**: the row marked `▶ **next**` in the Status table. (If none is marked next, use the first `⬜` pending row. If every batch is `✅`, say the plan is complete.)
3. Read that batch's full section further down the document and present it concisely:
   - **Batch ID + title**
   - **Delivers** — the concrete features
   - **Source categories** (from `AFTER-EFFECTS-PREMIUM-FEATURES.md`)
   - **Depends on** — and confirm those deps are done (✅)
   - **Performance weight** and any perf notes
   - **Likely files** and the **verification plan** (which gates + which `verify:*` harness)
4. Then STOP. End with: **"Reply `go` to build this batch, or tell me to adjust its scope / pick a different batch."**

Do NOT begin implementation in this turn. Implementation happens only after the user replies **go** (a separate message).

When the user later says **go**, build the batch under the standing rules:
- **Audit first** — check what already exists in the editor for these features and build only the real gaps / fix what's broken; never duplicate. (Delegate the audit to Explore agents when the surface is broad.)
- Implement deeply and bulletproof; keep frame-purity and the performance principles in the doc.
- Verify: `npx tsc --noEmit -p tsconfig.app.json` (0) · `npm run lint` (hold the 125-problem baseline) · `npm run build` · `npm test` — and add a `scripts/verify-*.mjs` harness for any new pure logic.
- Commit **and** push (trailers per the session's attribution).
- Then update `docs/AE-FEATURE-BATCHES.md`: flip this batch to `✅` (both the Status table and its section heading), move the `▶ **next**` marker to the following batch, and note anything deferred or split.
- If, once inside the work, the batch is clearly too large for one solid prompt, split it (e.g. `B19a` / `B19b`), ship the first half bulletproof, and record the split in the doc rather than cutting corners.
