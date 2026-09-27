# Pipeline duration sampling

Queries and fallbacks for computing `p50` / `p90` / `max_seen` once per train
run (pre-flight step 3). Return to `SKILL.md` once you have the three numbers.

Sample recent successful **MR pipelines**, not target-branch pipelines. After a
rebase the train waits on the MR's own pipeline, and target-branch pipelines
often run a longer job set. List successful pipelines on every ref and drop the
target branch's own:

```bash
glab ci list -F json -s success -P 20 | jq --arg target <target-branch> '
  def epoch: capture("^(?<t>[0-9-]+T[0-9:]+)(\\.[0-9]+)?(?<z>Z|[+-][0-9]{2}:[0-9]{2})$")
    | (.t + "Z" | fromdateiso8601)
      - (if .z == "Z" then 0 else (.z[0:1] + "1" | tonumber) * ((.z[1:3] | tonumber) * 3600 + (.z[4:6] | tonumber) * 60) end);
  [.[] | select(.ref != $target)
       | (.duration // ((.updated_at | epoch) - (.created_at | epoch))) | floor
       | select(. > 0)] | sort'
```

Some GitLab versions return `duration: null` from the list endpoint. The query
then falls back to wall time from `created_at` to `updated_at`. GitLab sends
those timestamps with fractional seconds and the server's UTC offset
(`2026-09-27T11:57:21.552+08:00`), and jq's `fromdateiso8601` accepts only
`YYYY-MM-DDTHH:MM:SSZ`, so `epoch` parses them itself.

From the sorted durations compute:
- **`p50`** (median) — typical wall time from rebase-push to merge
- **`p90`** — slow-but-still-fine case
- **`max_seen`** — sanity bound for "this is definitely stuck"

Fallbacks if history is sparse (< 5 successful runs): `p50=180s`, `p90=600s`,
`max_seen=1800s`. Note the fallback in the pre-flight summary so the user knows
the timing is a guess.
