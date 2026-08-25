---
name: implement-work-item
description: Implement a glab work-item that is ready-for-agent
---

Steps:
1. Run `glab issue list --per-page 100 --label ready-for-agent --output json | jq -c '.[] | select((.merge_requests_count // 0) == 0) | {iid, title}'`
2. For each issue listed, if there are less than ~10 issues, read the full issue description and comments: `glab issue view <iid> --comments`
3. Pick an issue to work on and claim it with `glab issue update <iid> --assignee @me` - see "Picking an Issue" below.
4. Create a worktree for the issue and checkout a branch from `origin/main`.
5. Run the /implement skill
6. Commit and submit an MR using /glab


## Picking an Issue

Good candidate issues are:
- An issue that is not blocked by pre-requisite issues.
- An issue that unblocks other issues.
- High priority/high value.
- Low effort.

Consider the order in which the issues were created, and think about which order the implementation would benefit.
Consider grouping a logical related batch of issues into one MR, making at least one commit per issue.
