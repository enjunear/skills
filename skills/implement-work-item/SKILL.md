---
name: implement-work-item
description: Implement a glab work-item that is ready-for-agent
---

Steps:
1. Run `glab issue list --per-page 100 --label ready-for-agent --output json | jq -c '.[] | select((.merge_requests_count // 0) == 0) | {iid, title}'`
2. For each issue listed,
   if there are less than ~10 issues, read the full issue description and comments: `glab issue view <iid> --comments`
3. Pick an issue to work on - see "Picking an Issue" below.
   If it has no assignee,
   claim it by assigning it to yourself with `glab issue update <iid> --assignee @me`.
4. Open a draft MR from the issue.
   GitLab creates the branch.
   ```bash
   glab mr create --related-issue <iid> --create-source-branch --draft --copy-issue-labels \
     --remove-source-branch --assignee @me --fill --no-editor --yes
   ```
5. Check the MR out into a worktree,
   then switch into it with `EnterWorktree` and that `path`.
   ```bash
   glab mr checkout <mr> --worktree .claude/worktrees/mr-<mr>
   ```
6. Implement the work described by the issue.

   Call the Skill tool with "mattpocock-skills:tdd" where possible, at pre-agreed seams.

   Run typechecking regularly, single test files regularly, and the full test suite once at the end.

   Once done, call the Skill tool with "mattpocock-skills:code-review" to review the work.

   Commit and push from the worktree.
7. Hand it over in one call.
   Set the reviewer here.
   ```bash
   glab mr update <mr> --ready --unassign --reviewer @me --unlabel ready-for-agent
   ```
8. Leave the worktree with `ExitWorktree` and `action: "keep"`.
   The worktree stays on disk.
9. Once the MR merges, `git worktree remove .claude/worktrees/mr-<mr>`.


## Picking an Issue

Good candidate issues are:
- An issue that is not blocked by pre-requisite issues.
- An issue that unblocks other issues.
- High priority/high value.
- Low effort.

Consider the order in which the issues were created,
and think about which order the implementation would benefit.
Consider grouping a logically related batch of issues into one MR.
Open the MR from the first issue, make at least one commit per issue,
and add a `Closes #<iid>` line to the commit message for each commit that closes an issue.
