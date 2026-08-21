# Audit — Phase 0 — Remove online updater

- **Date:** 2026-08-21
- **Branch/commit:** `main` / `ecf50eb`
- **Intent:** Strip every runtime path that checks a public update feed or installs an update over the network. Updates for this private app are a local rebuild and reinstall only. Do not add a local auto-updater UI.

## What was done (files)

Deleted:
- `src/components/UpdateCheck.tsx`
- `src/services/updater.ts`
- `src/services/__tests__/updater.test.ts`

Runtime / deps:
- `src/components/compartments/SettingsCompartment.tsx` — Updates section is copy only (`npm run tauri build`)
- `src/components/compartments/__tests__/SettingsCompartment.test.tsx` — asserts no "Check for updates" button
- `package.json`, `package-lock.json` — removed `@tauri-apps/plugin-updater` and `@tauri-apps/plugin-process`
- `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` — removed `tauri-plugin-updater` and `tauri-plugin-process`
- `src-tauri/src/lib.rs` — stopped registering those plugins
- `src-tauri/tauri.conf.json` — removed `plugins.updater` (including `https://updates.myceliainteractive.com/mycelia-time/latest.json`) and `createUpdaterArtifacts`
- `src-tauri/capabilities/default.json` — removed `updater:default` and `process:allow-restart`

CI / docs:
- `.github/workflows/release.yml` — still drafts a private GitHub release on `v*` tags; no `latest.json`, no R2 upload, no signing-key env for updater artifacts
- `docs/reference/packaging-and-updates.md` — rewritten as rebuild/reinstall
- `docs/reference/ai-workflow-map.md` — update-check row removed
- `docs/reference/next-build-wave-plan.md` — note that auto-update was removed, not finished
- `docs/devlog/2026-08-21_devlog.md`

Also committed the prior self-critique (`docs/AUDIT_2026-08-20_full-project-self-critique.md`) so it is not left untracked.

## Tests run / results

- `npm run typecheck` — pass
- `npm test` — **640 passed**, 78 files (updater suite removed; one new Settings test)
- `cargo test --manifest-path src-tauri/Cargo.toml` — **18 passed**, 0 failed

Grep: `checkForUpdate`, `plugin-updater`, `updates.mycelia` are gone from `src/` and `src-tauri/` (including `Cargo.lock`). Residual mentions remain only in historical docs and this audit.

## Manual verification steps

1. `npm run tauri dev` — Settings → Updates reads as rebuild/reinstall, no "Check for updates" button.
2. Confirm the running app does not request `updates.myceliainteractive.com` (DevTools network or a firewall log).
3. Optional: `npm run tauri build` still produces an NSIS installer under `src-tauri/target/release/bundle/nsis/`.

## Deviations from plan

- Did not delete `.github/workflows/release.yml`. Left a local-record draft build with no public endpoint, as the plan allowed.
- Included the 2026-08-20 full-project audit in this commit so it is not orphaned.
- **Process conflict:** CLAUDE.md / INSTRUCTIONS.md still say phases auto-chain. This program follows AGENTS.md + the gated master plan (stop after each audit). The human then asked to complete all phases without waiting, so this run continues into Phase 1 after this file lands.

## Residual risks / follow-ups

- Historical `docs/reference/next-build-wave-plan.md` still describes updater design in later sections (marked do-not-build at the top).
- `tauri-plugin-process` was only used for `relaunch` after update. If something else needed process restart later, it would have to be re-added on purpose.
- GitHub Actions `tauri-action` may still try to attach installer files to a draft release. That is an internal record, not an app update channel.

## Docs updated

Yes: packaging-and-updates, ai-workflow-map, next-build-wave-plan, today's devlog.

## Ready for greenlight? (yes/no + blockers)

**Yes** for Phase 0. No blockers. Continuing to Phase 1 because the execution request was to complete all plan todos.
