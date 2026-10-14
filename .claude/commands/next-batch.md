---
description: Show the current AE-feature build batch; with `auto`, build it unattended. Used by scripts/run-batches.sh.
---
## Current batch pointer

!`grep -nE "^\| B[0-9]" docs/AE-FEATURE-BATCHES.md`

---

You are handling the `/next-batch` command for the FlashFX feature build plan.

**Read the argument first (`$ARGUMENTS`):**
- **empty** -> **Interactive mode**: show the current batch and STOP. Follow "Interactive mode" below and ignore "Unattended mode".
- contains **`auto`** (optionally `auto skip-browser`) -> **Unattended mode**: build the batch end to end without stopping. This is what `scripts/run-batches.sh` sends. Follow "Unattended mode" below and ignore "Interactive mode" (in particular, DO build and edit files - the "do not edit / STOP" of interactive mode does NOT apply).

---

## Interactive mode (no argument)

Do this now, and ONLY this - do not edit any files or start implementing:

1. Read `docs/AE-FEATURE-BATCHES.md`.
2. Find the **current batch**: the row marked `▶ **next**` in the Status table. (If none is marked next, use the first `⬜` pending row that is not `⏭️ skip`. If every buildable batch is `✅`, say the plan is complete.)
3. Read that batch's full section further down the document and present it concisely:
   - **Batch ID + title**
   - **Delivers** - the concrete features
   - **Source categories** (from `AFTER-EFFECTS-PREMIUM-FEATURES.md`)
   - **Depends on** - and confirm those deps are done (✅)
   - **Performance weight** and any perf notes
   - **Likely files** and the **verification plan** (which gates + which `verify:*` harness)
4. Then STOP. End with: **"Reply `go` to build this batch, or tell me to adjust its scope / pick a different batch."**

Do NOT begin implementation in this turn. Implementation happens only after the user replies **go** (a separate message).

When the user later says **go**, build the batch under the standing rules:
- **Audit first** - check what already exists in the editor for these features and build only the real gaps / fix what's broken; never duplicate. (Delegate the audit to Explore agents when the surface is broad.)
- Implement deeply and bulletproof; keep frame-purity and the performance principles in the doc.
- Verify: `npx tsc --noEmit -p tsconfig.app.json` (0) · `npm run lint` (hold the 125-problem baseline) · `npm run build` · `npm test` - and add a `scripts/verify-*.mjs` harness for any new pure logic.
- Commit **and** push (trailers per the session's attribution).
- Then update `docs/AE-FEATURE-BATCHES.md`: flip this batch to `✅` (both the Status table and its section heading), move the `▶ **next**` marker to the following batch, and note anything deferred or split.
- If, once inside the work, the batch is clearly too large for one solid prompt, split it (e.g. `B19a` / `B19b`), ship the first half bulletproof, and record the split in the doc rather than cutting corners.

---

## Unattended mode (`auto`)

You are running inside the unattended loop. There is NO user to ask. Build exactly **one unit of work** this session (one batch, or one fix pass), record state, commit + push, and stop. Never ask a question; decide with the functional default consistent with the batch section and the existing code, log the decision, and continue.

The loop's shared state lives in **`docs/auto-batch-state.md`** (not the conversation). Its top block has five canonical fields the runner greps - keep them as the first lines and update them in place:

```
needs_human: none
all_done: false
last_completed_batch: none
remaining_buildable: unknown
browser_pending: none
```

### Step 1 - pick the target

1. Read `docs/auto-batch-state.md`.
2. If `all_done: true`, do nothing and stop.
3. **Fix path:** if the `## Log` entry for `last_completed_batch` has a `review: rejected` line and **no** `fix-attempt: done` line, the previous batch failed review. Re-target THAT batch: read the numbered problems, fix every one, re-run the gates (Step 3), then under that entry append `fix-attempt: done (<date>)` and refresh its `review request:` file list. Commit + push `batch-<ID>: fixes`. Do NOT change `last_completed_batch`. Stop.
4. **Build path:** read `docs/AE-FEATURE-BATCHES.md`. Target = the `▶ **next**` row; else the first `⬜` row whose Status cell does **not** contain `skip`. If no such row exists, set `all_done: true` and `needs_human: none` in the state file, commit + push `batch: plan complete`, and stop.
5. If the argument is `auto skip-browser` **and** the target's Status cell or section is browser-gated (its Status cell contains `(browser)`): do not build it. Set `needs_human: remaining work is browser-gated (<ID>); eyeball required` in the state file, commit + push, and stop.

### Step 2 - build (standing rules, no exceptions)

- **Audit first.** Check what already exists for these features (delegate a broad surface to Explore agents) and build only the genuine gaps / fix what is broken. Never duplicate.
- Implement deeply and bulletproof. Hold **frame-purity** (every evaluator a pure function of `(state, frame)`; house `mulberry32` for randomness - never `Date`/`Date.now()`/`Math.random()`), the performance principles in the batch doc, and 2.5D-only scope (never build a `⏭️ skip (3D)` batch).
- **Never use an em dash (U+2014)** anywhere - code, comments, strings, UI, docs. Use a hyphen, colon, comma, or parentheses.
- Do not add a dependency unless genuinely required; follow existing patterns; do not over-engineer.
- Any decision you would have asked a human: pick the functional default that fits the batch section + existing code, add a `deviations:` note to this batch's log entry, and continue.

### Step 3 - gates (all must be green)

Run and pass, in this order:
1. `npx tsc --noEmit -p tsconfig.app.json` -> **0 errors**.
2. `npm run lint` -> do **not** regress the 125-problem baseline (106 errors / 19 warnings).
3. `npm run build`.
4. `npm test`. Add a `scripts/verify-*.mjs` harness for any new pure logic and wire it into `package.json` + `scripts/test-all.mjs` so `npm test` covers it.

If a gate is red: fix and re-run (at most **two** fix attempts this session). If still red after two attempts, set `needs_human: <gate> red on <ID>: <one-line reason>` in the state file, do NOT mark the batch done, do NOT commit broken code (stash or leave the WIP uncommitted), and stop. **Never mark a batch `✅` with a red gate.**

### Step 4 - ship + record

1. `docs/AE-FEATURE-BATCHES.md`: flip this batch to `✅` in BOTH the Status table and its section heading; move `▶ **next**` to the next `⬜` row that is not `⏭️ skip`; note anything deferred or split in the section.
2. If the batch was browser-gated (`(browser)`): add its ID to `browser_pending:` in the state file - it is **code-complete, browser eyeball owed**. Do not claim visual verification anywhere.
3. Commit **and push to the current branch** (the runner forbids `main`) with message `batch-<ID>: <short title>` and the standing attribution trailers.
4. `docs/auto-batch-state.md`: set `last_completed_batch: <ID>`; recompute `remaining_buildable:` = count of `⬜` rows that are not `skip`; append a `## Log` entry:
   ```
   ### <ID> - <title>
   built: <date>
   review request: <changed files from `git diff --name-only HEAD~1`, space-separated>
   deviations: <none, or what you decided>
   review: pending
   ```
   Commit + push this bookkeeping (`batch-<ID>: progress`).

### Step 5 - stop

One `/next-batch auto` session = one batch built (or one fix pass). Stop after Step 4. The runner starts the next session.

**Splitting:** if mid-build the batch is clearly too big for one solid session, split it (e.g. `B10e` -> `B10e-1` / `B10e-2`), ship the first half bulletproof, record the split in both docs, mark the first half `✅`, and set the remainder as the new `▶ **next**`.
