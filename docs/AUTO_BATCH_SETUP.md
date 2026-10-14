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

**Run it detached so closing the terminal does not kill it:**

```bash
nohup bash scripts/run-batches.sh > docs/auto-run.console.log 2>&1 &
disown
```

Then you can close the window. Watch it later with `tail -f docs/auto-run.log`, and stop
it with `pkill -f run-batches.sh`. (A plain `bash scripts/run-batches.sh` also works but
dies if that terminal closes.)

Options: `--max-batches N` (stop after N accepted batches; default 100), `--max-retries N`
(attempts per batch before it is auto-deferred; default 5), `--max-budget-usd N` (optional
per-session API spend cap; default none), `--skip-browser` (stop at the next
WebGPU/browser-gated batch instead of building GPU code that cannot be verified headlessly).

`--dangerously-skip-permissions` is what makes it unattended (no edit/command prompts).

## Overnight robustness

- **Heartbeat.** While a batch builds, the log gets `... still building <batch> (Nm
  elapsed)` every 5 minutes, so you can tell it is alive (sessions do not stream output).
- **Retries, no lost work.** A batch that does not complete is retried up to `--max-retries`
  times. Nothing is ever discarded - partial work stays in the working tree and git.
- **Usage/rate limits.** If Claude reports a usage or rate limit, the runner logs the reset
  hint (when Claude gives one) and then retries every 30 minutes until it clears. Limit
  waits do **not** count against the retry budget. It gives up only after 24 hours of waiting.
- **Keeps going.** If a batch still cannot be built after all retries, it is **auto-deferred**
  (its row is marked skip in the plan) and the runner moves to the next batch, so the night
  keeps producing. Everything that needs you is written to `docs/HANDOFF.md` with the exact
  command to resume.
- **Keep the machine awake.** Disable sleep while it runs, or the whole thing pauses.

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

First read `docs/HANDOFF.md` - it carries the resume command and a dated list of anything
that needs you. Full detail is in `docs/auto-run.log`, `docs/auto-batch-state.md`, and
`git log --oneline` (build + progress + review commits per batch). Exit codes:

- **0** - plan complete (all batches done or deferred), or `--max-batches` reached.
- **2** - misuse: bad argument, `claude` not on PATH, or setup files missing.
- **3** - a session wrote `needs_human`. Read the reason in `docs/auto-batch-state.md`,
  fix the cause, set `needs_human:` back to `none`, and resume.
- **4** - a stuck batch could not be auto-deferred (table edit aborted to avoid corruption);
  mark its row skip in `docs/AE-FEATURE-BATCHES.md` by hand, then resume.
- **6** - loop guard: a deferred batch kept reappearing. Mark its row skip by hand, resume.
- **7** - a usage limit never cleared within 24 hours. Resume when your access is back.

In every stop case, resuming the script continues from where it left off. Review rejections
and single-batch build failures no longer stop the run - the batch is flagged in
`docs/HANDOFF.md` (built-but-unreviewed, or auto-deferred) and the runner keeps going.
