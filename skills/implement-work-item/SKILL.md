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
   If glab reports `Branch already exists`, it still opens the MR on that branch.
   List what the branch holds beyond the base,
   taking `<branch>` and `<base>` from glab's `Creating draft merge request for <branch> into <base>` line:
   ```bash
   git fetch -q origin && git log --oneline origin/<base>..origin/<branch>
   ```
   No output means the branch is empty, so carry on.
   Any commits mean earlier work exists.
   Stop and report the branch and its commits, rather than building on them.

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

6. Write the MR description and send it to the MR.
   Draft it with the Skill tool and "mattpocock-skills:pr",
   into a file in the scratchpad.
   Change that file only with Write or Edit.
   ```bash
   glab mr update <mr> --description-file <file>
   ```
   This replaces the whole description.
   The file must carry a `Closes #<iid>` line for every issue the MR closes,
   including the one glab added in step 3.
   Check the description landed before step 7 marks the MR ready:
   ```bash
   glab mr view <mr> --output json --jq .description
   ```
   It should show every `Closes #<iid>` line.

7. Hand it over, retitle it, and set the reviewer.
   ```bash
   glab mr update <mr> --ready --title "<type>(<scope>): <summary>" \
     --unassign --reviewer <reviewer> --unlabel ready-for-agent
   ```
   Step 3 titled the MR `Resolve "<issue title>"`,
   and the squash commit carries the title onto `main`.
   Replace it with a conventional commit subject that describes the change, not the issue.
   For a single-issue MR, the closing commit's subject is usually the right title.
   For a batch, the title sums up the whole MR.
   Retitle only in this call.

   Find `<reviewer>` in this order, and stop at the first hit:
   1. The first of `.gitlab/CODEOWNERS`, `CODEOWNERS` or `docs/CODEOWNERS` that exists.
      Use the owners of the files the MR changes, from `git diff --name-only origin/<base>...HEAD`.
      Only individual usernames count, because `--reviewer` takes no groups or emails.
      If that leaves more than one person, ask the user as in item 3, offering them.
   2. A reviewer named in the project's `CLAUDE.md` or `AGENTS.md`.
   3. Otherwise, list who reviewed or merged recent MRs,
      then ask the user to pick a reviewer, offering those people as options.
      ```bash
      glab mr list --merged --per-page 20 --output json \
        | jq -r '.[] | (.reviewers[]?.username), (.merged_by.username // empty)' \
        | sort | uniq -c | sort -rn
      ```

   Never fall back to `@me` without asking.

   Once the handover call has run, check the title landed:
   ```bash
   glab mr view <mr> --output json --jq '.title, .draft'
   ```
   It should show the new title and `false`.

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

The MR description also carries a `Closes #<iid>` line for every issue in the batch, as step 6 says.
A squash merge can drop commit messages, so the description is what closes the issues.
The commit lines stay because they carry the time markers below.

Log time per issue, so the slices add up to the whole run with no overlap.
Each issue's slice goes in its closing commit,
as an `@<mins>m` marker on the `Closes #<iid>` line:
```
fix(parser): accept trailing commas

Closes #42 @18m
```
GitLab logs the time on the issue when you push the commit.
- The first issue's clock starts at the claim, so it carries the setup time.
- Each later issue's clock starts with `date +%s` right after the previous issue's closing commit.
- Each clock stops at its issue's closing commit.
  Round up to the next minute, as in step 8.
- A commit with a marker references only its own issue.
  GitLab applies the first amount to every issue a commit references.

The time after the last closing commit, spent on review and handover,
goes on the last issue as the step 8 note, timed from that commit.
Then check each issue's total with `glab issue view <iid> --output json --jq .time_stats.human_total_time_spent`.

Rebasing or amending a pushed commit gives it a new SHA, and GitLab may log its time again.
Don't rewrite pushed commits that carry a marker.
`merge-train` rebases MRs on the server, so a batch MR it rebases may show doubled times.
