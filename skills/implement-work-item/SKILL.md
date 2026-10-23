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

8. Leave the worktree with `ExitWorktree` and remove the worktree.

## Batches

If implementing a batch of related issues into one MR:
- Claim every issue in the batch.
- Open the MR from the first issue,
- make at least one commit per issue, and never bundle issues into one commit,
- and add a `Closes #<iid>` line to the commit message for each commit that closes an issue.
