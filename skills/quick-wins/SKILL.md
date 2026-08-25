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

2. **Pick a cluster** — one issue, or a small set that share an area/file/concern and can each be fixed quickly. Prefer issues that:
   - Touch the same files or feature area
   - Have clear acceptance criteria
   - Don't need design discussion

3. **Read each issue fully** — for every candidate:
   ```bash
   glab issue view <iid> --comments
   ```
   Don't skim. Comments often contain the actual fix direction or constraints.

4. **Work in the main worktree** (not `.worktree/`). The whole point is to move fast on small stuff.

5. **Branch + MR strategy:**

   **Single issue** → use the standard project workflow: let `glab mr create` create the branch from the issue. Don't `git checkout -b` first.
   ```bash
   glab mr create --no-editor --draft \
     --related-issue <id> \
     --fill \
     --copy-issue-labels \
     --create-source-branch \
     --remove-source-branch \
     --target-branch main \
     --reviewer @me \
     --yes
   ```

   **Cluster (≥2 issues)** → create the branch yourself first, name it descriptively (e.g. `fix/dashboard-and-members-polish-211-213`), make **at least one commit per issue** (each commit referencing its issue with `Closes #N` or `Fixes #N`), push, then open one MR targeting `main` that lists all the issues in the description.

6. **Per-issue commit discipline (cluster mode):** never bundle multiple issues into a single commit. The commit log should let a reviewer map each issue → each diff.

7. **Wrap up** per the project workflow: mark MR ready, leave a summary note on each issue, then notify the user. (The `Closes #N` reference closes the issue on merge.)

## Boundaries

- Stop and ask if the chosen cluster turns out to need design decisions or touches unrelated areas — don't expand scope mid-flight.
- Don't pick issues labeled with anything blocking (e.g. needs-design, blocked) without checking with the user.
- One MR per invocation. If two clusters emerge, ship one and ask before starting the second.
