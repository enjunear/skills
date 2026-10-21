# Conflict resolution (`--on-conflict=resolve`)

Reached from step 2 of the per-MR workflow when a rebase reports conflicts and
the policy is `resolve` (the default).
Resolve in a local worktree, push, clean up, then return to step 3 in `SKILL.md`.

1. Get source/target branches:
   ```bash
   glab mr view <id> -F json | jq -r '.source_branch, .target_branch'
   ```
2. Fetch, then check the MR out into a worktree on its own local branch.
   Fetch first: `glab mr checkout` skips its own fetch when the MR's head commit is already local,
   and without a fresh `origin/<source>` the lease push in step 5 is rejected as `stale info`.
   ```bash
   git fetch origin <source> <target>
   glab mr checkout <id> --branch merge-train-<id> --worktree .claude/worktrees/merge-train-<id>
   ```
3. Inside the worktree, rebase onto target:
   ```bash
   cd .claude/worktrees/merge-train-<id>
   git rebase origin/<target>
   ```
4. **Resolve conflicts using your tools.** Read each conflicted file, understand both sides,
   produce a merged result that preserves both intents.
   `git add <files>` then `git rebase --continue`.
   Loop until the rebase completes.
5. Push:
   ```bash
   git push --force-with-lease origin HEAD:<source>
   ```
6. **Always clean up the worktree and its local branch**, success or failure:
   ```bash
   cd <repo-root>
   git worktree remove --force .claude/worktrees/merge-train-<id>
   git branch -D merge-train-<id>
   ```
7. If conflicts are genuinely too complex (semantic merges across major refactors, you'd be guessing),
   `git rebase --abort`, clean up, mark `skipped` with a reason, and move on.
   Don't push something you can't justify.

**Don't bypass safety to make a conflict go away.**
Never `git push --force` (without `--with-lease`),
never silently drop commits, never `--allow-empty` past unresolved markers.
