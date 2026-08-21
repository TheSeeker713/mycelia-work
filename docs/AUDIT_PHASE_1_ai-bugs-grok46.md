# Audit — Phase 1 — Retry, Muse/ghost, Grok 4.6

- **Date:** 2026-08-21
- **Branch/commit:** `main` / `2cb9a5f`
- **Intent:** Retry is visibly Generating; Muse/ghost show thinking and go through `aiQueue`; Grok 4.6 is the named and used path; clock-out AI lands in Library; `used_fallback` is persisted for ModelBadge.

## What was done (files)

Retry / pending:
- `src/data/repositories/journalsRepository.ts` — `markPending`; `used_fallback` on `markResult`
- `src/data/repositories/projectReportsRepository.ts` — same, plus `markStalePendingAsFailed`
- `src/store/journalsStore.ts` — mark pending before generation; in-flight Set
- `src/store/projectsStore.ts` — `retryReport` + stale sweep on load
- `src/components/compartments/LibraryCompartment.tsx` — Retry only on failed; weekly button disabled while pending; ModelBadge `usedFallback`
- `src/components/compartments/ProjectsCompartment.tsx` — Retry on failed reports; ModelBadge `usedFallback`

Muse / ghost:
- `src/hooks/useGhostText.ts` — `pending`, optional `enabled` override
- `src/components/journal/useMuseSuggestions.ts` — uses `useGhostText` (queue, min 12 chars, pressure)
- `src/components/journal/museSuggestion.ts` — `setMusePending` decoration
- `src/components/GhostTextField.tsx`, `src/components/ZenModeEditor.tsx` — "…" while in flight

Grok / clock-out:
- `src/services/openclawClient.ts` — `GROK4_MODEL = "xai/grok-4.6"`; `resolveModelOverride` always sends that (or preferred) when Grok is on
- `src/components/compartments/SettingsCompartment.tsx` — copy and placeholder 4.6
- `src/store/settingsStore.ts` — preferred model defaults to Grok 4.6; persisted when Grok is turned on
- `src/components/Dashboard.tsx` — "AI writes it" opens Library immediately
- Schema: `used_fallback` on `journals` and `project_reports`

Docs: `docs/reference/ai-workflow-map.md`, today's devlog.

## Tests run / results

- `npm run typecheck` — pass
- `npm test` — **647 passed**, 78 files (first run 647, independent retest 647)
- `cargo test` — **18 passed**

Covered: Library Retry shows Generating before resolve; store `status === "pending"` mid-await; Muse/ghost pending; no `suggestContinuation` below 12 chars; Settings / `GROK4_MODEL` include `4.6`; clock-out AI opens Library.

## Manual verification steps

1. Fail a report (kill Ollama mid-run or use a junk model), click Retry — Generating appears immediately, Retry is gone.
2. Journal Muse on, type 11 chars, pause — no request. Type past 12 — "…" then a continuation.
3. Settings: "Use Grok 4.6". Toggle on — preferred field shows `xai/grok-4.6`.
4. Clock out → AI writes it → Library, Generating.

## Deviations from plan

- `preferredModel` for the router stays empty until the user (or the Grok toggle) persists it. Defaulting generation to `GROK4_MODEL` as a *preference* caused extra model-retry `runOnce` calls against tests that return `model: "test"`. `resolveModelOverride` still sends `xai/grok-4.6` whenever Grok is on.
- Muse reuses `useGhostText` rather than a third scheduler.
- Process: continuing to Phase 2 because the execution request was to finish all todos.

## Residual risks / follow-ups

- Rows written before this migration have `used_fallback` NULL; ModelBadge treats that as not-fallback.
- Muse pending is a decoration; a very fast model may flash "…" too briefly to notice.

## Docs updated

Yes: `ai-workflow-map.md`, today's devlog.

## Ready for greenlight? (yes/no + blockers)

**Yes** for Phase 1. Continuing to Phase 2.
