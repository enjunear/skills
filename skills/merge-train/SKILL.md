---
name: merge-train
description: Sequential GitLab merge train — lands a list of MRs one at a time, rebasing each onto the result of the previous merge.
disable-model-invocation: true
---

# merge-train — Sequential GitLab Merge Train

Process GitLab MRs one at a time. For each MR: server-side rebase, resolve any conflicts in a worktree, set auto-merge, poll until merged or failed. Move to the next MR. Never parallel.

## When to invoke

User types `/merge-train [args]` or asks to "run a merge train", "merge these MRs in order", "land MRs !101 !102 !103", etc.

## Args (parse from the user's invocation)

| Arg | Meaning |
|---|---|
| `MR_ID...` (positional) | Process these MRs in given order |
| `--label LABEL` | Fetch MRs matching label |
| `--target-branch BRANCH` | Fetch MRs targeting branch |
| `--assignee USER` | Fetch MRs assigned to user |
| `--include-unapproved` | Include unapproved MRs when auto-fetching (default: approved only) |
| `--on-conflict resolve\|skip\|stop` | Conflict policy (default: `resolve`) |
| `--skip-ci` | Pass `--skip-ci` to `glab mr rebase` |
| `--timeout DURATION` | Per-MR merge timeout (default: `60m`) |
| `--poll-interval SECONDS` | Poll cadence (default: `30`) |
| `--dry-run` | Print steps, don't execute |
| `--yes` / `-y` | Skip confirmation prompt |

When no explicit MR IDs are given — whether bare (no flags) or with filter flags — fetch with `glab mr list -F json` and select IIDs sorted by `created_at` ascending (oldest first). Bare means all open MRs; filter flags narrow the list:

```bash
glab mr list -F json [--label X] [--target-branch Y] [--assignee Z] \
  | jq -r 'sort_by(.created_at) | .[].iid'
```

**Then reduce the auto-fetched list to approved MRs** (unless `--include-unapproved` was passed). Approval must be read per-MR from the approvals endpoint — **not** from `detailed_merge_status`, which reports `not_approved` only when the project enforces a mandatory approval rule. A project with no such rule marks unreviewed MRs `mergeable`, so the list JSON can't tell approved from unapproved:

```bash
glab api "projects/:fullpath/merge_requests/<id>/approvals" | jq '.approved'
```

Keep only MRs where `approved` is `true`. Log which unapproved MRs you dropped. If a project has no approval rules at all, an unreviewed MR returns `approved=false` and is correctly skipped. Explicit MR IDs are never filtered — the user chose them. If nothing survives the filter, tell the user (suggest `--include-unapproved`) rather than proceeding with an empty train.

## Pre-flight (once, before processing)

1. Verify `glab`, `jq`, `git` are available.
2. Verify CWD is a git repo with a GitLab remote (`glab repo view` should succeed).
3. **Sample recent pipeline durations on the target branch.** This drives adaptive polling later — see "Pipeline duration intelligence" below.
4. List the MRs about to board, with the estimated per-MR wait window. Unless `--yes` or `--dry-run`, ask "all aboard? [y/N]" and wait for confirmation.

## Pipeline duration intelligence

A fixed poll interval misbehaves: it wastes API calls while CI is mid-run and then delays the next MR after merge. Use real pipeline history instead.

Once per train run, compute three numbers from recent successful pipelines on the target branch — see [`PIPELINE-TIMING.md`](PIPELINE-TIMING.md) for the `glab ci list` queries and sparse-history fallbacks:
- **`p50`** (median) — typical wall time from rebase-push to merge
- **`p90`** — slow-but-still-fine case
- **`max_seen`** — sanity bound for "this is definitely stuck"

These numbers are the wait budget. Use them for poll cadence (step 6 below) and for deciding when to investigate.

## Per-MR workflow

For each MR sequentially. If one MR fails, continue to the next (unless `--on-conflict=stop` was the failure cause).

### 0. Boarding scan — read the MR JSON once

Before doing anything, fetch the full MR state. The JSON tells you a lot in one call — use it instead of poking individual fields.

```bash
glab mr view <id> --output json | jq '{
  state, draft, work_in_progress,
  detailed_merge_status,            # richer than merge_status — see below
  has_conflicts,
  diverged_commits_count,           # >0 means rebase needed; 0 = skip step 1
  blocking_discussions_resolved,
  source_branch, target_branch, sha,
  pipeline_status: .head_pipeline.status,
  pipeline_id: .head_pipeline.id
}'
```

**`detailed_merge_status`** is the single most useful field GitLab gives you — its own computed verdict on mergeability. Map it directly to skip/fail/continue decisions instead of re-deriving from individual fields. The full value → meaning → action table is in step 4.

**`diverged_commits_count`** tells you whether step 1 is needed at all. If 0, the source branch is current with target — **skip the rebase**, go straight to step 3.

### 1. Server-side rebase (skip if `diverged_commits_count == 0`)

```bash
glab mr rebase <id> [--skip-ci]
```

> ⚠️ **`glab mr rebase` lies.** It will print `✓ Rebase successful!` and exit 0 as soon as GitLab *accepts* the rebase request — even if the actual rebase then fails with conflicts. The exit code and CLI output reflect *the API call*, not *the rebase outcome*. **Never trust the CLI's success message.** Always confirm the result by polling `rebase_in_progress` and reading `merge_error` and `has_conflicts` from the MR JSON.

The rebase runs async on the server. Poll until `rebase_in_progress=false`, max 120s:

```bash
glab api "projects/:fullpath/merge_requests/<id>?include_rebase_in_progress=true" \
  | jq '{rebase_in_progress, merge_error, has_conflicts}'
```

Outcome (read these fields, not the CLI exit code):
- `merge_error` non-empty/non-null → rebase failed → conflict handler
- `has_conflicts=true` → conflict handler
- Both empty/false → success, proceed

### 2. Conflict resolution (only if rebase failed)

Branch on `--on-conflict`:

- **`stop`** — Halt the train. Report which MR stopped it.
- **`skip`** — Log, mark MR `skipped`, move to next.
- **`resolve`** (default) — resolve in a local worktree, force-push with lease, clean up. Full procedure and safety rules in [`CONFLICTS.md`](CONFLICTS.md). Then continue to step 3.

### 3. Wait for `detailed_merge_status` to settle

After rebase / force-push, GitLab needs a moment to re-evaluate. Poll `detailed_merge_status` (richer than the legacy `merge_status`), up to 30s:

```bash
glab mr view <id> --output json | jq -r '.detailed_merge_status'
```

- `mergeable` → proceed to step 4
- `ci_still_running` → proceed to step 4 (auto-merge will wait for CI)
- `checking` / `unchecked` → keep polling
- Anything else → proceed to step 4 anyway and let pre-flight produce a precise reason

### 4. Pre-flight checks (once, before setting auto-merge)

Re-read the MR JSON and decide off `detailed_merge_status` first — it's already computed by GitLab and gives a precise blocker. Only fall back to individual fields if you need detail.

```bash
glab mr view <id> --output json | jq '{detailed_merge_status, draft, work_in_progress, has_conflicts, pipeline: .head_pipeline.status, discussions: .blocking_discussions_resolved}'
```

Mark MR `failed` and move to next based on `detailed_merge_status`. This is the authoritative value → meaning → action table referenced from step 0:

| `detailed_merge_status` | Meaning | Outcome | Reason tag |
|---|---|---|---|
| `mergeable` | Ready to merge | Proceed to step 5 | — |
| `ci_still_running` | Pipeline running | Proceed to step 5 (auto-merge handles it) | — |
| `checking` / `unchecked` | GitLab still computing | Keep polling (step 3) | — |
| `conflict` | Merge conflicts | Fail | `conflicts` |
| `need_rebase` | Fast-forward only; rebase required | Fail (you should have rebased — bug) | `needs-rebase` |
| `ci_must_pass` | Pipeline failed or missing | Fail (read pipeline status for the why) | `pipeline-<status>` |
| `discussions_not_resolved` | Unresolved threads | Fail | `discussions` |
| `draft_status` | Draft MR | Fail | `draft` |
| `not_approved` / `requested_changes` | Approval state blocks merge | Fail | `approvals` |
| `external_status_checks` | External check failing | Fail | `external-checks` |
| `not_open` | MR closed/merged already | Skip — already merged or closed | `not-open` |

If `detailed_merge_status` is missing (older GitLab), fall back to the per-field checks: `draft` / `has_conflicts` / `head_pipeline.status ∈ {failed,canceled}` / `blocking_discussions_resolved=false`.

### 5. Set auto-merge

```bash
glab mr merge <id> --auto-merge -y
```

> **Set auto-merge as soon as the rebase is pushed — do NOT wait for CI to pass first.** That's the whole point of `--auto-merge`: GitLab holds the merge until the pipeline goes green, then merges automatically. If you wait for CI yourself, you lose that built-in handoff and add latency before the next MR can start.
>
> Caveat: GitLab returns **HTTP 405 "Method Not Allowed"** if you call `merge` while `detailed_merge_status` is still `checking` after a force-push. Handle this by polling `detailed_merge_status` for ~30s until it leaves `checking` (it'll usually go to `ci_still_running`, which is fine — auto-merge accepts that), then call merge.

> ⚠️ **`glab mr merge --auto-merge` lies, just like `glab mr rebase`.** It often prints `✓ Pipeline succeeded.` and `✓ Merged!` immediately after acceptance, even when the pipeline is still running and the MR is still `opened`. The CLI is reporting that the auto-merge was *armed*, not that the merge happened. Confirm by re-reading `state` from `glab mr view --output json` — `merged` is the only proof. Treat the CLI output as "request accepted" and always poll for the real outcome.

Don't pass squash/remove-source-branch flags — respect whatever the MR is configured with.

### 6. Poll until merged — adaptive cadence

Don't use a fixed poll interval. The next MR should leave the station within seconds of the current one merging — but checking every 30s while CI grinds for 5 minutes is just noise. Use the `p50`/`p90`/`max_seen` from pre-flight to drive cadence.

**Latency budget for "next MR starts":** your check cadence near `p90`. Tune it tight there (≤15s).

#### Phase 1 — quiet wait (0 → ~p50 - 20s)

CI almost certainly hasn't finished. Sleep, don't poll.

```bash
sleep $(( p50 - 20 ))   # floor at 30s if p50 is small
```

One read at the end of this phase: state + pipeline status. Fail fast if `state=closed` or `pipeline ∈ {failed, canceled}`.

#### Phase 2 — landing window (p50 → p90)

This is when the merge is most likely to land. Poll every **10–15s** so the next MR launches with minimal lag.

```bash
state=$(glab mr view <id> -F json | jq -r '.state')
```

Break out the moment `state=merged`.

#### Phase 3 — investigate (past p90)

The pipeline is running long. Don't just wait — look at why.

```bash
pipeline_id=$(glab mr view <id> --output json | jq -r '.head_pipeline.id')
glab ci get -p "$pipeline_id" -F json --with-job-details \
  | jq '{status, jobs: [.jobs[] | {id, name, stage, status, started_at, duration}]}'
```

Decide based on what you see:
- A job is `running` and its elapsed time is ≤ 2× the job's typical duration → keep waiting, ~30s cadence.
- A job is `running` ≥ 2× typical → tail its trace (`glab ci trace <job-id> | tail -100`) to see if it's making progress (new log lines) or wedged.
- A job is `pending` and the runner queue is backed up → wait, but extend the timeout estimate.
- A job has `failed` but the pipeline is `running` (allow_failure or retry-in-progress) → note it but don't fail the MR yet.

#### Phase 4 — escalate (past `max_seen` × 1.5, or `--timeout`)

Something is genuinely stuck. **Ask the user before continuing.** Options to offer:
- Retry the failing/stuck job: `glab ci retry <job-id>`
- Mark this MR `timeout` and continue to the next
- Stop the train

Don't silently keep polling.

#### Implementation note

To keep poll spam out of the conversation, run each phase as a single bash invocation that returns once it has something to report (merged / failed / phase elapsed / interesting state change), rather than echoing every check.

```bash
# Phase 2 example — break the moment something interesting happens
end=$(( $(date +%s) + (p90 - p50) ))
while [ $(date +%s) -lt $end ]; do
  json=$(glab mr view <id> -F json)
  state=$(echo "$json" | jq -r '.state')
  pipeline=$(echo "$json" | jq -r '.head_pipeline.status // "unknown"')
  case "$state" in
    merged) echo "RESULT=merged"; exit 0 ;;
    closed) echo "RESULT=failed reason=closed"; exit 1 ;;
  esac
  case "$pipeline" in
    failed|canceled) echo "RESULT=failed reason=pipeline-$pipeline"; exit 1 ;;
  esac
  sleep 12
done
echo "PHASE_ELAPSED"; exit 3
```

Exit codes: `0=merged`, `1=failed`, `2=timeout`, `3=phase-elapsed-keep-going`.

#### `--poll-interval` override

If the user passes `--poll-interval N`, treat it as the cadence for Phase 2 (overrides the 10–15s default). Phase 1 and Phase 3 cadences still adapt — `--poll-interval` only controls the landing-window granularity.

## Output

Give a brief live update per step (one line per MR per major transition: rebasing, conflict-resolving, auto-merging, waiting, merged/failed/skipped).

At the end, print a summary table to stdout:

```
MR     Status     Duration   Reason
---    ------     --------   ------
!101   merged     2m34s
!102   skipped    -          conflicts-too-complex
!103   failed     5m12s      pipeline-failed
!104   timeout    60m0s
```

Exit semantics: report success if all merged, otherwise list which failed/skipped/timed out so the user can address them.

## Behavior rules

- **Sequential only — and the rebase comes *after* the previous MR lands, never before.** The whole point of a train is that each MR rebases onto the *result* of the previous merge. If you pre-rebase MR N+1 while MR N is still merging, the target branch will move under you and you'll need to rebase again, burning a CI cycle. Order is strict: land MR N → THEN start step 1 for MR N+1. No overlap, no head-start. This applies even when MR N+1 looks "ready" with green CI — it isn't, until it's been rebased onto the post-MR-N target.
- **Always clean up the worktree you created for that MR** (`git worktree remove --force .worktree/merge-train-<id>`), including on interrupt or failure — never delete the whole `.worktree/` directory, since other worktrees (yours or another skill's) may still be in use. Add `.worktree/` to `.gitignore` if it isn't already (mention this once if you create it).
- **Don't auto-fix MRs you weren't asked about** — only the MRs in the list.
- **When in doubt, ask the user.** A 30-second pause beats a wrong force-push. Examples: a conflict where intent is ambiguous, a pipeline that's been "running" much longer than usual, an MR that's already merged unexpectedly.
- **Never `--no-verify`** on push or commit unless the user explicitly approves.
- **Never bypass the `--with-lease` safety** on force pushes.
- **`--dry-run`** means print every step you *would* take without running `glab mr rebase`, `glab mr merge`, `git push`, or any worktree mutation. `glab mr view`/`glab api` reads are fine.

## glab reference

**Prefer native `glab` subcommands over `glab api` raw calls.** The subcommands handle pagination, project resolution, and output shaping for you — the commands are shown inline in the steps above. Only fall back to `glab api` when no subcommand exposes the field you need. The one case that requires it is `rebase_in_progress` / `merge_error`, via `include_rebase_in_progress=true` on the MR endpoint (see step 1); `glab mr view` doesn't surface those fields.

`-F json` and `--output json` are aliases on `glab mr view` / `glab mr list` / `glab ci list` / `glab ci get`; either works. `--output` reads more clearly in scripts.
