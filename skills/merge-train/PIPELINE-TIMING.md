# Pipeline duration sampling

Queries and fallbacks for computing `p50` / `p90` / `max_seen` once per train
run (pre-flight step 3). Return to `SKILL.md` once you have the three numbers.

Sample recent successful pipelines on the target branch via `glab ci list`:

```bash
glab ci list -F json -r <target-branch> -s success -P 20 \
  | jq '[.[].duration | select(type == "number" and . > 0)] | sort_by(.)'
```

In some GitLab versions `duration` is `null` in the list endpoint. If so, fall
back to wall time from `created_at` → `updated_at`:

```bash
glab ci list -F json -r <target-branch> -s success -P 20 \
  | jq '[.[] | (((.updated_at | fromdateiso8601) - (.created_at | fromdateiso8601)) | floor) | select(. > 0)] | sort_by(.)'
```

From the sorted durations compute:
- **`p50`** (median) — typical wall time from rebase-push to merge
- **`p90`** — slow-but-still-fine case
- **`max_seen`** — sanity bound for "this is definitely stuck"

Fallbacks if history is sparse (< 5 successful runs): `p50=180s`, `p90=600s`,
`max_seen=1800s`. Note the fallback in the pre-flight summary so the user knows
the timing is a guess.
