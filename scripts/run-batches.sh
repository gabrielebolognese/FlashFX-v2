#!/usr/bin/env bash
# FlashFX unattended batch runner.
#
# Builds every buildable batch in docs/AE-FEATURE-BATCHES.md in sequence, each in its
# own fresh Claude Code session (state lives in docs/auto-batch-state.md and git, not in
# one conversation), and independently reviews each batch before moving to the next.
#
#   build  ->  /next-batch auto   (one batch: audit, implement, gates, commit+push, flip status)
#   review ->  /review-batch      (independent pass; last line REVIEW: ACCEPTED|REJECTED)
#
# The loop stops when: every buildable batch is done (all_done), a session asks for a
# human (needs_human), a batch cannot complete even after a retry, or a batch fails
# review twice.
#
# Usage:  scripts/run-batches.sh [--max-batches N] [--max-turns T] [--skip-browser]
#   --max-batches N   stop after N accepted batches this run (default 100; a runaway cap)
#   --max-turns T     per-session turn cap passed to claude (default 600)
#   --skip-browser    stop (needs_human) when the next batch is browser-gated (WebGPU),
#                     instead of building GPU code that cannot be verified headlessly
#
# IMPORTANT: run this ON A BRANCH, never main - pushing to main auto-deploys to production.
#   git switch -c auto-batches && bash scripts/run-batches.sh
#
# Exit codes: 0 done / cap reached · 2 misuse (on main, bad arg, no claude) ·
#             3 needs_human · 4 a batch did not complete after a retry · 5 rejected twice.

set -uo pipefail
cd "$(git rev-parse --show-toplevel)" 2>/dev/null || { echo "not in a git repo"; exit 2; }

MAX_BATCHES=100
MAX_TURNS=600
AUTO_ARG="auto"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --max-batches) MAX_BATCHES="$2"; shift 2;;
    --max-turns)   MAX_TURNS="$2"; shift 2;;
    --skip-browser) AUTO_ARG="auto skip-browser"; shift;;
    *) echo "unknown arg: $1"; exit 2;;
  esac
done

STATE=docs/auto-batch-state.md
LOG=docs/auto-run.log
NEXT_CMD=.claude/commands/next-batch.md
REVIEW_CMD=.claude/commands/review-batch.md

command -v claude >/dev/null 2>&1 || { echo "claude CLI not found on PATH"; exit 2; }
[[ -f "$STATE" && -f "$NEXT_CMD" && -f "$REVIEW_CMD" ]] || { echo "run setup first (missing state/command files)"; exit 2; }

# read a canonical top-block field from the state file
field() { grep -iE "^$1:" "$STATE" 2>/dev/null | head -1 | sed -E 's/^[^:]*:[[:space:]]*//' | tr -d '\r'; }
log()   { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }

branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$branch" == "main" || "$branch" == "master" ]]; then
  echo "REFUSING to run on '$branch': pushing there auto-deploys to production."
  echo "Create a branch first:  git switch -c auto-batches"
  exit 2
fi

# one batch-build session (interpreting ARGUMENTS ourselves is version-robust vs slash parsing)
run_build()  { claude -p "$(cat "$NEXT_CMD"; printf '\n\nARGUMENTS: %s\n' "$AUTO_ARG")" \
                 --dangerously-skip-permissions --max-turns "$MAX_TURNS" --output-format text 2>&1 \
                 | tee -a "$LOG" >/dev/null; }
# one review session; echo only its last line (the verdict)
run_review() { claude -p "$(cat "$REVIEW_CMD")" \
                 --dangerously-skip-permissions --max-turns "$MAX_TURNS" --output-format text 2>&1 \
                 | tee -a "$LOG" | tail -1; }

stop_if_flagged() {
  [[ "$(field all_done)" == "true" ]] && { log "DONE: all buildable batches complete"; exit 0; }
  local n; n="$(field needs_human)"
  [[ -n "$n" && "$n" != "none" ]] && { log "STOP needs_human: $n"; exit 3; }
}

log "=== unattended run start (branch: $branch, mode: $AUTO_ARG, max-batches: $MAX_BATCHES) ==="
count=0
while (( count < MAX_BATCHES )); do
  stop_if_flagged
  before="$(field last_completed_batch)"
  log "--- build (last completed: ${before:-none}) ---"
  run_build
  stop_if_flagged

  after="$(field last_completed_batch)"
  if [[ "$after" == "$before" ]]; then
    log "no progress this session; retrying once"
    run_build
    stop_if_flagged
    after="$(field last_completed_batch)"
    [[ "$after" == "$before" ]] && { log "STOP: batch did not complete after retry (raise --max-turns?)"; exit 4; }
  fi

  log "--- review $after ---"
  verdict="$(run_review)"
  if [[ "$verdict" == *REJECTED* ]]; then
    log "$after REJECTED; one fix attempt"
    run_build            # fix path: /next-batch auto re-targets the rejected batch
    stop_if_flagged
    verdict="$(run_review)"
    [[ "$verdict" == *REJECTED* ]] && { log "STOP: $after rejected twice"; exit 5; }
  fi
  log "$after accepted"
  count=$((count + 1))
done

log "stopped: --max-batches ($MAX_BATCHES) reached"
exit 0
