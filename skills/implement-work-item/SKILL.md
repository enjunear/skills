---
name: implement-work-item
description: Implement a given glab work-item, or a small batch of related ones, through to a ready MR
---

Steps:
1. Fetch the details for the issue prescribed, if not already in context
   ```bash
   glab issue view <iid> --comments
   ```

2. Claim it by assigning it to yourself with `glab issue update <iid> --assignee @me`.

   Then run `date +%s` and keep the number.
   It starts the clock for the time you log in step 8.

3. Open a draft MR from the issue.
   GitLab creates the branch.
   ```bash
   glab mr create --related-issue <iid> --draft --copy-issue-labels \
     --remove-source-branch --assignee @me --fill --no-editor --yes
   ```
   Assign the MR to the same milestone as the issue.

4. Check the MR out into a worktree,
   then switch into it with `EnterWorktree` and that `path`.
   ```bash
   glab mr checkout <mr> --worktree .claude/worktrees/mr-<mr>
   ```

5. Implement the work described by the issue.

   Call the Skill tool with "mattpocock-skills:tdd" where possible, at pre-agreed seams.

   Run typechecking regularly, single test files regularly, and the full test suite once at the end.

   Once done, call the Skill tool with "mattpocock-skills:code-review" to review the work.

   Commit and push from the worktree.

6. Update the MR description using the Skill tool with "mattpocock-skills:pr".

7. Hand it over and set the reviewer.
   ```bash
   glab mr update <mr> --ready --unassign --reviewer @me --unlabel ready-for-agent
   ```

8. Log the time spent on the issue.
   Time spent is agent wall-clock time from the claim in step 2 to now,
   rounded up to the next minute.
   Post it as a `/spend` quick action, under a summary line that GitLab keeps as the time entry's summary.
   ```bash
   mins=$(( ($(date +%s) - <start> + 59) / 60 ))
   glab issue note <iid> -m "Implemented in <MR URL>
   /spend ${mins}m"
   glab issue view <iid> --output json --jq .time_stats.human_total_time_spent
   ```
   The total should have grown by `mins`.

9. Leave the worktree with `ExitWorktree` and remove the worktree.

## Batches

If implementing a batch of related issues into one MR:
- Claim every issue in the batch.
- Open the MR from the first issue,
- make at least one commit per issue, and never bundle issues into one commit,
- and add a `Closes #<iid>` line to the commit message for each commit that closes an issue.

Log time per issue, so the slices add up to the whole run with no overlap.
Run `date +%s` again as you start each issue after the first.
Each issue's time runs from its start to the next issue's start.
The first issue's clock starts at the claim, so it carries the setup time.
The last issue's clock runs to the handover, so it carries the review and handover time.
