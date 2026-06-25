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

Each agent starts **blind to the others** — its brief names only its own role,
never the cast, so it can't pre-empt a seatmate ("the critic will surely
object…") and do their job for them. It reacts only to what's actually on the
transcript. (Blindness is a *starting* condition: over the rounds agents infer
roles from the relayed turns, which is fine — the value is only in not handing
them the cast list up front.)

**How a round works.** The panel are four **persistent background agents** that
hold their own context for the whole debate, wired through the skill
(`skills/grill-team/SKILL.md`) over [SendMessage]. The skill spawns the four on
standby, then each round — in fixed order BS → DA → FC → VC — hands each agent
its turn by relaying only the *new* turns since it last spoke, and appends the
reply to the master transcript. Venture-Partner goes last so it can fold the
round's divergence (BS), critique (DA), and grounded facts (FC) into the sharpest
buildable product.

**Why a relay, not a free-for-all.** The agents never talk to each other directly
— every turn flows through the skill as the hub. That keeps turns serialized
(one at a time, fixed order), the transcript clean and ordered, and convergence
detectable; a peer-to-peer mesh would be racier and risk an N² message storm. The
moderator is a **dumb pipe with a clock**: it relays each turn *verbatim*, never
summarizing, softening, or editorializing — the two failure modes that killed an
earlier model-driven version were *leading the witness* (editorialized per-turn
prompts — "the conclusion has formed…") and *stopping early* (calling "converged"
before a real unanimous-`NO_OUTPUT` round). The fix isn't to take the model out of
the loop; it's to bar it from authoring debate content. The only text the
moderator writes into the channel is the fixed standing brief and the
content-neutral timekeeper nudges, and convergence is a mechanical check (a full
round of bare `NO_OUTPUT`), not a judgment call.

**Why persistent agents.** Each agent *remembers* the conversation and develops
its line across rounds, instead of re-reading a flat transcript cold every turn.
That buys a longer, cheaper, richer debate: an agent receives only what's new
since it last spoke (its prior context is cached), rather than the whole
transcript re-pasted into a fresh one-shot each turn. The cost is that persistent
agents don't survive a session boundary — so the **transcript is the only durable
state**, and `resume` rebuilds the panel from it (see below). Blindness is only a
*starting* condition here: agents aren't told who their co-panelists are, but they
infer roles from the relayed turns over time, which is fine — the
no-pre-emption value only matters before the debate has any content.

**Keeping cost sane.** Turns are **brief and bulleted** — each agent makes one
decisive point per turn (one rebuttal + one new move), not an essay, and raises
points *across* rounds rather than dumping them. The brevity instruction lives in
the standing brief (not the agent personas), so the agents stay reusable
standalone. On top of that, persistent agents only receive the *delta* since their
last turn — not the whole transcript re-pasted — and their prior context is
cached, which is where most of the savings come from versus a fresh one-shot per
turn. The round cap defaults to **8** (override with `rounds=N`).

**Timekeeper nudges.** The moderator injects a `<timekeeper>` note at the
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
(default 8; override with `rounds=N`).

Convergence does fire: a real debate (dog-walking) converged at round 5 once
Devil's-Advocate was tuned from "find one more angle forever" to "critique the
current version, concede when it survives." A `max`-effort never-fold critic can
keep the panel from ever standing down — the softer disposition plus the parking
lot below is what lets it stop honestly.

Each agent emits exactly `NO_OUTPUT` — and *only* that bare token — when it
stands down; a paragraph that ends in `NO_OUTPUT` is a contribution, not a
stand-down (the moderator's bare-token equality check enforces this).

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

Because the agents are persistent and every turn is relayed to everyone, parked
points flow through the conversation naturally — the rule is: don't re-raise
anything parked, and *if all you have left is parked or parking-lot-class, stand
down*. That gives even the skeptic an honest way to fall silent — and at
synthesis the moderator harvests every `<PARK>` bullet into the **Open questions**
section (the things only the owner can answer).

**Two anti-rubber-stamp guarantees** (a panel that agrees because it was *told*
to agree is worse than no panel): (1) the moderator only ever authors the fixed
standing brief and content-neutral timekeeper nudges into the channel — it relays
every turn verbatim and has no place to summarize state or hint the conclusion has
formed; (2) the skill's first step is a **bounded-idea check** — bounded ideas
converge into a verdict, unbounded ideation rides the cap, so the wrapper
proposes a bounded reframing before spawning the panel.

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
            SKILL.md             # spawn panel → relay rounds → converge → synthesize → persist
install.sh
```

[SendMessage]: the skill spawns background agents and hands them turns via
`SendMessage` — verified working in Claude Code 2.1.191 with no special flag set
(spawn, agent→`main` reply, and directed resume by `agentId` all round-trip).
Earlier builds may have gated this behind `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`.
If the capability is unavailable, grill-team says so and stops rather than quietly
running the debate in a single voice.

## License

MIT — see [LICENSE](LICENSE).
