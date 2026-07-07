---
name: issue
description: Capture a bug, feature, or enhancement as a well-scoped GitLab or GitHub issue. Use when the user types `/issue`, wants to file/open an issue, bug, ticket, or feature request, or turn a description into a tracked issue. Grounds the issue in the project's docs and code, asks a few clarifying questions (or defers to a grill session), and labels it ready-for-agent when the scope is tight enough to implement.
argument-hint: <bug | feature | enhancement description>
---

# issue — capture work as a scoped issue

Turn a one-line description into a tracked issue. Every issue lands at one of two **readiness** levels:

- **capture** — recorded so it isn't lost, but a human still has to design it. Missing acceptance criteria, an open approach, or unresolved questions.
- **ready** — scoped tightly enough that an agent could pick it up and implement it unattended: the problem, the intended change, and checkable acceptance criteria are all pinned down. This earns the `ready-for-agent` label.

A **spike / research / question** issue clears a *different* bar: its acceptance criteria are decisions to reach ("we've answered X, decided Y"), not a change to merge. It's **ready** when the question and what would count as an answer are pinned — not when an implementation is specified. Only apply `ready-for-agent` to one if the project treats investigation as agent work; otherwise leave it at capture.

The whole skill drives toward the readiness bar. The clarifying questions exist to push an issue over it. When that push needs more than a few questions, you **defer** to a grill session instead of asking them yourself. The final label is the observable mark of whether the bar was cleared.

## 1. Classify and pick the tracker

Read the description and classify it. The common cases are **bug**, **feature**, **enhancement**, and **chore** (deps, tooling, CI, cleanup) — but the list is open: map to whatever type label the project actually uses. This drives the type label later.

One case is not implementation work: a **spike / research / question** issue asks you to *investigate and decide*, not to make a change. It clears a different bar (see below) — flag it now, because it changes what `ready` means for it.

Pick the tracker from the remote, don't guess:

```bash
git remote -v   # gitlab.* → glab · github.* → gh
```

If the host is ambiguous, both are present, or neither `glab`/`gh` is authenticated, **ask which to use**. Everything below shows `glab` first, `gh` second. For `glab` command mechanics (heredoc bodies, `note` quirks), lean on the `glab` skill rather than restating them.

## 2. Ground the issue in docs and code

Before asking the user anything, do the legwork yourself. Read the project's reference docs (README, CONTRIBUTING, `docs/`, `CLAUDE.md`) and the code the issue touches. A bug report names the function and the current wrong behaviour; a feature names where it would slot in and what it would sit next to.

**Completion criterion:** your draft cites concrete specifics — `file:line`, symbol names, the actual current behaviour — not a paraphrase of the user's sentence. If you can't point at anything in the repo, you haven't gathered enough yet.

## 3. Sharpen the scope

Now close the gap between what you know and the readiness bar. Judge the scope:

- **Small** — a handful of unknowns stand between the draft and `ready`. Ask **2–3 clarifying questions, one at a time** (asking a batch at once is bewildering). Ask only what genuinely resolves *what the issue is* — not a full design interview. Offer your recommended answer with each question.
- **Large** — a feature or architectural change where readiness needs a real design pass, not a few answers. **Offer to defer** the questioning to a grill session instead of asking inline:
  - `/grill-me` — stress-test the plan when it needs sharpening but introduces no new docs.
  - `/grill-with-docs` — when the issue introduces domain concepts or architectural decisions worth capturing as ADRs and glossary entries.

  If the user accepts, run that skill, then resume here with the sharpened scope. If they decline, capture the issue at the **capture** level with the open questions written into the body — don't invent answers.

## 4. Labels — read first, invent only if empty

Use only labels that already exist. Read them:

```bash
glab label list          # gh label list
```

Map your work onto existing labels: a type label (`bug` / `enhancement` / `feature` / `chore`, or the project's closest equivalent) plus any scope/area label that fits. **If the project has no labels at all**, propose a small suitable set to the user and create them only once they agree.

**Readiness label.** If the issue cleared the bar in step 3 — problem, intended change, and checkable acceptance criteria all pinned — add the project's ready-for-agent label. Use an existing label matching that intent (`ready-for-agent`, `agent-ready`, `good-first-issue`, whatever the project uses); if none exists, propose adding `ready-for-agent` before applying it. An issue left at **capture** does not get this label.

## 5. Create the issue

Write the body to a file, then create. Structure the body so a stranger could act on it:

```markdown
## Context
Where this lives and why it matters — with the `file:line` and behaviour from step 2.

## Problem / Goal
The bug, or the outcome the feature/enhancement should produce.

## Proposed approach
The intended change, if known. Omit for a pure capture.

## Acceptance criteria
- [ ] Checkable conditions that define done. Their presence is what makes an issue `ready`.
```

```bash
# GitLab
glab issue create --title "fix: …" --description "$(cat body.md)" --label "bug,ready-for-agent"

# GitHub
gh issue create --title "fix: …" --body-file body.md --label "bug,ready-for-agent"
```

Report the created issue URL and its readiness level. If it landed at **capture**, say what's still open and which grill session would close it.

## Behaviour rules

- **Only existing labels.** Never invent a label on a project that has some; propose new ones only when the project has none, and create them only with the user's OK.
- **A few questions, then stop.** 2–3 inline questions max. If it needs more, that's the signal to defer to a grill session, not to keep asking.
- **Don't fake readiness.** No acceptance criteria, or open design questions → it's a **capture**, without the ready-for-agent label. The label must mean an agent can actually run with it.
- **Recommend the tracker only when it's genuinely ambiguous** — otherwise the remote decides.
