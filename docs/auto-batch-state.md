needs_human: none
all_done: false
last_completed_batch: none
remaining_buildable: unknown
browser_pending: none

# Auto-batch run state

The shared state for the unattended batch runner (`scripts/run-batches.sh`). The five
fields above are the canonical, machine-read top block - the runner greps them, and
`/next-batch auto` + `/review-batch` update them in place. Keep them as the first five
lines, one `key: value` per line.

Field meanings:
- `needs_human` - `none`, or a one-line reason the loop stopped and wants a person. The
  runner exits (code 3) when this is anything but `none`. Clear it back to `none` after
  you have dealt with the cause, then rerun the script to resume.
- `all_done` - `true` once no buildable (`⬜`, non-`skip`) batch remains. Runner exits 0.
- `last_completed_batch` - the ID (e.g. `B32`) of the most recently built batch, used by
  `/review-batch` to know what to review and by the runner to detect progress.
- `remaining_buildable` - count of `⬜` rows in `docs/AE-FEATURE-BATCHES.md` that are not
  `skip`. Informational.
- `browser_pending` - space-separated IDs of batches that are code-complete but still owe
  an in-browser (WebGPU) eyeball. These were verified by tsc/lint/build/test only.

Everything the runner did also lands in `docs/auto-run.log` and `git log --oneline`
(build + progress + review commits per batch).

## Log

(One entry per batch, appended by `/next-batch auto` and `/review-batch`. Format:)

<!--
### <ID> - <title>
built: <date>
review request: <changed files>
deviations: <none, or the decision made>
review: <pending | accepted | rejected + numbered problems>
fix-attempt: done (<date>)   # only present if a rejected batch was fixed
-->
