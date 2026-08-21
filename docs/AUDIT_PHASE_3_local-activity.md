# Audit — Phase 3 — Local activity engine

- **Date:** 2026-08-21
- **Branch/commit:** `main` / `f46b3bc`
- **Intent:** Background, offline activity log. App name, window title, optional URL, idle. No screenshots/keylogging/clipboard. Not through aiQueue. Settings + tray pause.

## What was done (files)

- `src-tauri/src/activity.rs` — `sample_foreground_activity` (Win32 foreground + sysinfo process name + user_idle). `url` is always null for now.
- `src-tauri/src/lib.rs` — command + tray Pause/Resume emitting `activity-capture-pause`
- Schema `activity_events` + `src/data/repositories/activityEventsRepository.ts`
- `src/services/activityCapture.ts` — `shouldRecordSample` (enabled/paused/exclude)
- `src/hooks/useActivityCapture.ts` — 5s poll, persist locally
- Settings: enable, pause, exclude, last 6 samples
- Dashboard mounts the hook after the rest of the shell is up

## Tests run / results

- typecheck pass
- **656** vitest passed
- **21** cargo tests passed

## Manual verification steps

1. Run the app, switch to another window, wait ~5s, Settings → Activity shows that app.
2. Tray → Pause activity capture — list stops growing.
3. Exclude `Code.exe` — Cursor samples drop.

## Deviations

- Browser URL omitted (plan allowed). Window title often includes the page title.
- Sampling is a Tauri command polled from JS rather than a Rust thread writing SQLite, so the SQL plugin stays single-owner.
- Continuing to Phase 4 without a stop.

## Residual risks

- `sys.refresh_processes(All)` every sample is heavier than a single-pid lookup. Fine at 5s.
- Tray emit requires the webview to be running; if the window is hidden that's still true.

## Docs updated

Today's devlog.

## Ready for greenlight?

**Yes.** Continuing.
