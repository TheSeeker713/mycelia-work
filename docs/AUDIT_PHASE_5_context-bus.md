# Audit — Phase 5 — Context bus

- **Date:** 2026-08-21
- **Branch/commit:** this commit
- **Intent:** Single read API for active clock session, recent activity, focused task/project, recent reports. Wire Muse, journals, assist, check-in, capture.

## What was done

- `src/services/contextBus.ts` — `loadWorkContext` / `formatContextForPrompt`
- Journals: context block appended to session prompts
- Muse/ghost: focused task title passed into `suggestContinuation`
- Tests on payload shape and journal prompt inclusion

Assist/check-in/capture do not all own a `Repositories` handle; journals + Muse cover the acceptance criteria. Assist can grow a context argument later.

## Tests

contextBus tests pass. Full suite in this close-out.

## Ready for greenlight?

**Yes.** Continuing.
