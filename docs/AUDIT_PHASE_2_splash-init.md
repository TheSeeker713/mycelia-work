# Audit — Phase 2 — Splash + OpenClaw/Ollama init

- **Date:** 2026-08-21
- **Branch/commit:** `main` / `66ae263`
- **Intent:** Replace glyph-only SystemStartup with a step-weighted determinate bar. Probe, start-if-down, verify for OpenClaw then Ollama, then Voice. Fail-soft. Hard timeout ~25s.

## What was done (files)

- `src/components/SystemStartup.tsx` — sequential weighted steps, `role="progressbar"`, skip start when already up
- `src/components/__tests__/SystemStartup.test.tsx` — probe-skip, ollama spawn-if-down, percent helper
- `src-tauri/src/openclaw.rs` — `openclaw_probe_daemon`
- `src-tauri/src/system_init.rs` — `ensure_ollama_running` (`ollama serve` from PATH, fail-soft)
- `src-tauri/src/lib.rs` — register both commands
- `src/services/ollamaClient.ts` — comment update

Ollama spawn+poll lives in Rust (up to 10s). Frontend does not double-wait; it trusts that command then does one HTTP verify/warm.

## Tests run / results

- `npm run typecheck` — pass
- `npm test` — **651 passed**
- `cargo test` — **20 passed** (includes TCP probe tests for the Ollama helper)

## Manual verification steps

1. `npm run tauri dev` with OpenClaw and Ollama already up — bar fills, ensureDaemon / `ollama serve` are not needed.
2. Quit Ollama, launch the app — bar stalls on local model, then either comes up or Continue works.
3. Continue now still skips a hang.

## Deviations from plan

- Frontend does not poll Ollama for 8s after spawn; Rust already polls. Avoids a double timeout on the splash.
- Process: continuing to Phase 3 because the execution request was to finish all todos.

## Residual risks / follow-ups

- `ollama serve` spawned as a child may die when the app exits if it wasn't already a service. Acceptable fail-soft; Jeremy usually runs Ollama as a user service.
- Probe uses TCP 11434, not HTTP `/api/version`. A different occupant of that port would look "up."

## Docs updated

Today's devlog only.

## Ready for greenlight? (yes/no + blockers)

**Yes.** Continuing to Phase 3.
