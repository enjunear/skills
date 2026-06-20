# agents-skills

Personal Claude Code agents and skills, developed here and symlinked into
`~/.claude/` so they work in every project. Single source of truth, version
controlled.

## Install

```bash
./install.sh        # idempotent symlinks → ~/.claude/{agents,skills}
```

Then reload (`/reload-plugins` picks up agent + skill changes; a fresh session
also works). Symlinks are the existing convention here — most of
`~/.claude/skills/` is already symlinked.

## What's in here

### `/grill-team` — a debate panel for stress-testing an idea

The multi-agent sibling of `/grill-me`. You hand it an idea; four voices debate
it in rounds over a shared transcript and hone it into a better version, then you
get a refined idea (not a verdict — unless the debate clearly earned one).

| Agent | Label | Role | Effort | Tools |
|-------|-------|------|--------|-------|
| `blue-sky` | BS | Amplifies and extends the idea | `xhigh` | `Read` only (pure reasoning) |
| `devils-advocate` | DA | Attacks the current version of the idea | `xhigh` | `Read` only (pure reasoning) |
| `fact-checker` | FC | Grounds any checkable claim in fact | `high` | `WebSearch WebFetch Read Grep Glob` (read-only) |
| `venture-partner` | VC | Shapes it into a marketable, shippable product | `xhigh` | `Read` only (pure reasoning) |

Per-agent `effort` (reasoning depth) is set in each agent's frontmatter — biasing
the deepest thinking toward the voices whose reasoning is subtlest. It's
orthogonal to output length, so agents think hard and still answer in brief
bullets.

Each agent is **blind to the others** — its prompt names only its own role, never
the cast, so it can't pre-empt a seatmate ("the critic will surely object…") and
do their job for them. It reacts only to what's actually on the transcript.

**How a round works.** The debate loop is a **deterministic workflow**
(`skills/grill-team/debate.workflow.js`), not a model-driven loop. Each round, in
fixed order BS → DA → FC → VC, the workflow code pastes the context into a fresh
agent, takes the turn, and appends it. Venture-Partner goes last so it can fold
the round's divergence (BS), critique (DA), and grounded facts (FC) into the
sharpest buildable product. The skill
(`skills/grill-team/SKILL.md`) is a thin wrapper that does the bounded-idea
check, launches the workflow, and writes the result — it never runs the debate
itself.

**Why deterministic (code, not the model, drives the loop).** Two failure modes
showed up when the loop was model-driven: the orchestrator *led the witness*
(editorializing per-turn prompts — "the conclusion has formed…") and *stopped
early* (declaring "effectively converged" before a real unanimous-`NO_OUTPUT`
round). Both are control-flow decisions, so they belong in code. In the workflow
the per-turn prompt is a code-built string (idea + parking lot + transcript +
"Your turn." — nowhere to editorialize) and convergence is
`turns.every(t => t === 'NO_OUTPUT')` (an equality check, not a judgment). The
model only does the *thinking* — the four agents and the synthesis pass; code
owns the *control flow*. Trade-off:
workflows run in the background, so there's no per-round interjection — you watch
live via `/workflows` and steer via `resume` between runs.

**Why stateless one-shots.** The agents have no memory between turns — the
context pasted in *is* their memory. This is deliberate: it makes the debate
fully resumable (the transcript is the only state), and nobody accumulates
context rot or stubbornly defends a line just because it's "committed" to it.
([SendMessage] persistent agents were considered but don't compose with a
workflow — `agent()` calls are one-shot — and they die at the session boundary,
so resume would need the transcript anyway.)

**Keeping cost sane.** Turns are **brief and bulleted** — each agent makes one
decisive point per turn (one rebuttal + one new move), not an essay, and raises
points *across* rounds rather than dumping them. The brevity instruction lives in
the per-turn debate prompt (not the agent personas), so the agents stay reusable
standalone. Short turns keep the whole transcript small enough to paste into each
turn as-is — no summarizing needed. (An earlier rolling-summary scheme was
removed: it cut wall-time but a lossless summary ballooned, and the folding calls
cost more tokens than they saved.) A typical run lands around ~300k tokens at the
default 6-round cap.

**Timekeeper nudges.** The workflow injects a `<timekeeper>` note at the
one-third, two-third, and final rounds — gentle, content-neutral steers toward
consolidating on the strongest version (no round numbers, no verdict). They push
the panel to resolve rather than keep diverging as the clock runs down.

**Convergence.** Each agent emits exactly `NO_OUTPUT` when it's genuinely out of
contribution — the bar differs by role: **Blue-Sky** stands down when it has no
new *on-topic* extension (and stays tethered to the actual idea rather than
spinning up unrelated ventures); **Devil's-Advocate** critiques the idea *as it
currently stands* and stands down when that version has no serious flaw left to
name (its live objections answered or grounded, the rest parked); **Fact-Checker**
stands down only when every checkable claim on the record has been verified (it
checks *any* claim, not just the verdict-deciding ones, even confirming ones);
**Venture-Partner** stands down when the product shape (customer, wedge, path,
next step) is as sharp as the debate can make it. When a *full round* is
all-`NO_OUTPUT`, the debate has run dry → converged. Backstop: `max_rounds`
(default 6; override with `rounds=N`).

Convergence does fire: a real debate (dog-walking) converged at round 5 once
Devil's-Advocate was tuned from "find one more angle forever" to "critique the
current version, concede when it survives." A `max`-effort never-fold critic can
keep the panel from ever standing down — the softer disposition plus the parking
lot below is what lets it stop honestly.

Each agent emits exactly `NO_OUTPUT` — and *only* that bare token — when it
stands down; a paragraph that ends in `NO_OUTPUT` is a contribution, not a
stand-down (the workflow's equality check enforces this).

**The parking lot — the convergence lever.** Panels struggle to converge because
they keep re-raising points that can't be settled by *more argument* — only by
the owner gathering real-world data. So agents **park** such a pain point in a
`<PARK>` block at the end of a turn:

```
<PARK>
- whether enough demand exists on the owner's actual streets
- whether the $40 reliability line survives to month six
</PARK>
```

The workflow extracts + dedupes those into a `<parking-lot>` block shown at the
top of every later turn. The rule: don't re-raise anything parked, and *if all
you have left is parked or parking-lot-class, stand down*. That gives even the
skeptic an honest way to fall silent — and the lot becomes the synthesis's **Open
questions** (the things only the owner can answer), accumulated live.

**Two anti-rubber-stamp guarantees** (a panel that agrees because it was *told*
to agree is worse than no panel): (1) the per-turn prompt is **code-built** and
strictly neutral — there's no place to summarize state or hint the conclusion has
formed; (2) the skill's first step is a **bounded-idea check** — bounded ideas
converge into a verdict, unbounded ideation rides the cap, so the wrapper
proposes a bounded reframing before launching the workflow.

**Output.** A transcript lands in the **current project** at
`./.grill-team/<date>-<slug>.md`, ending in a synthesis whose deliverable is a
**refined idea** — the strongest, most marketable/implementable version the
debate produced — followed by **how to make it real** (customer · wedge ·
distribution · next step), a **drift trace** (how it moved from the pinned seed;
flags *subject drift* — became a different thing — vs. a mere verdict shift, and
whether the place it drifted to is a stronger idea worth knowing), surviving
extensions · live risks · grounded facts · open questions, and a **verdict only
if the debate clearly earned one** (toast / ready — never forced). Commit it like
an ADR if it's worth keeping.

#### Usage

```
/grill-team <your idea>
/grill-team resume latest                      # more rounds (only helps after a cap exit)
/grill-team resume latest steer: <constraint>  # revive a converged debate with new input
/grill-team <idea> rounds=6                     # override the round cap
```

## Layout

```
agents/   blue-sky.md  devils-advocate.md  fact-checker.md  venture-partner.md
skills/   grill-team/
            SKILL.md             # thin wrapper: bounded check → launch workflow → persist
            debate.workflow.js   # the deterministic debate loop + synthesis
install.sh
```

[SendMessage]: requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`; not relied on.

## License

MIT — see [LICENSE](LICENSE).
