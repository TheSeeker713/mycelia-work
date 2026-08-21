# Packaging (internal rebuild / reinstall)

Mycelia Time is a private, personal-only app. There is **no online
update check**, no public release feed, and no R2/domain packaging
path. A new version is a rebuild on this machine and a reinstall of
the NSIS installer it produces.

## Windows packaging

`src-tauri/tauri.conf.json` targets NSIS only. Install mode is
`currentUser`, so installing never raises a UAC prompt.

```bash
npm run tauri build
```

produces an installer under `src-tauri/target/release/bundle/nsis/`.
Run that installer to replace the current copy. That is the whole
update story.

## What was removed (Phase 0, 2026-08-21)

The app used to ship `tauri-plugin-updater` pointed at a guessed
`updates.myceliainteractive.com` feed, plus a Settings "Check for
updates" button. That path is gone: no plugin, no endpoint compiled
into the binary, no Settings check, no R2 publish step.

Do not add a local auto-updater UI either. Rebuild and reinstall.
