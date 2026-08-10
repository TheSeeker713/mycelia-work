# Mycelia Time

Local time tracking app with an AI-generated work journal. Tauri v2 +
React 19 + TypeScript. Built for Jeremy Robards (CTO/CAIO, Mycelia
Interactive LLC). **As of 2026-08-06 this is a private, personal-only
project** — no longer designed for other users, no public onboarding
path, no distribution concerns. Settings still read from preference
values rather than literals where that's already the pattern, but
"other people could use this too" is no longer a design constraint.

Repo: [github.com/TheSeeker713/mycelia-work](https://github.com/TheSeeker713/mycelia-work),
`main` — being switched to private (Jeremy's own doing, not something
built by a phase in this repo). **Desktop only**, no Android/mobile
companion in scope.

## The core idea

Clock into a task, take a break, resume, clock out — every state change
gets logged. Notes append into that same log. On clock-out, an AI agent
(via a local [OpenClaw](https://docs.openclaw.ai) install) turns the raw
log into a natural-language work journal, saved in the app and exported
to `docs/workjournal/`.

## Process — read this before starting any work here

This project is being rebuilt from scratch (Phase 0 onward) after an
earlier pass ran ahead without stopping for review. The existing git
history from that pass stays untouched — never rewritten, rebased, or
force-pushed away — new work is new commits on top of it.

- Work happens in numbered phases (Phase 0, 1, 2, ...), each broken into
  numbered steps (0.1, 0.2, 0.3, ...).
- **At the end of every step**: run the full test suite → cross-check
  the actual output for hallucinated passes (right test count, right
  result, nothing silently skipped) → audit the diff against intent →
  retest as independent confirmation → commit → push to `main` → add a
  timestamped entry to that day's single devlog file → move to the next
  step automatically.
- **At the end of the last step of a phase**: same close-out, then move
  straight to the next phase. **Phases auto-chain — no stopping for
  approval, no per-phase manual test pass.** (Changed 2026-08-09; the
  old rule was a full stop plus Jeremy's manual pass after every phase.)
- **Manual testing happens once, at the very end**, across everything
  built — a single `npm run tauri dev` pass on Jeremy's machine, not one
  per phase. Automated tests plus a real diff audit carry each phase on
  their own until then.
- Judgment calls that are ordinary implementation detail (naming, file
  layout, exact UI copy, which of several viable approaches) get made,
  not asked about. Anything genuinely worth Jeremy knowing goes in that
  step's devlog entry instead of interrupting the run.

## Design rules (non-negotiable)

- **Light theme by default. Dark mode is an optional setting**, not
  banned — Settings → pull-down panel → toggle. Jeremy uses light only;
  other users get the choice.
- **"Tiny pocket book," not a dashboard.** Small, compact default window
  — closer to a pocket notebook or widget than a desktop dashboard.
  Precise, deliberate padding everywhere, nothing sprawling.
- **Pull-out / expand interaction model**, inspired directly by van-life
  and tiny-home storage design: everything has a place, secondary content
  (notes, todos, settings, exports, heatmap) stays hidden in "compartments"
  (pull-tabs) until pulled out, with notes able to expand further into a
  full-screen "zen mode." Exiting zen mode has to be obvious and
  immediate.
- **AI writing assistance in zen mode**: inline ghost-text suggestions
  while writing a note (a few words to a paragraph). Tab accepts,
  continuing to type or any other key dismisses. Needs to feel instant —
  a fast local model is the right call here, not necessarily OpenClaw's
  default.
- **Lives as a background process**: floats always-on-top or shrinks
  into the system tray and keeps running. This is foundational shell
  behavior, not a bolted-on feature.
- **Tray-triggered alerts**: pop out from the tray with a voice cue,
  dismissed easily, never a blocking modal.

## Devlog format and voice

- **One file per day**: `docs/devlog/{YYYY-MM-DD}_devlog.md`, with
  timestamped `## HH:MM — <label>` entries added inside it across the
  day. Never a new file per entry.
- Written first-person as Jeremy. Full voice rules and the research
  behind them live in
  [`docs/reference/authentic-voice-notes.md`](docs/reference/authentic-voice-notes.md)
  — read it before writing any devlog entry or work-journal content.
  Short version: no em dashes, no AI-tell phrases ("I want to flag,"
  "it's worth noting," "not just X but Y"), anchor every entry in a real
  specific detail, vary sentence rhythm, don't force a tidy ending.
- The app's own AI-generated work journal (`docs/workjournal/`) follows
  the same voice rules — the generation prompt includes the reference
  doc directly.

## The forgot-to-clock-out check-in

A session still `running` 8+ (especially 16+) hours later triggers a
short AI chat, not a static form — designed for ADHD/autism-friendly
communication (direct, anchored, one question at a time, non-judgmental).
Full design and the fixed system-prompt template:
[`docs/reference/checkin-conversation-guide.md`](docs/reference/checkin-conversation-guide.md).
Short idle (a few minutes of no input) is a different, much lighter
thing: a soft toast that auto-dismisses after 30 seconds if ignored.
Idle detection is OS-level (system-wide last-input time), not scoped to
the app's window — working in another app still counts as active.

## Tech stack

Tauri v2 (Rust) + React 19 + TypeScript + Vite + Tailwind, Zustand for
client state, SQLite via `tauri-plugin-sql`, OpenClaw (local, already
running) for AI generation via CLI subprocess calls — never the app's own
API keys, and never stop a daemon it didn't start itself.

## Where the full plan lives

The detailed phase-by-phase plan, architecture decisions, and data model
are tracked in this session's plan file. Ask if you need the full detail
— this file is the durable summary that survives across sessions.
