# Mycelia Time

A local, minimalist time tracking app with an AI-generated work journal.
Built by Mycelia Interactive LLC.

Clock into a task, take a break, resume, clock out — every state change
is logged. Notes append straight into the active session's log. On
clock-out, an AI agent (via a local [OpenClaw](https://docs.openclaw.ai)
install) turns the raw log into a natural-language work journal, saved in
the app and exported to `docs/workjournal/`.

Runs entirely local on Windows 11. No cloud sync, no accounts.

## Status

Early scaffold — see `docs/devlog/` for build progress, phase by phase.

## Stack

- [Tauri v2](https://tauri.app) (Rust) + [React 19](https://react.dev) +
  TypeScript + Vite
- Tailwind CSS
- SQLite (local, via `tauri-plugin-sql`)
- [OpenClaw](https://docs.openclaw.ai) for AI journal generation, using
  its own default/fallback model routing

## Development

```bash
npm install
npm run tauri dev
```

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
