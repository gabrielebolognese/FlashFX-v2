# Unattended batch builds

Start once, walk away, come back to a finished (or cleanly stopped) build of the
`docs/AE-FEATURE-BATCHES.md` plan.

## How it works

A shell script (`scripts/run-batches.sh`) runs **one batch per fresh Claude Code
session**. Each build session reads `docs/AE-FEATURE-BATCHES.md` to find the next
buildable batch, audits what already exists, implements the real gaps, runs the standing
gates, commits + pushes, and flips the batch to `✅`. A second, separate session reviews
that batch against its Delivers list and verification plan. If the review passes, the
script immediately starts the next batch. It stops only when the plan is complete, a
session asks for a human, or a batch fails twice.

Why fresh sessions: the whole plan cannot share one context window. State lives in
`docs/AE-FEATURE-BATCHES.md` (which batch is next / done), `docs/auto-batch-state.md`
(the runner's machine-read status + per-batch log), and git - never in the conversation.

```
run-batches.sh loop
  -> claude -p  /next-batch auto     build one batch  (commit+push, flip ✅, update state)
  -> claude -p  /review-batch        independent review (verdict -> REVIEW: ACCEPTED|REJECTED)
  -> accepted?  next batch   rejected? one fix pass, re-review   twice-rejected? stop
```

## The pieces

- **`docs/AE-FEATURE-BATCHES.md`** - the plan and the source of truth. `▶ **next**` marks
  the current batch; `✅` done; `⬜` pending; `⏭️ skip` never built (3D - out of scope).
- **`.claude/commands/next-batch.md`** - `/next-batch` (interactive: show + wait for `go`)
  and `/next-batch auto` (unattended: build one batch end to end, no questions).
- **`.claude/commands/review-batch.md`** - `/review-batch`, the skeptical independent pass.
- **`docs/auto-batch-state.md`** - five canonical top fields the runner greps
  (`needs_human`, `all_done`, `last_completed_batch`, `remaining_buildable`,
  `browser_pending`) plus a per-batch `## Log`.
- **`scripts/run-batches.sh`** - the loop.

## Running it

This runs on `main` and pushes each finished batch to `main` (the user's chosen setup).
Note that every push to `main` auto-deploys to production (editor.flashfx.app via Netlify),
including browser-gated batches that were only verified headlessly.

```bash
bash scripts/run-batches.sh
```

Options: `--max-batches N` (stop after N accepted batches; default 100),
`--max-budget-usd N` (optional per-session API spend cap; default none), `--skip-browser`
(stop and ask for a human when the next batch is WebGPU/browser-gated rather than build
GPU code that cannot be verified headlessly).

`--dangerously-skip-permissions` is what makes it unattended (no edit/command prompts);
that is why it runs on an isolated branch.

## Honest limits

- **Headless gates only.** A build session verifies with `tsc` (0 errors), `npm run lint`
  (held at the 125-problem baseline), `npm run build`, and `npm test`. It cannot open a
  browser. Browser-gated batches (WebGPU shaders, visual compositing - the `(browser)`
  rows) are built and compiled but **not visually verified**; their IDs are collected in
  `browser_pending:` in the state file for you to eyeball before merging. Use
  `--skip-browser` if you would rather not auto-build those at all.
- **Review is a second model, not a human.** It catches stubs, broken gates, em dashes,
  frame-purity and scope violations - not subjective quality or visual correctness.

## When it stops

Everything is in `docs/auto-run.log`, `docs/auto-batch-state.md`, and `git log --oneline`
(build + progress + review commits per batch). Exit codes:

- **0** - plan complete, or `--max-batches` reached.
- **2** - misuse: bad argument, `claude` not on PATH, or setup files missing.
- **3** - a session wrote `needs_human`. Read the reason in `docs/auto-batch-state.md`,
  fix the cause, set `needs_human:` back to `none`, and rerun to resume.
- **4** - a batch did not complete even after a retry (the build session errored or
  stopped early; check `docs/auto-run.log` for the session error, then rerun).
- **5** - a batch failed review twice. Inspect its log entry, fix by hand or adjust the
  batch scope in `docs/AE-FEATURE-BATCHES.md`, and rerun.

In every stop case, rerunning the script resumes from where it left off.
