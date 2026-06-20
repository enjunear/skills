export const meta = {
    name: 'grill-team-debate',
    description: 'Deterministic four-voice idea-honing panel. blue-sky amplifies, devils-advocate attacks, fact-checker grounds, venture-partner shapes it into a marketable product — looping in fixed order (BS → DA → FC → VC) until a full round of unanimous NO_OUTPUT (converged) or max_rounds, then a synthesis that delivers a refined idea. The loop, the neutral per-turn prompt, and the convergence test all live in code so the orchestrator cannot lead the witness or stop early.',
    phases: [
        { title: 'Debate' },
        { title: 'Synthesis' },
    ],
}

// ---- inputs (passed by the skill) ----
// `args` may arrive as a parsed object OR as a JSON string, depending on how the
// caller passes it. Normalize so the workflow works either way.
let A = args
if (typeof A === 'string') {
    try { A = JSON.parse(A) } catch (e) { A = {} }
}
if (!A || typeof A !== 'object') A = {}

const SEED = (A.idea ? String(A.idea) : '').trim()
const MAX_ROUNDS = Number(A.rounds) > 0 ? Number(A.rounds) : 6
const PANEL = [
    { type: 'blue-sky', label: 'BS' },
    { type: 'devils-advocate', label: 'DA' },
    { type: 'fact-checker', label: 'FC' },
    { type: 'venture-partner', label: 'VC' },
]

if (!SEED) throw new Error(`grill-team-debate: args.idea is required (typeof args=${typeof args})`)

// The transcript — pasted whole into each agent. Kept affordable by brief,
// bulleted turns rather than by summarizing. It also feeds the final synthesis.
let transcript = A.priorTranscript ? String(A.priorTranscript).trim() + '\n' : ''
if (A.steer) transcript += `\n<STEER>\n${String(A.steer)}\n</STEER>\n`

// Parking lot: pain points that can only be settled OUTSIDE the debate (the owner
// gathering data, a test, a decision) or tangents. Anyone parks them in a <PARK>…
// </PARK> block of bullets in their turn; we collect + dedupe and show the list
// each turn. This is the convergence lever — once everything left is parked, the
// panel has nothing resolvable to argue and can honestly stand down.
const parkingLot = []
const parkKey = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const pushPark = (item) => {
    item = item.trim()
    if (item && !parkingLot.some((p) => parkKey(p) === parkKey(item))) parkingLot.push(item)
}
const addParks = (text) => {
    // Bullets inside <PARK>…</PARK> blocks.
    for (const block of String(text).matchAll(/<PARK>([\s\S]*?)<\/PARK>/gi)) {
        for (const line of block[1].split('\n')) {
            const m = line.match(/^\s*[-*•]\s*(.+?)\s*$/)
            if (m) pushPark(m[1])
        }
    }
}
if (A.priorTranscript) addParks(A.priorTranscript) // rebuild on resume

// The ONLY prompt an agent sees — code-built and content-neutral: idea + parking lot
// + transcript + "Your turn." Nowhere to lead the witness toward a conclusion.
const buildPrompt = (t) => {
    const lot = parkingLot.length
        ? `\n<parking-lot>\n${parkingLot.map((p) => `- ${p}`).join('\n')}\n</parking-lot>\n` +
          `(Already set aside — these can only be settled outside this debate. Don't re-raise them.)\n\n`
        : ''
    return (
        `We're discussing this idea:\n<IDEA>\n${SEED}\n</IDEA>\n` +
        lot +
        `Here's the conversation so far:\n${t.trim() ? t.trim() : "(nothing yet — you're opening)"}\n\n` +
        `Your turn. Reply in a few concise bullet points — not prose, no essay. Give only your contribution: no preamble, no sign-off, and don't label or tag your turn.\n` +
        `If a point can only be settled outside this debate (real-world data, a test, the owner's decision) or is a tangent, don't argue it — park it. At the end of your turn, add any points to park in a block like:\n<PARK>\n- one line per point\n</PARK>\nDon't re-raise anything already parked. If everything you have left is parked or parking-lot-class, you've nothing left to resolve here — reply exactly NO_OUTPUT.`
    )
}

// ---- the debate loop (deterministic) ----
phase('Debate')
let exitReason = `hit cap at ${MAX_ROUNDS} rounds — positions still moving`
let endedRound = MAX_ROUNDS

// Timekeeper nudges: gentle steers toward convergence at the one-third and
// two-third marks, then a firmer last-round nudge. Injected once into the
// transcript as a <timekeeper> entry so every later turn reads them. Content-
// neutral (no round numbers, no verdict) — they push the panel to consolidate,
// not toward any particular conclusion.
const firstNudge = Math.ceil(MAX_ROUNDS / 3)
const secondNudge = Math.ceil((MAX_ROUNDS * 2) / 3)

for (let round = 1; round <= MAX_ROUNDS; round++) {
    if (round === MAX_ROUNDS) {
        transcript += `\n<timekeeper>\nLast round — the session is closing. Land the strongest version of the idea: park anything that can only be settled outside this debate, and if you've nothing decisive left to add, stand down.\n</timekeeper>\n`
        log('timekeeper: last-round nudge')
    } else if (round === firstNudge) {
        transcript += `\n<timekeeper>\nThe conversation has explored the idea from several angles. Start building on what has survived and resolving open threads — we're after the strongest version of the idea.\n</timekeeper>\n`
        log('timekeeper: one-third nudge')
    } else if (round === secondNudge) {
        transcript += `\n<timekeeper>\nThe conversation is nearing the end of the allocated time. Work together to find the strongest version of the idea.\n</timekeeper>\n`
        log('timekeeper: two-third nudge')
    }
    const turns = []
    for (const a of PANEL) {
        // Stateless one-shot: the transcript pasted in IS the agent's whole memory.
        const reply = ((await agent(buildPrompt(transcript), {
            agentType: a.type,
            label: `R${round}:${a.label}`,
            phase: 'Debate',
        })) ?? '').trim()
        // A turn counts as a stand-down ONLY if it is exactly the bare token.
        const out = reply === 'NO_OUTPUT' ? 'NO_OUTPUT' : (reply || 'NO_OUTPUT')
        turns.push(out)
        if (out !== 'NO_OUTPUT') addParks(out) // collect any PARK: items into the lot
        // Each turn is wrapped in an XML-like tag so multi-paragraph turns have
        // unambiguous boundaries. The tag is an opaque label to the agents.
        const block = `<${a.label}>\n${out}\n</${a.label}>`
        transcript += `\n${block}\n`
    }
    log(`round ${round}: ${turns.map((t, i) => `${PANEL[i].label}=${t === 'NO_OUTPUT' ? '·' : '✎'}`).join(' ')}`)
    // Convergence is a code equality check — not a judgment call.
    if (turns.every((t) => t === 'NO_OUTPUT')) {
        exitReason = `converged at round ${round} (unanimous NO_OUTPUT)`
        endedRound = round
        break
    }
}

// ---- synthesis (the closeout; neutral prompt, fixed shape) ----
phase('Synthesis')
const synthesis = await agent(
    `A panel debate about an idea has just finished. You are the neutral orchestrator writing the closeout — you did not argue. Summarize faithfully from the transcript (each turn is wrapped in a tag: <BS>…</BS> amplified, <DA>…</DA> attacked, <FC>…</FC> fact-checked, <VC>…</VC> shaped the product; <timekeeper>…</timekeeper> entries are procedural nudges — ignore them as content).\n\n` +
    `IDEA:\n${SEED}\n\n` +
    `FULL TRANSCRIPT:\n${transcript}\n\n` +
    `PARKING LOT (pain points the panel set aside as resolvable only outside the debate):\n${parkingLot.length ? parkingLot.map((p) => `- ${p}`).join('\n') : '(none)'}\n\n` +
    `EXIT REASON: ${exitReason}\n\n` +
    `The deliverable is a **refined idea** — a better, more marketable/implementable version of what we started with. It is NOT a verdict; do not force a thumbs-up/down. Write these sections:\n` +
    `- **Refined idea** — lead with this; it's the point. One or two paragraphs giving the strongest, most marketable/implementable version of the idea the debate produced. Fold in the product shaping the debate established (the customer, the wedge, the framing) so this reads as "here is the better version of your idea," not a summary of the argument.\n` +
    `- **How to make it real** — the concrete moves the debate surfaced: who the customer is, the wedge / smallest proof of demand, the distribution path, and the single next step to de-risk the biggest assumption. Include only the ones the debate actually reached; omit the rest rather than inventing them.\n` +
    `- **Drift trace** — trace how the idea moved from the *original pinned seed* to the refined idea, as a short chain of reframes (seed → … → final). Then report ONE thing: did the seed's **subject** survive? Distinguish (a) **subject drift** — the refined idea is now about a *different thing* (different domain, product, problem, or customer) than the seed, e.g. "paint apples to sell as oranges" → "sell third-party compliance audits"; from (b) a **verdict shift** — *same subject*, sharpened/narrowed/redirected. ONLY (a) is drift; (b) is the panel doing its job — report it as "subject held". If the subject drifted, name the hop where it changed, and say plainly whether the place it drifted to looks like a *stronger* idea worth knowing about. DESCRIBE; the reader owns the seed and decides.\n` +
    `- **Surviving extensions** — the ambitious additions that survived scrutiny.\n` +
    `- **Live risks** — objections that were confirmed real and remain unresolved.\n` +
    `- **Grounded facts** — what was actually verified or corrected, with sources.\n` +
    `- **Open questions / parking lot** — the pain points the panel set aside as resolvable only outside the debate. Start from the PARKING LOT above; add anything else genuinely unresolved. Name the facts only the idea's owner can supply.\n` +
    `- **Verdict — only if the debate clearly earned one.** If the panel clearly established the idea is dead/toast, say so in one line with the reason. If it clearly established the idea is strong and ready, say that. If neither was clearly settled, OMIT this section entirely — do not force a label onto an idea the debate left open.\n` +
    `- **Exit reason** — restate it verbatim: "${exitReason}". If it is the cap, say positions were still moving and that \`resume latest\` (optionally with a steer) would likely pay off.`,
    { label: 'synthesis', phase: 'Synthesis' },
)

return { seed: SEED, transcript: transcript.trim(), synthesis, exitReason, rounds: endedRound }
