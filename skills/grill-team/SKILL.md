---
name: grill-team
description: Stress-test an idea with a four-voice debate panel — Blue-Sky amplifies it, Devil's-Advocate attacks it, Fact-Checker grounds it in fact, Venture-Partner shapes it into a marketable product. They debate in rounds over a live SendMessage channel until they converge, then you get a refined version of the idea. Use when the user wants an idea pressure-tested, expanded and challenged at once, sharpened into something buildable, or says "grill-team" / "run the panel" / "debate this idea".
argument-hint: <idea to stress-test>  |  resume [latest|<transcript-path>] [steer: <new constraint>]
---

# grill-team — the live debate panel

A four-voice debate that pressure-tests an idea and hones it into a better version:

- **`blue-sky`** (label `BS`) — amplifies and extends it.
- **`devils-advocate`** (label `DA`) — attacks the strongest version.
- **`fact-checker`** (label `FC`) — grounds claims in fact (the only one with research tools).
- **`venture-partner`** (label `VC`) — shapes it into a marketable, shippable product.

The panel are **persistent background agents** that hold their own context across the whole debate. You spawn them once, then hand each its turn over `SendMessage` — so each agent *remembers* the conversation and develops its line over rounds, instead of re-reading a flat transcript cold every turn. That's what buys a longer, cheaper, richer debate: agents receive only what's *new* since they last spoke (their prior context is cached), not the whole transcript re-pasted each turn.

The arguments: **$ARGUMENTS**

---

## Your role: relay + timekeeper + scribe — NEVER a participant

You are the hub. Every turn flows through you, but you are a **dumb pipe with a clock**:

- **Relay verbatim.** You copy an agent's reply into the transcript exactly as written, and you hand the next agent only the new turns since it last spoke. You **never** summarize a turn, editorialize it, soften it, add your own view, or hint where the debate "should" land. If you catch yourself paraphrasing an agent or nudging the conclusion, stop — that is leading the witness, and it is the one thing this skill exists to prevent.
- **Timekeep.** You inject the fixed, content-neutral `<timekeeper>` nudges at the one-third / two-third / final rounds (verbatim text below) — nothing else.
- **Scribe.** You keep the master transcript and write the result.

The judgment that *is* yours: the **bounded-idea gate** (Step 1) and the **resume** decisions. Nothing about the debate's content.

> **Needs background agents + `SendMessage`.** Verified working in Claude Code 2.1.191 with no special flag set. If `SendMessage` or background spawning is unavailable in your build, say so and stop — don't silently fall back to running the debate yourself in one voice.

---

## Step 0 — Mode

- Arguments begin with `resume` (or `continue`) → **RESUME mode** (jump to "Resuming").
- Otherwise → **NEW mode**.

Parse optional `rounds=N` (round cap; default **8**) and, in resume, `steer: <text>`.

---

## NEW mode

### Step 1 — Bounded-idea check (do this FIRST, before spawning anything)

Judge whether the seed is a **bounded question** (a specific decision, design, claim, or plan with a reachable answer — "should we do X?", "is this architecture sound?", "will this model work?") or an **unbounded prompt** (open-ended ideation — "what could we build around X?", "ideas for Y").

- **Bounded** → proceed to Step 2.
- **Unbounded** → **do not spawn the panel.** Tell the user it's open-ended (the panel will mutate forever and ride the cap instead of converging), propose one or two bounded reframings, and ask them to pick or refine. Only proceed once the idea has a reachable bottom.

This is the one genuine judgment call about *whether to debate* — it's a gate, not part of the loop.

### Step 2 — Spawn the panel (four standing agents, on standby)

`date +%Y-%m-%d` in bash; make a short kebab-case slug (≤ 6 words) from the idea.

Spawn all four with `Agent`, `run_in_background: true`, `subagent_type` set to the role name (`blue-sky`, `devils-advocate`, `fact-checker`, `venture-partner`). **Collect each returned `agentId`** — that ID is how you'll hand it its turns.

Give every agent the **same standing brief** as its spawn prompt (the role itself lives in the agent's own definition — don't re-describe it). Fill in `<IDEA>` verbatim:

```
You're a standing member of a live panel stress-testing an idea. Your role is fixed (it's who you are). Here is the idea under discussion:

<IDEA>
{the bounded idea, verbatim}
</IDEA>

How this works:
- This is an ongoing conversation. I (the moderator) will relay each new contribution to you as it's made, then say "Your turn." Take your turn ONLY when handed it — until then, stand by.
- Reply in a few concise bullet points — not prose, no essay. Give only your contribution: no preamble, no sign-off, and don't label or tag your turn.
- If a point can only be settled outside this debate (real-world data, a test, the owner's decision) or is a tangent, don't argue it — park it. End that turn with:
  <PARK>
  - one line per point
  </PARK>
  Don't re-raise anything already parked anywhere in the conversation.
- When you have nothing new and on-topic left to add — only repetition or padding, or everything left is parked-class — reply with exactly the bare token NO_OUTPUT and nothing else. Standing down honestly is the goal, not a failure. NO_OUTPUT is exclusive: never reason and THEN stand down in the same turn.

Acknowledge by replying exactly "ready" (this is not your first turn — just confirm and stand by). Send all replies to "main".
```

Wait for all four to reply `ready`. (Don't tell any agent who its co-panelists are — initial blindness keeps anyone from pre-empting the others' jobs. They'll infer roles from the relayed turns over time, which is fine.)

### Step 3 — Run the relay loop

Keep a **master transcript** string. Each recorded turn is wrapped so boundaries are unambiguous: `<BS>…</BS>`, `<DA>…</DA>`, `<FC>…</FC>`, `<VC>…</VC>`, and your nudges as `<timekeeper>…</timekeeper>`.

Loop rounds `1..N`, and within each round go in **fixed order BS → DA → FC → VC** (VC last so it folds the round's divergence, critique, and grounded facts into the product). For each turn:

1. **If a timekeeper nudge fires this round, record it first** (once per round, before BS's turn) so it lands in this round's deltas. Fire points:
   - round `ceil(N/3)` → `The conversation has explored the idea from several angles. Start building on what has survived and resolving open threads — we're after the strongest version of the idea.`
   - round `ceil(2N/3)` → `The conversation is nearing the end of the allocated time. Work together to find the strongest version of the idea.`
   - round `N` (last) → `Last round — the session is closing. Land the strongest version of the idea: park anything that can only be settled outside this debate, and if you've nothing decisive left to add, stand down.`
2. **`SendMessage`** to this agent's `agentId`. The `message` is the **delta**: every turn recorded since *this agent* last spoke, copied verbatim, followed by `Your turn.` In steady round-robin the delta is just the three turns since its last one (plus any `<timekeeper>` line); on the very first turn of the debate, BS gets no prior turns (it opens), and DA/FC/VC each get the turns already taken this round.
3. **Await its reply** (it arrives as a notification when the agent sends to `main`). Append it to the transcript verbatim inside the agent's tag. A turn counts as a stand-down **only** if the reply is exactly the bare token `NO_OUTPUT`; anything else (even a paragraph ending in `NO_OUTPUT`) is a contribution.

The turns are serialized naturally: you message one agent and wait for its reply before messaging the next. Replies are async across your own turns — proceed each time one lands.

**Convergence** (a mechanical check, not a judgment): if a **full round** — all four of BS, DA, FC, VC in the same round — replied exactly `NO_OUTPUT`, the debate has run dry. Stop; exit reason = `converged at round R (unanimous NO_OUTPUT)`. Otherwise run to the cap; exit reason = `hit cap at N rounds — positions still moving`.

> Do not call convergence early because the debate "seems done." It's done when and only when a whole round stands down.

### Step 4 — Synthesis

Harvest the parking lot: scan the transcript for bullets inside `<PARK>…</PARK>` blocks, dedupe them. Then spawn **one** fresh agent (`subagent_type: claude`, foreground is fine — you want its single final message) as the neutral closer:

```
A panel debate about an idea has just finished. You are the neutral orchestrator writing the closeout — you did not argue. Summarize faithfully from the transcript (each turn is wrapped in a tag: <BS>…</BS> amplified, <DA>…</DA> attacked, <FC>…</FC> fact-checked, <VC>…</VC> shaped the product; <timekeeper>…</timekeeper> entries are procedural nudges — ignore them as content).

IDEA:
{the idea}

FULL TRANSCRIPT:
{transcript}

PARKING LOT (pain points the panel set aside as resolvable only outside the debate):
{the deduped park items, or "(none)"}

EXIT REASON: {exit reason}

The deliverable is a **refined idea** — a better, more marketable/implementable version of what we started with. It is NOT a verdict; do not force a thumbs-up/down. Write these sections:
- **Refined idea** — lead with this; it's the point. One or two paragraphs giving the strongest, most marketable/implementable version of the idea the debate produced. Fold in the product shaping the debate established (the customer, the wedge, the framing) so this reads as "here is the better version of your idea," not a summary of the argument.
- **How to make it real** — the concrete moves the debate surfaced: who the customer is, the wedge / smallest proof of demand, the distribution path, and the single next step to de-risk the biggest assumption. Include only the ones the debate actually reached; omit the rest rather than inventing them.
- **Drift trace** — trace how the idea moved from the *original pinned seed* to the refined idea, as a short chain of reframes (seed → … → final). Then report ONE thing: did the seed's **subject** survive? Distinguish (a) **subject drift** — the refined idea is now about a *different thing* (different domain, product, problem, or customer) than the seed; from (b) a **verdict shift** — *same subject*, sharpened/narrowed/redirected. ONLY (a) is drift; (b) is the panel doing its job — report it as "subject held". If the subject drifted, name the hop where it changed, and say plainly whether the place it drifted to looks like a *stronger* idea worth knowing about. DESCRIBE; the reader owns the seed and decides.
- **Surviving extensions** — the ambitious additions that survived scrutiny.
- **Live risks** — objections that were confirmed real and remain unresolved.
- **Grounded facts** — what was actually verified or corrected, with sources.
- **Open questions / parking lot** — the pain points the panel set aside as resolvable only outside the debate. Start from the PARKING LOT above; add anything else genuinely unresolved. Name the facts only the idea's owner can supply.
- **Verdict — only if the debate clearly earned one.** If the panel clearly established the idea is dead, say so in one line with the reason. If it clearly established the idea is strong and ready, say that. If neither was clearly settled, OMIT this section entirely.
- **Exit reason** — restate it verbatim: "{exit reason}". If it is the cap, say positions were still moving and that `resume latest` (optionally with a steer) would likely pay off.
```

### Step 5 — Persist & present

1. `mkdir -p ./.grill-team` in the current project.
2. Write `./.grill-team/<date>-<slug>.md`:
   ```
   # grill-team: <slug>
   _<date> · <exit reason>_

   ## SEED
   <the idea>

   ## TRANSCRIPT
   <transcript>

   ## SYNTHESIS
   <synthesis>
   ```
3. Show the user the synthesis and the transcript path. If the exit was the cap, offer: `resume latest` for more rounds, or `resume latest steer: <constraint>` to push an angle.

---

## Resuming

`resume [latest|<path>] [steer: <text>]`

Persistent agents don't survive across sessions, so resume **rebuilds the panel from the transcript** — the transcript is the only durable state.

1. Find the transcript: `latest` → newest in `./.grill-team/`; else the path given. Load the whole file; extract the `## SEED`, the `## TRANSCRIPT` body, and the previous exit reason.
2. Decide if resuming helps:
   - Previous exit was **cap** → a bare resume is productive (positions were still moving).
   - Previous exit was **converged** → a bare resume will just re-converge immediately. **Require a `steer:`** — the new constraint resets the standdown. If the user bare-resumes a converged debate, tell them and ask for a steer.
3. Re-spawn the four agents (Step 2), but extend each standing brief with the prior transcript so they resume warm:
   ```
   This debate is already in progress. Here is the conversation so far — read it as your memory, then stand by for "Your turn.":
   <transcript body>
   ```
   If a `steer:` was given, append it verbatim as a fresh `<STEER>…</STEER>` line to the master transcript and include it in the first delta to every agent.
4. Continue the relay loop (Step 3) from the next round, then synthesize (Step 4) and **overwrite** the transcript file with the new transcript + a fresh `## SYNTHESIS` (the old synthesis is superseded — the debate isn't over anymore).

---

## What you must NOT do (relay integrity)

- **Don't run the debate in your own voice.** You spawn agents and relay; you never write a turn, paraphrase one, or blend in your own opinion. The agents argue; you carry messages.
- **Don't lead the witness.** The standing brief and the timekeeper nudges are the *only* text you author into the channel, and they're fixed and content-neutral. No per-turn editorializing, no "the conclusion seems to be…".
- **Don't stop early.** Convergence is a full round of bare `NO_OUTPUT`, full stop — not your read that it "seems done."
- **Don't edit the synthesis** the closer returns — present it as written.
- The only judgment you apply is the **bounded-idea gate** and whether a resume needs a steer.
