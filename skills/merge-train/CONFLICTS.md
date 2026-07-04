# Conflict resolution (`--on-conflict=resolve`)

Reached from step 2 of the per-MR workflow when a rebase reports conflicts and
the policy is `resolve` (the default). Resolve in a local worktree, push, clean
up, then return to step 3 in `SKILL.md`.

1. Get source/target branches:
   ```bash
   glab mr view <id> -F json | jq -r '.source_branch, .target_branch'
   ```
2. Fetch and create worktree:
   ```bash
   git fetch origin <source> <target>
   mkdir -p .merge-train-worktrees
   git worktree add .merge-train-worktrees/mr-<id> origin/<source>
   ```
3. Inside the worktree, rebase onto target:
   ```bash
   cd .merge-train-worktrees/mr-<id>
   git rebase origin/<target>
   ```
4. **Resolve conflicts using your tools.** Read each conflicted file, understand
   both sides, produce a merged result that preserves both intents.
   `git add <files>` then `git rebase --continue`. Loop until the rebase completes.
5. Push:
   ```bash
   git push --force-with-lease origin <source>
   ```
6. **Always clean up the worktree**, success or failure:
   ```bash
   cd <repo-root>
   git worktree remove --force .merge-train-worktrees/mr-<id>
   ```
7. If conflicts are genuinely too complex (semantic merges across major
   refactors, you'd be guessing), `git rebase --abort`, clean up, mark `skipped`
   with a reason, and move on. Don't push something you can't justify.

**Don't bypass safety to make a conflict go away.** Never `git push --force`
(without `--with-lease`), never silently drop commits, never `--allow-empty`
past unresolved markers.
