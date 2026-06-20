---
name: grill-team
description: Stress-test an idea with a four-voice debate panel — Blue-Sky amplifies it, Devil's-Advocate attacks it, Fact-Checker grounds it in fact, Venture-Partner shapes it into a marketable product. They debate in rounds over a shared transcript until they converge, then you get a refined version of the idea. Use when the user wants an idea pressure-tested, expanded and challenged at once, sharpened into something buildable, or says "grill-team" / "run the panel" / "debate this idea".
argument-hint: <idea to stress-test>  |  resume [latest|<transcript-path>] [steer: <new constraint>]
---

# grill-team — the debate panel

A four-voice debate that pressure-tests an idea and hones it into a better version:

- **`blue-sky`** (label `BS`) — amplifies and extends it.
- **`devils-advocate`** (label `DA`) — attacks the strongest version.
- **`fact-checker`** (label `FC`) — grounds claims in fact (the only one with research tools).
- **`venture-partner`** (label `VC`) — shapes it into a marketable, shippable product.

Each agent is **blind to the others** — it knows only its own role, not who else is on the panel, so it can't do their jobs for them (no "the critic will surely object…" pre-emption).

**You are a thin wrapper, not the orchestrator.** The debate loop itself runs in a **deterministic workflow** — [`debate.workflow.js`](debate.workflow.js) — where the per-turn prompt, the fixed BS→DA→FC→VC order, and the convergence test all live in *code*. That's deliberate: it makes it structurally impossible to lead the witness (the prompt is code-built and strictly neutral) or to stop early (convergence is a code equality check, not a judgment call). Your job is the three things code *can't* do: the bounded-idea check, launching the workflow, and persisting + presenting the result.

The arguments: **$ARGUMENTS**

---

## Step 0 — Mode

- Arguments begin with `resume` (or `continue`) → **RESUME mode** (jump to "Resuming").
- Otherwise → **NEW mode**.

Parse optional `rounds=N` (round cap; the workflow defaults to 6) and, in resume, `steer: <text>`.

---

## NEW mode

### Step 1 — Bounded-idea check (do this FIRST, before any debate)

Judge whether the seed is a **bounded question** (a specific decision, design, claim, or plan with a reachable answer — "should we do X?", "is this architecture sound?", "will this model work?") or an **unbounded prompt** (open-ended ideation — "what could we build around X?", "ideas for Y").

- **Bounded** → proceed to Step 2.
- **Unbounded** → **do not launch the debate yet.** Tell the user it's open-ended (the panel will mutate forever and ride the cap instead of converging), propose one or two bounded reframings, and ask them to pick or refine. Only proceed once the idea has a reachable bottom.

This is the one genuine judgment call in the flow, and it's a *gate*, not part of the loop — so it stays here in the wrapper, not in the deterministic workflow.

### Step 2 — Launch the workflow

1. `date +%Y-%m-%d` in bash; make a short kebab-case slug (≤ 6 words) from the idea.
2. Invoke the **Workflow** tool:
   - `scriptPath`: `${CLAUDE_SKILL_DIR}/debate.workflow.js`
   - `args`: `{ "idea": "<the bounded idea, verbatim>", "rounds": <N if the user set rounds=N, else omit> }`
3. The workflow runs in the background and notifies you when done. It returns:
   ```
   { seed, transcript, synthesis, exitReason, rounds }
   ```

### Step 3 — Persist & present

1. `mkdir -p ./.grill-team` in the current project.
2. Write `./.grill-team/<date>-<slug>.md`:
   ```
   # grill-team: <slug>
   _<date> · <exitReason>_

   ## SEED
   <the idea>

   ## TRANSCRIPT
   <transcript>

   ## SYNTHESIS
   <synthesis>
   ```
3. Show the user the `synthesis` and the transcript path. If `exitReason` is the cap, offer: `resume latest` for more rounds, or `resume latest steer: <constraint>` to push an angle.

---

## Resuming

`resume [latest|<path>] [steer: <text>]`

1. Find the transcript: `latest` → newest in `./.grill-team/`; else the path given. Load the whole file; extract the `## TRANSCRIPT` body and the previous `## SYNTHESIS` exit reason.
2. Decide if resuming helps:
   - Previous exit was **cap** → a bare resume is productive (positions were still moving).
   - Previous exit was **converged** → a bare resume will just re-converge immediately. **Require a `steer:`** — the new constraint resets the standdown. If the user bare-resumes a converged debate, tell them and ask for a steer.
3. Re-launch the **Workflow** with `args`: `{ "idea": "<original seed>", "rounds": <N?>, "priorTranscript": "<the loaded transcript body>", "steer": "<steer text if given>" }`. The workflow seeds itself with the prior transcript (and steer) and runs another batch.
4. Overwrite the transcript file with the new `transcript` + a fresh `## SYNTHESIS` (the old synthesis is superseded — the debate isn't over anymore).

---

## What the wrapper must NOT do

- **Don't run the debate yourself.** Don't spawn the agents directly, don't write per-turn prompts, don't judge convergence — that's all the workflow's job, in code, on purpose. If you find yourself deciding "the debate seems done," stop: that decision belongs to the code's unanimous-`NO_OUTPUT` check.
- **Don't edit the synthesis** the workflow returns — present it as written.
- The only place you apply judgment is the **bounded-idea gate** (Step 1) and choosing whether a resume needs a steer.
