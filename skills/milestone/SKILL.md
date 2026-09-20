---
name: milestone
description: >
  Sort open issues that have no milestone into milestones, using read-only triage agents.
  Use when the user types `/milestone`, asks to triage the backlog into milestones, assign issues to a release, or clear the no-milestone queue.
---

Goal: every open issue has a milestone, and every assignment names the fact that decided it.

Read the /glab skill before running any `glab` command. 
`$S` below is the session scratchpad.
For GitHub based repositories, use the appropriate `gh` command.
Take note, `gh` is not directly interchangeable with `glab`.

Split the work this way: you read the milestones and apply every write; each agent classifies one small batch of issues.

## Steps

1. **Read the milestone descriptions yourself.** They define the buckets. If you delegate this read, each agent invents its own buckets.
   `glab milestone list` needs `--project` even when run inside the repo.
   ```bash
   P=$(glab repo view --output json --jq .path_with_namespace)
   glab milestone list --project "$P" --state active --output json \
     --jq '.[] | "=== milestone #\(.iid) \(.title) ===\n\(.description // "")\n"' \
     > "$S/milestones.md"
   ```

2. **List the open issues that have no milestone**, then cut them into batches of six.
   `glab issue list` returns 30 issues by default and at most 100 per page, and stops short without warning. Fetch every page:
   ```bash
   : > "$S/issues.md"; p=1
   while glab issue list --milestone none --per-page 100 --page "$p" --output json > "$S/page.json" \
         && [ "$(jq length "$S/page.json")" -gt 0 ]; do
     jq -r '.[] | "=== #\(.iid) \(.title)\nLabels: \(.labels|join(", "))\n\(.description // "")\n"' \
       "$S/page.json" >> "$S/issues.md"
     p=$((p+1))
   done
   awk '/^=== #/{n++} {print > (FILENAME ".batch" (int((n-1)/6)+1))}' "$S/issues.md"
   ```
   Done when `grep -c '^=== #' "$S/issues.md"` equals the "No milestone" count shown in the tracker.

3. **Write the decision rules before spawning.** One line per milestone. Phrase each rule so that two agents who disagree are disagreeing about a fact, not a preference. The rule that settles most cases on a release tracker:

   > An issue filed while reviewing an MR belongs to the milestone that MR ships in. If the code is already merged into the release branch in progress, use that release's milestone. Otherwise use the next one.

   Give the agents a `none` answer, with a reason required, so a poor fit is reported instead of forced into the nearest bucket.

4. **Spawn at most six agents in one message**, model `sonnet`, read-only. Each gets the milestones file, its own batch file, the decision rules, and the project's release notes or roadmap doc. Tell them to run at most a few targeted greps: they are classifying, not auditing. Require this output shape so you can parse it:
   ```
   #<iid> -> <milestone title>
   reason: <one sentence, max 25 words, naming the fact that decided it>
   ```

5. **Apply every write yourself.** Agents that update the tracker race each other and leave no single record of what moved.
   ```bash
   for i in 607 601 600; do glab issue update "$i" -m "v0.14.0"; done
   ```
   `-m` takes the milestone title, not its id. `-m ""` removes the milestone.

6. **Verify the queue is empty.** Re-run step 2. Done when `issues.md` is empty.

7. **Report.** Counts per milestone, plus any group of issues that describe one problem but landed in different milestones. That split is what the human needs to look at.

## Rules

- Assign only to milestones that already exist. A new milestone is a planning decision: suggest it, do not create it.
- Treat a batch that comes back unanimous as a reason to check the batching, not a result to apply unread. Batches cut by issue number group by filing date, and issues filed in one sitting often do share a milestone. Confirm the reasons differ before applying.
