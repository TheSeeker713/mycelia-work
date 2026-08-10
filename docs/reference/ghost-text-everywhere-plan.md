# Ghost-text everywhere: bug diagnosis + next-phase scope

## Status as of 2026-08-09

Jeremy reported ghost-text/Muse suggestions not appearing anywhere he
tried them — including Notes zen mode and the new standalone Journal,
the two places it currently exists in the code — on a fully fresh app
restart, after Phase 16.4's fix (Ollama was rejecting the Tauri
webview's origin, confirmed live and fixed via `OLLAMA_ORIGINS` +
restarting Ollama).

**Re-verified live, all healthy, after that report:**
- Ollama running, `dolphin-phi:latest` present.
- The exact request `suggestContinuation` sends (same URL, same body,
  same origin the dev build actually uses — `http://localhost:1420`,
  confirmed from `tauri.conf.json`'s `build.devUrl`, not assumed)
  succeeds in ~4s, well under the 12s timeout.
- The full CORS preflight (`OPTIONS` with
  `Access-Control-Request-Method`/`-Headers`, what a real browser
  `fetch()` sends ahead of a JSON `POST`) also succeeds with correct
  `Access-Control-Allow-*` headers.
- System resources at the time: 41.6% memory, 5% CPU — nowhere near
  the resource watchdog's 90%/95% thresholds, ruling out a false-
  positive throttle.
- `ZenModeEditor.tsx`'s debounce/cursor-at-end/request-staleness logic
  reads correctly on inspection — no obvious bug found by re-reading it.

**Still unresolved.** The backend chain is fully healthy and the
frontend logic looks structurally sound, but Jeremy still sees nothing.
Next diagnostic step (needs Jeremy, not something verifiable from code
alone): open DevTools in the running app (right-click → Inspect, or
F12) after typing and pausing in Notes zen mode, and check the Console
tab. Either nothing fires at all (a different bug than suspected — the
debounce/trigger path itself isn't running) or a `Ghost-text suggestion
request failed:` warning appears (the fetch fires and fails — the
16.4 fix added this logging specifically so a failure like this
wouldn't be invisible again). Whichever it is narrows the next step
precisely.

## Confirmed next-phase scope: ghost-text in every text box, not just zen mode

Jeremy confirmed (2026-08-09): the ask is ghost-text/Muse suggestions
in **every text box within Mycelia Time itself** — todos, project
fields, the compact Notes panel, the clock-out brief field, manual
report editing, etc. — not just Notes zen mode and the Journal, and
explicitly **not** a system-wide/other-applications feature (that would
need OS-level keyboard/accessibility hooks, a fundamentally different
and much larger undertaking than anything in this app so far — ruled
out).

**Real implementation question this raises**, not yet resolved: this
app currently has *three different* ghost-text mechanics, none of them
shared:
1. `ZenModeEditor.tsx` (Notes zen mode) — a mirror-`<div>` positioned
   behind a transparent-text `<textarea>`, showing the suggestion as
   trailing muted text.
2. `JournalZenEditor.tsx`/`museSuggestion.ts` (the new Journal, Phase
   16.5) — a ProseMirror `Decoration.widget` inside a TipTap doc.
3. **Nothing yet** for plain `<input>`/small `<textarea>` fields
   elsewhere (todos, project title/description, the clock-out brief
   field) — these aren't rich-text editors, so neither existing
   mechanic applies directly.

A real "everywhere" build needs either a third mechanic for plain
inputs (most likely: the same mirror-div trick #1 already uses, since
that one doesn't require a rich-text engine — a plain `<input>`/
`<textarea>` can be wrapped the same way), or a genuinely shared
abstraction all three call sites go through. Worth resolving with real
research (see below) before committing to an approach, rather than
building a third bespoke implementation.

This needs its own plan once the current bug (still nothing showing up
anywhere) is actually root-caused — building "everywhere" on top of a
mechanism that isn't working anywhere yet would just multiply the same
unknown bug by every new call site.
