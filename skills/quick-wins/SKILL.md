---
name: quick-wins
description: >
  Pick a cluster of easily-fixable open GitLab issues, then implement and ship them.
  Use when the user says "quick wins", "knock out some issues", "find easy fixes",
  "/quick-wins", or otherwise asks to triage and tackle a batch of small open issues.
---

Goal: clear a small batch of easy open issues from the project issue tracker in one shipping cycle.
Prefer `glab` instructions from the /glab skill over these.

## Workflow

1. **List candidates**
   ```bash
   glab issue list
   ```

2. **Pick a cluster** — one issue,
   or a small set that share an area/file/concern and can each be fixed quickly.
   Prefer issues that:
   - Touch the same files or feature area
   - Have clear acceptance criteria
   - Don't need design discussion

3. **Read each issue fully** — for every candidate:
   ```bash
   glab issue view <iid> --comments
   ```
   Comments often contain the actual fix direction or constraints.

4. **Claim the issues.**
   Assign each issue in the cluster that has no assignee to yourself:
   ```bash
   glab issue update <iid> --assignee @me
   ```

5. **Open one draft MR from the first issue.**
   Let `glab mr create` create the branch from the issue.
   ```bash
   glab mr create --related-issue <iid> --create-source-branch --draft --copy-issue-labels \
     --remove-source-branch --assignee @me --fill --no-editor --yes
   ```
   **Cluster (≥2 issues)** → add a `Closes #<iid>` line to the commit message of the commit that closes each of the other issues.

6. **Work in a worktree.**
   Check the MR:
   ```bash
   glab mr checkout <mr> --worktree .claude/worktrees/mr-<mr>
   ```
   then switch into it with `EnterWorktree` and that `path`.
   
7. **Implement.**
   Implement the work described by the issue.

   Call the Skill tool with "mattpocock-skills:tdd" where possible, at pre-agreed seams.

   Run typechecking regularly, single test files regularly, and the full test suite once at the end.

   Once done, call the Skill tool with "mattpocock-skills:code-review" to review the work.

   Commit and push from there.

   **Per-issue commit discipline (cluster mode):** make at least one commit per issue,
   and never bundle multiple issues into a single commit.
   The commit log should let a reviewer map each issue → each diff.

8. **Wrap up.**
   Leave a summary note on each issue,
   then hand the MR over and notify the user:
   ```bash
   glab mr update <mr> --ready --unassign --reviewer enjunear --unlabel ready-for-agent
   ```
   Leave the worktree with `ExitWorktree` and `action: "keep"`.
   The worktree stays on disk.
   Once the MR merges,
   `git worktree remove .claude/worktrees/mr-<mr>`.
   The `Closes #N` references close the issues on merge.

## Boundaries

- Stop and ask if the chosen cluster turns out to need design decisions or touches unrelated areas —
  don't expand scope mid-flight.
- Don't pick issues labeled with anything blocking (e.g. needs-design, blocked) without checking with the user.
- One MR per invocation.
  If two clusters emerge,
  ship one and ask before starting the second.
