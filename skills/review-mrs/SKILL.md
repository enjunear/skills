---
name: review-mrs
description: Review a batch of open GitLab MRs one at a time, then post a recommendation on each — approve, request changes, or reject. Fix small nits in a follow-up commit first, then recommend approval and say what changed.
---

# review-mrs — Review open MRs and recommend a verdict

Review GitLab MRs one at a time. Each MR gets a **verdict** that becomes a **posted recommendation** — never a binding approval. The skill does the review legwork and recommends; a human casts the actual approve/merge vote.

- **pass** — clean, no findings → recommend **approve**.
- **patch** — findings are *only* **nits** → fix the nits in a follow-up commit, then recommend **approve**, listing what you changed.
- **block** — one or more **blockers** → recommend **request changes** (the goal is sound but needs work) or **reject** (the change shouldn't land as-is). Post the findings; don't fix.

The whole skill turns on classifying the verdict right, then posting the matching recommendation.

## When to invoke

User types `/review-mrs [args]` or asks to "review the open MRs", "go through the MRs and recommend approvals", etc.

## Selecting MRs

Same idiom as `merge-train`:

| Arg | Meaning |
|---|---|
| `MR_ID...` (positional) | Review exactly these MRs |
| `--label LABEL` / `--target-branch BRANCH` / `--assignee USER` | Filter the auto-fetched list |
| `--dry-run` | Review and report the verdict, but don't post, comment, or push |
| `--yes` / `-y` | Skip the confirmation prompt |

With no positional IDs, fetch open MRs (oldest first) and narrow with any filter flags:

```bash
glab mr list -F json [--label X] [--target-branch Y] [--assignee Z] \
  | jq -r 'sort_by(.created_at) | .[].iid'
```

Skip drafts and any explicitly-passed ID that's already `merged`/`closed` (`glab mr view <id> -F json | jq '{state, draft}'`) — a draft is work-in-progress, not a review request. The auto-fetched list is open-only, so this mainly guards IDs you were handed; log which you skipped. List the MRs about to be reviewed and, unless `--yes`/`--dry-run`, ask "review these? [y/N]".

## Per-MR loop

Review each MR independently, in order. One MR's verdict never affects another's.

**First, isolate the MR in its own worktree.** Never review or patch in the primary checkout — it may hold the user's own work, and a batch would leave them stranded on the last MR's branch. Put each MR in a throwaway worktree off the remote source branch (the isolation idiom `merge-train` uses) and do all of the MR's work inside it:

```bash
# <source> = the MR's source_branch, from `glab mr view <id> -F json | jq -r '.source_branch'`
git fetch origin <source>
git worktree add .worktree/review-mr-<id> origin/<source>
```

`--dry-run` skips this — there's nothing to write, so review from the diff alone.

### 1. Review

Dispatch the **code-reviewer** agent on the MR, one agent per MR. Give it the MR number, its diff (`glab mr diff <id>`), the MR description (for intent), and the worktree path (`.worktree/review-mr-<id>`) so it can read the changed files in full context — let the agent decide how deep it needs to go. It returns its findings — this is where the real legwork happens, isolated per MR.

Have it return, for each finding: a one-line description, the `file:line`, and its own blocker-vs-nit call. You make the final classification in step 2 — the agent advises, you decide.

### 2. Classify — the verdict

Sort every finding into exactly one bucket. The line between them is the one thing that must be predictable run to run:

- **blocker** — anything that makes the change wrong, unsafe, or not-yet-mergeable, *or* anything whose fix needs a judgement call the author should make. Correctness bugs, security holes, missing or broken tests, spec/convention violations with real consequences, unclear design, a question you can't answer yourself. **If fixing it requires a decision, it is a blocker, not a nit** — this tie-break is what stops you silently rewriting someone's MR.
- **nit** — a trivial, mechanical, uncontroversial fix you can make in seconds without changing the author's intent: a typo, a name, a missing import, a lint violation, a redundant line, a stale comment.

Then the verdict follows mechanically:

- **any blocker present → block.** Even if there are also nits. Don't fix, don't recommend approval.
- **findings are all nits → patch.**
- **no findings → pass.**

### 3. Act — post the recommendation

Every verdict ends in a **posted comment** stating a recommendation. **Never `glab mr approve`** — the skill recommends, a human approves. Post recommendation comments with `glab mr note create <id>` (pipe the body from stdin — the glab skill's preferred pattern for Markdown bodies).

**pass → recommend approve.** Post a note:

```bash
glab mr note create <id> << 'EOF'
**Review recommendation: ✅ Approve**

Reviewed the diff — no findings. LGTM.
EOF
```

**patch → fix the nits, then recommend approve.** Work in the MR's worktree (from the top of the loop); make only the listed nit fixes, one commit, and push the source branch:

```bash
cd .worktree/review-mr-<id>
# ...apply the nit fixes...
git commit -am "chore: address review nits"
git push origin HEAD:<source>
```

Then post a note recommending approval that **lists exactly what you changed**, so the author and the human approver see it in one place:

```bash
glab mr note create <id> << 'EOF'
**Review recommendation: ✅ Approve** (after nit fixes)

Pushed a follow-up commit addressing the nits I found:
- `foo.py:42` — fixed typo in error message
- `bar.py:7` — removed unused import

No blockers. Recommending approval once the follow-up commit's pipeline is green.
EOF
```

Rules while fixing nits:
- Only the nits from step 2 — nothing else. Every changed line traces to a listed nit.
- Never `--no-verify`. If hooks fail, fix the cause; if it's pre-existing legacy noise, ask before bypassing.

**block → recommend request changes or reject.** Post one comment listing every finding (blockers and any nits), each with its `file:line`, so the author has the full picture in one place. Choose the recommendation:

- **request changes** — the MR's intent is sound; it just needs fixes before it can land. This is the common case.
- **reject** — the change shouldn't land in this form at all: wrong approach, out of scope, superseded, or unnecessary. Rarer — use it only when "fix and re-review" isn't the right path, and say why.

```bash
glab mr note create <id> << 'EOF'
**Review recommendation: 🔴 Request changes**

Blockers:
- `foo.py:88` — off-by-one in the retry loop; drops the last record.
- `foo.py:120` — no test covers the timeout path.

Nits (not blocking):
- `bar.py:3` — stale comment.
EOF
```

Don't approve, don't fix.

### 4. Clean up the worktree

Once you're done with the MR — pass, patch, or block alike — remove its worktree:

```bash
git worktree remove --force .worktree/review-mr-<id>
```

Do this even on interrupt or failure, so no `.worktree/review-mr-*` entries are left behind. Only remove the worktree(s) you created — never the whole `.worktree/` directory.

## Output

One line per MR as you go (`!123 → pass, recommended approve` / `!124 → patch, 2 nits fixed, recommended approve` / `!125 → block, recommended request changes`). End with a summary table:

```
MR     Verdict   Recommendation      Action
---    -------   --------------      ------
!123   pass      approve             comment posted
!124   patch     approve             2 nits fixed + comment posted
!125   block     request changes     comment posted (3 blockers)
!126   block     reject              comment posted (wrong approach)
```

## Behaviour rules

- **Recommend, never approve.** The skill posts a recommendation comment; it does not run `glab mr approve` or merge. A human casts the binding vote.
- **When in doubt, block.** A blocker wrongly called a nit gets silently patched into someone's branch; a nit wrongly called a blocker just becomes a comment. The costs aren't symmetric — err toward block.
- **request changes vs reject.** Default to request changes when the MR's goal is right. Reserve reject for changes that shouldn't proceed as-is, and explain why.
- **Only the MRs in the list.** Don't review or touch MRs you weren't asked about.
- **Isolate every MR in a worktree, never the primary checkout.** Always clean up the worktree you created for that MR (`git worktree remove --force .worktree/review-mr-<id>`), including on interrupt or failure — never delete the whole `.worktree/` directory, since other worktrees (yours or another skill's) may still be in use. Add `.worktree/` to `.gitignore` if it isn't already (mention this once if you create it).
- **`--dry-run`** = review from the diff and report verdicts/recommendations only; no worktree, no `note`, no push.
- Prefer native `glab` subcommands over raw `glab api`. Use `glab mr note create` (not the deprecated `glab mr note -m`).
