---
description: Independent review of the last completed batch against its verification plan. Used by scripts/run-batches.sh.
---

You are reviewing code you did not write. Be skeptical: look for what is stubbed, faked, or quietly broken, not for reasons to pass.

1. Read `docs/auto-batch-state.md`; let **ID** = `last_completed_batch`. If it is `none`, print `REVIEW: ACCEPTED` on its own last line and stop (nothing to review).
2. Read Batch **ID**'s section from `docs/AE-FEATURE-BATCHES.md` - grep its heading line and read only that section, never the whole file. Note its **Delivers** list and **verification plan**.
3. Inspect the changed files from Batch **ID**'s `review request:` line in the state file: `git show` the batch commit, or `git diff HEAD~1 -- <files>`.
4. Run the gates yourself: `npx tsc --noEmit -p tsconfig.app.json`, `npm run lint`, `npm test`. (Skip `npm run build` unless tsc output looks suspicious - it is slow.)

Verify, in order. A single failure is a rejection:
1. **Delivers is real.** Every feature in the batch's Delivers list traces to actual implemented code - not a stub, a TODO, or a thrown "not implemented".
2. **Harnessed.** New pure logic has a `scripts/verify-*.mjs` harness, it is wired into `package.json` + `scripts/test-all.mjs`, and `npm test` passes it.
3. **Frame-purity.** No `Date`, `Date.now()`, `new Date()`, or `Math.random()` in any new evaluator; randomness uses the house `mulberry32`.
4. **No em dash.** The character U+2014 appears nowhere in the diff.
5. **No secret.** No key committed, nothing new `VITE_`-prefixed that is secret, `.env` not added.
6. **Gates hold.** tsc is 0; lint did not regress past the 125-problem baseline (106 errors / 19 warnings).
7. **Honest status.** Nothing flipped to `✅` that is actually unbuilt; any browser-gated work is listed in `browser_pending:` and not claimed as visually verified.
8. **Scope.** 2.5D only (no full-3D), and no `⏭️ skip` batch was built.

Append the verdict to Batch **ID**'s entry in `docs/auto-batch-state.md`:
- `review: accepted`, or
- `review: rejected` followed by a numbered list of concrete problems, each with `file:line`.

Commit `batch-<ID>: review` (push to the current branch is fine; never force-push).

The very last line of your output must be exactly `REVIEW: ACCEPTED` or `REVIEW: REJECTED`.
