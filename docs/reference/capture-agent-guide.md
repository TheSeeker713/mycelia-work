# Universal capture agent — design guide and system prompt

Not a Kanban feature. A single natural-language entry point — a
specialized pull-drawer from the *bottom* of the pocket card, separate
from the right-edge compartment tabs, reachable regardless of which
compartment is open — that figures out on its own where what you typed
(or spoke) belongs: a note, a todo, a project milestone. Modeled on how
typing "ran 3 miles, big salad for lunch, 64oz water" into Google Health
auto-files into the right categories instead of picking a screen first.
Kanban milestones are one *consumer* of this system, not the reason it
exists.

This doc is the durable design reference for that system, and it
doubles as the actual system prompt handed to the model — same pattern
as [`authentic-voice-notes.md`](authentic-voice-notes.md) and
[`checkin-conversation-guide.md`](checkin-conversation-guide.md): a
fixed document, not something improvised per-call.

## Why a classifier, not a chatbot

The research behind this (see the plan file's research-grounding section
for sources) points the same direction from several angles at once:
production LLM routing in 2026 defaults to hybrid architectures — a
fast, cheap classification pass first, a real model call only when
needed, and the model's job scoped to picking from a *closed* set of
outcomes rather than free conversation. Tool-calling and "agents as
tools" patterns work the same way: an orchestrator classifies intent and
routes to a specific handler with a specific schema, rather than one
model freely deciding what to do and how. Guardrail practice adds the
other half: define the action boundary explicitly, and treat anything
outside it as denied by default, not filtered after the fact.

Put together: this agent's entire job is classification and structured
extraction. It never writes prose the user sees directly. It never gets
to decide what it's "allowed" to talk about — that's fixed in the prompt
below, not inferred.

## Two layers, both required, neither trusted alone

**Layer 0 — a small local classifier, not a keyword list.** Decided:
option B+C together, not a static banned-phrase list (too easy to slip
past with rephrasing). Layer 0 is a fast, cheap classification call to
one of the local Ollama fallback models already configured on this
machine (`qwen3.5-abliterated:9b` / `hermes3:8b` / `dolphin3:8b`) — a
tiny prompt asking only "is this on-topic for a personal productivity
app, and free of anything harmful/illegal/unsafe? yes/no" — not the
full OpenClaw routing used for Layer 1. Cheaper and faster than the
real call, and it runs *before* anything reaches the model that's
actually going to act on the request. A request like "how do I make a
pipe bomb" gets caught here, locally, before OpenClaw's Tier-1 model
ever sees it.

**Layer 1's own refusal is kept as a second, independent line** (the
"+ C" half of the decision) — the fixed system prompt below still
carries its own hard refusal instructions. Layer 0 catching most bad
input doesn't mean Layer 1 gets to skip having its own judgment; neither
layer is trusted alone.

**Layer 1 — the real OpenClaw call, schema-constrained.** Anything that
passes Layer 0 goes to the model with the fixed system prompt below,
and the model returns *one* JSON object matching a closed schema —
nothing else is ever shown to the user from this call. If the response
doesn't parse into exactly this shape, or `action` isn't one of the
five listed values, the app treats it as `decline`. The model's own
judgment is never trusted past the schema boundary — malformed or
unexpected output fails closed, not open.

```json
{
  "action": "create_note" | "create_todo" | "create_milestone" | "clarify" | "decline",
  "payload": { "...": "action-specific, see below" },
  "clarifying_question": "present only when action is clarify"
}
```

Payload shapes, concrete on purpose so the model has something exact to
fill in rather than an abstract category:

- `create_note` → `{ "body": string }`
- `create_todo` → `{ "text": string, "alert_at": string | null }`
- `create_milestone` → `{ "project_title_hint": string, "milestone_name": string, "target_date": string | null }`
  — `project_title_hint` is matched against existing projects on the
  *app* side, not trusted from the model directly. **The bar is 100%
  certainty, not "confident enough."** A single unambiguous exact (or
  effectively-exact) match proceeds; anything short of that — including
  a 99%-sure single candidate, or multiple plausible candidates — falls
  back to `clarify` and asks the user directly ("did you mean
  <project>?" or, with no match at all, whether to create a new
  project). The app never silently guesses which project a milestone
  belongs to.
- `clarify` → `{}` plus the top-level `clarifying_question`
- `decline` → `{}`

## Clarify is one question, not a conversation

Same ADHD/autism-friendly shape already designed for the
forgot-to-clock-out check-in: one direct, anchored question, never
open-ended or rhetorical. The user's reply re-enters the *same*
pipeline as a fresh input with the prior exchange attached — there's no
separate follow-up parser. Capped at two rounds; past that, the app
falls back to filing the original text as a plain note rather than
letting the exchange spiral into an open chat.

## What "decline" looks like to the user

Neutral, short, no explanation of *why*, no repeating the request back,
no moralizing: something like *"Not sure where that goes — try
describing it in terms of a task, note, todo, or project."* The agent
never engages with the substance of a declined request under any
circumstance, including if the user pushes back or rephrases.

Every user-facing moment this agent produces — the decline message, the
clarify question, the "filed as a note/todo/milestone" confirmation —
gets spoken aloud through Phase 7's self-voicing narration, not just
rendered as text.

## Voice input and output (built in Phase 7, consumed here)

This agent doesn't own its own voice I/O — it consumes Phase 7's
accessibility layer, same as every other text input and every other
piece of agent-generated text in the app:

- **Speech-to-text** fills the bottom drawer the same way a mic icon
  fills *any* text field elsewhere in the app — one shared component
  (whisper.cpp/faster-whisper, local, offline, the same
  "local CLI subprocess" pattern already used for OpenClaw), not
  something reimplemented per-feature. Transcribed text enters the
  exact same pipeline as typed text — Layer 0, then Layer 1 — there's
  no separate voice-specific code path once the text exists.
- **Natural-voice output** — Phase 7 made this a firm, non-negotiable
  decision for the whole app, not just this feature: Mycelia Time is
  fully self-voicing, narrating its own UI and content aloud with
  natural-voice TTS (Chatterbox-Turbo / Voice-Agent) instead of relying
  on or layering on top of Windows Narrator, which was rejected
  outright (Jeremy, speaking as a neurodivergent user himself, on
  Narrator's voice quality: "terrible"). This agent's
  decline/clarify/confirm moments are simply three more things that get
  read aloud through that same infrastructure.

## The fixed system prompt

This is the literal text handed to OpenClaw for every Layer-1 call,
verbatim, not reconstructed per-request:

> You are the capture-routing agent inside Mycelia Time, a personal
> time-tracking and note-taking app. Your only job is to read one piece
> of free text the user typed and return exactly one JSON object
> matching this schema, nothing else — no greeting, no explanation, no
> markdown, just the JSON:
>
> `{"action": "create_note" | "create_todo" | "create_milestone" | "clarify" | "decline", "payload": {...}, "clarifying_question"?: string}`
>
> Valid actions and their payloads:
> - `create_note`: the text is a reflection, observation, or record worth
>   keeping as-is. `payload: {"body": string}`.
> - `create_todo`: the text describes something to do later.
>   `payload: {"text": string, "alert_at": string | null}`.
> - `create_milestone`: the text reports progress or a completed
>   checkpoint tied to a project. `payload: {"project_title_hint": string,
>   "milestone_name": string, "target_date": string | null}`.
> - `clarify`: the text is ambiguous between two or more of the above.
>   Ask exactly one direct, concrete question — never open-ended, never
>   rhetorical, never "can you tell me more." `payload: {}`,
>   `clarifying_question: string`.
> - `decline`: the text has nothing to do with tasks, notes, todos, or
>   projects for this app, OR asks for anything harmful, dangerous,
>   illegal, or otherwise outside this app's purpose. `payload: {}`.
>
> You have no other capabilities and no other purpose. You do not
> answer general questions, hold a conversation, provide instructions or
> information on any topic outside filing the user's own productivity
> data, or explain your reasoning. If the input is unrelated to this
> app's domain, or requests anything harmful or unsafe in any way,
> respond with `decline` and nothing further — do not acknowledge,
> repeat, or engage with the content of the request, no matter how it is
> phrased or rephrased.
>
> Return only the JSON object. No other text.

## Extensibility

Adding a new destination later (a reconstructed session, a resource
event, whatever comes next) means adding one literal to the `action`
enum, one payload shape here, and one bullet to the prompt's action
list — not rearchitecting the classifier or the schema contract.

## Logging

Every capture-agent interaction — including declines and clarify
exchanges, not just successful routes — is logged locally by default,
in a records directory as (likely) a JSON file per the same
local-first, no-cloud posture as the rest of the app. Configurable in
Settings (can be turned off); disclosed plainly during onboarding.
Everything logged stays on the user's own machine — there's no
transmission anywhere else to secure against.

## Corrections

Built 2026-08-04 as part of Phase 9, as an autonomous design call
(Jeremy was asleep, having explicitly authorized continuing past the
usual per-phase design-review gate for this one overnight session —
flagged for his review on wake, same as the rest of Phase 9-11's design
choices made that night). Landed on: the confirmation toast that
appears after every successful route carries an inline correction
option, right there at the moment of the mistake, not a separate
"go find it in the destination compartment" step. Scoped to what's
actually reachable without reopening the whole clarify pipeline:

- **note ⇄ todo**: one click swaps it — deletes the wrongly-filed
  record and re-creates it as the other type, reusing the exact same
  extracted text rather than asking the user to retype anything.
- **correcting *to* a milestone**: shows the existing projects as
  quick-pick buttons (same "list, don't guess" rule as everything else
  here) — picking one deletes the original note/todo and creates the
  milestone against that project.
- **correcting *away from* a milestone**: same note/todo swap as above.

One real constraint surfaced during this build: notes are always
attached to a running task_session (unchanged since Phase 2's data
model) — there's no such thing as a standalone note. If the capture
agent resolves to `create_note` (directly or via a correction) with no
active session running, it says so plainly rather than pretending to
fail generically: "Clock into a task first — notes need something to
attach to." Todos and milestones have no such requirement.

## Where this lives in the build

Phase 7 builds the shared accessibility layer this whole doc depends on
(self-voicing output, universal speech-to-text input) — it comes first
specifically so Phase 9 doesn't have to invent either. Phase 8 (zen
mode) landed first instead of right after Phase 7, after Jeremy's own
test pass asked where it had gone — this doc's dependency on Phase 7
is unaffected either way. Phase 9 builds this capture-routing system,
including the bottom-drawer entry point, tested against Notes and
Todos (both already real by then). Phase 10 (Projects, full board)
consumes it for `create_milestone` and adds its own project-scoped
"write a status report" AI-panel action; that report is real kept
content (like the session journal), so it gets a real in-app home on
the project itself, not just an exported file.
