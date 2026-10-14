#!/usr/bin/env bash
# FlashFX unattended batch runner (overnight-proof).
#
# Builds every buildable batch in docs/AE-FEATURE-BATCHES.md in sequence, each in its own
# fresh Claude Code session, reviews each, and keeps going through failures so an
# unattended run makes maximum progress while you are away. State lives in
# docs/auto-batch-state.md and git, never in the terminal - so it resumes cleanly.
#
#   build  ->  /next-batch auto   (one batch: audit, implement, gates, commit+push, flip status)
#   review ->  /review-batch      (independent pass; last line REVIEW: ACCEPTED|REJECTED)
#
# Robustness (what this version adds):
#   - Prints "... still building <batch> (Nm elapsed)" every 5 minutes so you can see it is alive.
#   - Retries a failing batch up to MAX_RETRIES times WITHOUT discarding work (no git reset).
#   - On a Claude usage/rate limit: logs the reset hint if Claude gives one, then waits and
#     retries every 30 min until it clears (limit waits do NOT count against MAX_RETRIES).
#   - If a batch still cannot be built after MAX_RETRIES, it is auto-DEFERRED (marked skip in
#     the plan) and the runner moves to the next batch, so the night keeps producing. Every
#     such event is written to docs/HANDOFF.md with exactly what to do.
#   - Survives the terminal closing when started with nohup (see docs/HANDOFF.md / the README echo).
#
# Usage:  scripts/run-batches.sh [--max-batches N] [--max-retries N] [--max-budget-usd N] [--skip-browser]
#
# Exit codes: 0 done / cap reached · 2 misuse · 3 needs_human (a session asked for you) ·
#             4 could not auto-defer a stuck batch · 6 loop guard tripped · 7 limit never cleared.
# NOTE: commits and pushes to the current branch (main). Each push auto-deploys to production.

set -uo pipefail
cd "$(git rev-parse --show-toplevel)" 2>/dev/null || { echo "not in a git repo"; exit 2; }

# ---- config ---------------------------------------------------------------
MAX_BATCHES=100            # stop after this many ACCEPTED batches this run (runaway cap)
MAX_RETRIES=5             # per-batch build/review attempts before deferring (per your ask)
MAX_BUDGET=""             # optional per-session API spend cap (passed to claude)
AUTO_ARG="auto"           # or "auto skip-browser"
HEARTBEAT=300             # seconds between "still building" pings (5 min)
LIMIT_WAIT=1800           # seconds to wait between usage-limit retries (30 min)
MAX_LIMIT_WAITS=48        # give up after this many limit waits (48 x 30min = 24h)

while [[ $# -gt 0 ]]; do
  case "$1" in
    --max-batches)    MAX_BATCHES="$2"; shift 2;;
    --max-retries)    MAX_RETRIES="$2"; shift 2;;
    --max-budget-usd) MAX_BUDGET="$2"; shift 2;;
    --skip-browser)   AUTO_ARG="auto skip-browser"; shift;;
    *) echo "unknown arg: $1"; exit 2;;
  esac
done

STATE=docs/auto-batch-state.md
LOG=docs/auto-run.log
DOC=docs/AE-FEATURE-BATCHES.md
HANDOFF=docs/HANDOFF.md
NEXT_CMD=.claude/commands/next-batch.md
REVIEW_CMD=.claude/commands/review-batch.md

command -v claude >/dev/null 2>&1 || { echo "claude CLI not found on PATH"; exit 2; }
[[ -f "$STATE" && -f "$NEXT_CMD" && -f "$REVIEW_CMD" && -f "$DOC" ]] || { echo "run setup first (missing files)"; exit 2; }

SESS="$(mktemp)"            # holds the CURRENT session's output only
HB_PID=""
cleanup() { [[ -n "$HB_PID" ]] && kill "$HB_PID" 2>/dev/null; rm -f "$SESS"; }
trap cleanup EXIT INT TERM

branch="$(git rev-parse --abbrev-ref HEAD)"
DEFERRED=""                # space-padded list of batch IDs we gave up on this run (loop guard)

# ---- helpers --------------------------------------------------------------
field() { grep -iE "^$1:" "$STATE" 2>/dev/null | head -1 | sed -E 's/^[^:]*:[[:space:]]*//' | tr -d '\r'; }
log()   { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }

CLAUDE_FLAGS=(-p --dangerously-skip-permissions --output-format text)
[[ -n "$MAX_BUDGET" ]] && CLAUDE_FLAGS+=(--max-budget-usd "$MAX_BUDGET")

# the first buildable batch id: the ">" next marker, else the first pending (box) row,
# excluding any row whose status says "skip" (that covers out-of-scope AND auto-deferred rows).
current_target() {
  local rows t
  rows="$(grep -E '^\| *B' "$DOC")"
  t="$(echo "$rows" | grep '▶' | grep -vi 'skip' | head -1)"
  [[ -z "$t" ]] && t="$(echo "$rows" | grep '⬜' | grep -vi 'skip' | head -1)"
  echo "$t" | sed -E 's/^\| *//; s/ *\|.*//'
}

is_usage_limited() {
  grep -qiE 'usage limit|rate[ _-]?limit|limit reached|limit will reset|resets? at|too many requests|\b429\b|retry[- ]after|out of (credits|quota)|insufficient quota' "$SESS"
}

# run ONE claude session. Streams a heartbeat every HEARTBEAT secs, captures output to $SESS
# (and appends to $LOG). On a usage/rate limit, waits LIMIT_WAIT and retries, forever-ish.
# $1 = prompt (a slash command)   $2 = activity label e.g. "building B12-gpu"
run_session() {
  local prompt="$1" label="$2" waits=0
  while true; do
    : > "$SESS"
    ( m=0; while true; do sleep "$HEARTBEAT"; m=$((m + HEARTBEAT/60)); log "... still $label (${m}m elapsed)"; done ) &
    HB_PID=$!
    claude "${CLAUDE_FLAGS[@]}" "$prompt" 2>&1 | tee -a "$SESS" >> "$LOG"
    kill "$HB_PID" 2>/dev/null; wait "$HB_PID" 2>/dev/null; HB_PID=""

    if is_usage_limited; then
      waits=$((waits + 1))
      local hint; hint="$(grep -ioE 'resets? at[^.]*|retry[- ]after[^.]*|limit will reset[^.]*' "$SESS" | head -1)"
      if (( waits > MAX_LIMIT_WAITS )); then
        note_handoff "STOPPED: Claude usage limit never cleared after ${MAX_LIMIT_WAITS} x $((LIMIT_WAIT/60))min waits while $label. Resume when your access is back (see resume command at top)."
        log "STOP: usage limit did not clear after ${MAX_LIMIT_WAITS} waits; see docs/HANDOFF.md"
        exit 7
      fi
      log "usage/rate limit while $label${hint:+ (Claude said: $hint)}; waiting $((LIMIT_WAIT/60)) min then retrying (wait ${waits}/${MAX_LIMIT_WAITS}, no work lost)"
      sleep "$LIMIT_WAIT"
      continue
    fi
    return 0
  done
}

stop_if_flagged() {
  [[ "$(field all_done)" == "true" ]] && { log "DONE: all buildable batches complete"; finalize "complete"; exit 0; }
  local n; n="$(field needs_human)"
  [[ -n "$n" && "$n" != "none" ]] && { note_handoff "A build session asked for a human: \"$n\". Deal with it, set needs_human back to none in docs/auto-batch-state.md, then resume."; log "STOP needs_human: $n"; exit 3; }
}

note_handoff() { printf -- '- [%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" >> "$HANDOFF"; }

init_handoff() {
  cat > "$HANDOFF" <<EOF
# FlashFX unattended batch run - handoff notes

Run started: $(date '+%Y-%m-%d %H:%M:%S')  (branch: $branch)

Every batch is already specified in docs/AE-FEATURE-BATCHES.md; this run only implements
them. Nothing here is ever discarded - partial work stays in the working tree and git.

## To (re)start or resume - continues exactly where it left off
    cd $(pwd)
    nohup bash scripts/run-batches.sh > docs/auto-run.console.log 2>&1 &
    disown
Watch it:   tail -f docs/auto-run.log
Stop it:    pkill -f run-batches.sh

## Anything that needs you is listed below (empty means it ran clean)
EOF
}

finalize() {  # $1 = why the run ended
  local defs; defs="$(echo "$DEFERRED" | tr -s ' ')"
  note_handoff "Run ended: $1.${defs:+  Auto-deferred batches (need you): $defs}"
  log "run ended: $1${defs:+ ; deferred:$defs}"
}

# mark a batch row's status cell as skip (auto-deferred) so BOTH this script and the
# in-session target picker skip it. Guarded: aborts (returns 1) rather than risk corrupting
# the table. $1 = batch id (trimmed).
defer_batch() {
  local id="$1" tmp n_before n_after matches
  n_before="$(grep -cE '^\| *B' "$DOC")"
  matches="$(grep -cE "^\| *$id *\|" "$DOC")"
  [[ "$matches" == "1" ]] || return 1
  tmp="$(mktemp)"
  # sed -b keeps CRLF intact (Git Bash sed would otherwise strip \r file-wide); only the one
  # matching row is rewritten - its status cell (3rd) becomes a skip note, the rest untouched.
  sed -b "/^| *$id *|/ s#^\(| *$id *|[^|]*|\)[^|]*|#\1 ⏭️ skip (auto-deferred: see docs/HANDOFF.md) |#" "$DOC" > "$tmp"
  n_after="$(grep -cE '^\| *B' "$tmp")"
  { [[ "$n_before" == "$n_after" ]] && grep -qiE "^\| *$id *\|.*skip" "$tmp"; } || { rm -f "$tmp"; return 1; }
  mv "$tmp" "$DOC"
  git add "$DOC" 2>/dev/null
  git commit -q -m "batch-runner: defer $id after $MAX_RETRIES failed attempts (see docs/HANDOFF.md)" 2>/dev/null
  git push -q 2>/dev/null || true
  return 0
}

# ---- main -----------------------------------------------------------------
init_handoff
log "=== unattended run start (branch: $branch, mode: $AUTO_ARG, max-batches: $MAX_BATCHES, max-retries: $MAX_RETRIES) ==="
count=0
while (( count < MAX_BATCHES )); do
  stop_if_flagged
  target="$(current_target)"
  if [[ -z "$target" ]]; then log "no buildable batch remains"; finalize "all batches done or deferred"; exit 0; fi
  case " $DEFERRED " in *" $target "*) note_handoff "STOPPED: $target keeps coming up after a defer attempt (table edit may have failed). Fix it by hand (mark its row skip in $DOC) and resume."; log "STOP: loop guard on $target"; exit 6;; esac

  before="$(field last_completed_batch)"

  # ---- build (retry up to MAX_RETRIES, work preserved) ----
  built=0
  for (( a=1; a<=MAX_RETRIES; a++ )); do
    log "--- build $target (attempt $a/$MAX_RETRIES; last completed: ${before:-none}) ---"
    run_session "/next-batch $AUTO_ARG" "building $target"
    stop_if_flagged
    after="$(field last_completed_batch)"
    if [[ "$after" != "$before" ]]; then built=1; break; fi
    log "no progress on $target (attempt $a/$MAX_RETRIES); work preserved, will retry"
  done
  if (( built == 0 )); then
    note_handoff "BUILD FAILED x$MAX_RETRIES on $target. It is specified in $DOC; the implementation did not complete. Tail docs/auto-run.log for the session's own error."
    if defer_batch "$target"; then
      DEFERRED="$DEFERRED $target"
      log "auto-deferred $target (marked skip in $DOC); continuing to the next batch"
      continue
    else
      note_handoff "Could not auto-defer $target (table edit aborted to avoid corruption). Mark its row skip in $DOC by hand, then resume."
      log "STOP: could not defer $target"; finalize "stuck on $target"; exit 4
    fi
  fi

  # ---- review (retry up to MAX_RETRIES, fix pass between) ----
  reviewed=0
  for (( r=1; r<=MAX_RETRIES; r++ )); do
    log "--- review $after (attempt $r/$MAX_RETRIES) ---"
    run_session "/review-batch" "reviewing $after"
    verdict="$(tail -1 "$SESS" | tr -d '\r')"
    case "$verdict" in
      *ACCEPTED*) reviewed=1; break;;
      *REJECTED*) log "$after REJECTED (attempt $r/$MAX_RETRIES); running a fix pass (work preserved)"; run_session "/next-batch $AUTO_ARG" "fixing $after"; stop_if_flagged;;
      *)          log "$after review gave no clear verdict (last line: ${verdict:-<empty>}); will re-review";;
    esac
  done
  if (( reviewed == 1 )); then
    log "$after accepted"
  else
    # the batch IS built and committed; only the review did not pass. Flag it and move on.
    note_handoff "REVIEW not passed x$MAX_RETRIES on $after. It is BUILT and committed, but unverified by the review pass - give it a closer look. See docs/auto-run.log."
    log "WARNING: $after built but review not accepted after $MAX_RETRIES; continuing (it is committed, flagged in docs/HANDOFF.md)"
  fi
  count=$((count + 1))
done

log "stopped: --max-batches ($MAX_BATCHES) reached"
finalize "max-batches ($MAX_BATCHES) reached"
exit 0
