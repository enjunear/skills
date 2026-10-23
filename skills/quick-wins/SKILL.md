---
name: quick-wins
description: >
  Pick a cluster of easily-fixable open GitLab issues, then implement and ship them.
  Use when the user says "quick wins", "knock out some issues", "find easy fixes",
  "/quick-wins", or otherwise asks to triage and tackle a batch of small open issues.
---

Goal: clear a small batch of easy open issues from the project issue tracker in one shipping cycle.

## Workflow

1. **List candidates**
   ```bash
   glab issue list
   ```
   Use `--output json --jq` to fetch the required details.

2. **Pick a cluster** — one issue,
   or a small set that share an area/file/concern and can each be fixed quickly.
   Prefer issues that:
   - Touch the same files or feature area
   - Have clear acceptance criteria
   - Don't need design discussion
   - Aren't blocked by other issues, or unblock others
   - Are high value and low effort

   Order the cluster by creation date,
   unless the implementation suggests a better order.

3. **Read each issue fully** — for every candidate:
   ```bash
   glab issue view <iid> --comments
   ```
   Comments often contain the actual fix direction or constraints.

4. **Implement.**
   Call the Skill tool with "implement-work-item",
   passing the cluster's issue numbers in the order to implement them.

5. **Wrap up.**
   Leave a summary note on each issue, then notify the user.
   The `Closes #N` references close the issues on merge.

## Boundaries

- Stop and ask if the chosen cluster turns out to need design decisions or touches unrelated areas —
  don't expand scope mid-flight.
- Don't pick issues labeled with anything blocking (e.g. needs-design, blocked) without checking with the user.
- One MR per invocation.
  If two clusters emerge,
  ship one and ask before starting the second.
