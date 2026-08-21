# Audit — Phase 4 — Aggregation + labels + timeline

- **Date:** 2026-08-21
- **Branch/commit:** pending (this commit)
- **Intent:** Merge adjacent activity_events; short labels via local Ollama through aiQueue + pending UI; accept/rename/merge/discard/attach; day timeline in Progress.

## What was done

- `src/services/activityAggregation.ts` + tests
- `activity_sessions` table + repository (`attach` sets accepted + task_id)
- `src/services/activityLabels.ts` — `runAiJob` ghost_text kind
- `src/components/DayTimeline.tsx` in Progress

Merge/rename are label overwrite + discard; no separate merge UI (pocket density).

## Tests

659 vitest. Aggregation + attach covered.

## Deviations

- Labels use suggestContinuation with a short prompt (local, queued) rather than a new job kind.
- Continuing.

## Ready for greenlight?

**Yes.**
