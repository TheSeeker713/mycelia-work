# Mycelia Time — full project audit and self-critique

**Date:** 2026-08-20
**Scope:** current working tree (Tauri v2 + React 19 + TypeScript + SQLite + OpenClaw/Ollama)
**Kind:** post-mortem, not a status report. Claims below are from the code and docs as they exist today. Nothing here was "fixed in spirit."

This app has a real architecture, a real data model, and a lot of tests. It also ships several user-visible AI paths that can sit there looking dead while work is happening, or not happening, with no honest signal either way. The tests did not catch that because they never asked the question a person would ask: did anything on screen change?

---

## 1. Architecture and data flow

### What actually exists

Frontend Zustand stores own UI state. Repositories own SQLite. Rust owns subprocesses (OpenClaw CLI, Real-ESRGAN, idle time, resource watchdog, journal file export). OpenClaw is never given app-held API keys. Ollama is called two ways: direct `fetch` to `127.0.0.1:11434` (ghost text, capture Layer 0, Grok-off reports) and via OpenClaw `--model ollama/...` (assist, capture Layer 1, check-in).

`src/services/aiQueue.ts` is supposed to be the single-slot lock. Comment in that file: "Every AI/agent call site in the app goes through here." That is not true. Muse does not.

### Layer leaks — High

**Muse bypasses the queue.** `src/components/journal/useMuseSuggestions.ts` calls `ollamaClient.suggestContinuation(text)` directly after its own debounce. `useGhostText` goes through `runAiJob({ kind: "ghost_text", ... })`. A Journal Muse request and a session journal generation can fight the same local GPU/CPU. `docs/reference/ai-workflow-map.md` still lists Muse as queued. The map is wrong.

**Grok-off is not one path.** Session/weekly journals and project status reports skip OpenClaw and call `OllamaClient.generateReport` (90s, one retry). Project assist (`runProjectAssist`), capture Layer 1, and check-in still go through OpenClaw even when Grok is off, paying the ~60s CLI/gateway tax that 16.1 was written to avoid. `resolveModelOverride(false, localModelId)` just stuffs `ollama/${id}` into the CLI. Different call sites, different latency, same Settings toggle.

**`usedFallback` dies at the service boundary.** `routeAiCall` returns `usedFallback`. `runJournalGeneration` / `runProjectReportGeneration` persist `model_used` and `backend_used` only. There is no `used_fallback` column. `LibraryCompartment` and `ProjectsCompartment` render `<ModelBadge>` without `usedFallback`, so the dashed-amber "this was a fallback" treatment only exists in `ModelBadge.test.tsx`.

**`GROK4_MODEL` is dead.** `src/services/openclawClient.ts` exports `GROK4_MODEL = "xai/grok-4.5"` and nothing in the tree imports it. When Grok is on, `resolveModelOverride` returns `undefined` and OpenClaw's own default answers. The Settings placeholder `xai/grok-4.5` is the only place a preferred model string exists, and `preferredModel` defaults to `""`, which disables the router's model-retry loop entirely.

**Resource events are write-only.** Ghost text, capture, and check-in log `throttled` rows. Nothing in Settings or the shell reads `resourceStore.events`. The audit trail exists for tests, not for Jeremy.

**Settings ownership is inverted.** `GROK4_ENABLED_KEY`, `LOCAL_MODEL_ID_KEY`, and `PREFERRED_MODEL_KEY` live in `openclawClient.ts` so generation code can read them via `repos.settings` without importing the Zustand store. Fine as a workaround. It also means the "which model" concern is split across client, router, two generation modules, and the Settings UI, with no single source of the current Grok id.

### Single-instance, tray, always-on-top, lifecycle — Medium / Low

These are in better shape than the AI surfaces.

- **Single-instance** (`tauri_plugin_single_instance` in `src-tauri/src/lib.rs`): a second launch shows the existing window. Correct for a tray-resident app.
- **Close hides, does not quit.** `WindowEvent::CloseRequested` calls `prevent_close` + `hide`. Emergency exit is `window.destroy()` (DeviceBar) and `Ctrl+Shift+Q` (global shortcut). Tray menu "Quit" calls `app.exit(0)`.
- **Always-on-top** defaults **off** in `tauri.conf.json` (`alwaysOnTop: false`). Pin is a DeviceBar toggle via `useWindowControls`. Matches "optional, not always."
- **Startup focus:** `show_main_window` after tray setup, because Windows often leaves a terminal-launched window in the taskbar.
- **OpenClaw daemon rule is followed on the multi-turn path.** `ensure_daemon` / `release_daemon` only stop a gateway this app started. `run_openclaw_agent` (journals, reports, assist, capture Layer 1) wakes the gateway and **leaves it up** on purpose (comment in `openclaw.rs` around the old 4–9s restart tax). `SystemStartup` also calls `ensureDaemon()` and never releases. Fine for an always-on pocket book. It does mean a "Continue now" skip still leaves a gateway this app may have started.
- **Cancel is wired** through `CallCancelState` into `openclaw_call_agent`, and `run_openclaw_agent` delegates to that, so "Quit now" can kill a journal generation. Direct Ollama `fetch` calls are **not** abortable from that path.

**High (lifecycle + status):** `useAiInFlight` treats a journal as in-flight only when `status === "pending"`. Retry does not set pending (see §2). Exit-confirm still sees the queue's `running` job, so quit-now is not completely blind. The Library row is.

**Medium:** Todo due alerts are a Windows `sendNotification` plus spoken cue (`useTodoReminders.ts`). CLAUDE.md asked for tray-triggered pop-outs, dismissed easily, never a blocking modal. What shipped is an OS toast. The window does not come forward.

**Low:** leftover `greet` command in `lib.rs`. `index.html` title is still `Tauri + React + Typescript`.

---

## 2. AI surfaces (highest priority)

### 2.1 Session / weekly journal generation and Retry — Critical

**Verified. Not fixed.**

`journalsStore.generateSessionJournal` and `generateWeeklyRollup` create a `pending` row, `set()` it into state, then call `runJournalGeneration`. The Library paints "Generating…" and `.progress-indeterminate` from `journal.status === "pending"`. That path works.

`retryJournal` does not.

```102:146:src/store/journalsStore.ts
    async retryJournal(journalId) {
      const existing = get().journals.find((j) => j.id === journalId) ?? (await repos.journals.getById(journalId));
      if (!existing) return;
      // ... rebuild prompt ...
      const result = await runJournalGeneration({ /* journalId, no status change */ });
      set({ journals: upsert(get().journals, result) });
    }
```

There is no `markPending` in `journalsRepository`. `runJournalGeneration` assumes the row is already pending and only writes `ok` or `failed` at the end. On Retry:

1. The row stays `failed`.
2. The badge stays "Failed".
3. The Retry button stays enabled. A second click starts a second generation against the same id (last `markResult` wins).
4. `AiQueueTicker` renders only when `queued.length > 0`. A single running job with an empty queue shows nothing. The ticker comment says the in-place Library bar covers that case. Retry never turns that bar on.
5. `useAiInFlight` will not describe this as "Writing your report" via the journal row. It may still pick up `runningJob.label` from the queue.

Clock-out "AI writes it" (`Dashboard.handleAiWritesReport`) closes the dialog and **does not** switch to Library. The manual path does (`setActive("library")`). The slow path is the one with no navigation and, if you are still on Tasks, no in-place pending UI at all.

Weekly roll-up: first click does create pending, so the list can show Generating. The "Weekly roll-up" button itself never disables and never says Writing. Spam-click creates extra pending rows.

**Tests that let this ship:**

- `LibraryCompartment.test.tsx` "shows the failure reason next to a failed journal, and Retry re-runs it" finds the button. It never clicks it. It never asserts "Generating…".
- `journalsStore.test.ts` `retryJournal` awaits the full function and asserts final `ok`. It never inspects store state *during* the call. The optimistic pending update is untested because it does not exist.

Retry also drops the clock-out `brief`. `generateSessionJournal(task, sessionId, brief)` folds Jeremy's steer into the prompt. `retryJournal` rebuilds `buildSessionJournalPrompt({ task, session, events, notes })` with no brief. A failed first attempt cannot be retried with the same steer unless it was also saved as a session note.

### 2.2 Project assist / status reports — High

**Status reports have no Retry.** `ReportsSection` shows `Failed — ${failure_reason}` and nothing else. "Write status report" always `createPending`s a **new** row. Failed rows pile up. `projectsStore` has no `retryReport`.

The generate button *does* have local `generating` / "Writing…" state, and the new row is pending, so first-time generation feedback is honest. That is why Retry on journals feels uniquely broken: journals implemented Retry and then forgot the status transition the first-time path already had.

**No stale-pending sweep for project reports.** Journals get `sweepStalePendingJournals` (3 minutes) on `loadRecent`. Project reports have no equivalent. A reload mid-write leaves "Writing…" forever on that project.

**Assist is a different, weaker backend.** `runProjectAssist` uses `client.runOnce` only, 45s, catch → `null`. No `routeAiCall`, no direct-Ollama fallback. The panel does show "Thinking…" and a real error string. That is one of the few AI surfaces that does loading *and* failure copy. It still pays OpenClaw overhead with Grok off, and a cancel/drop from the queue becomes the same "Couldn't get an answer just now" as a model failure.

Assist notes persist on success (after Jeremy found the original toast-and-discard surprising). Failures are not saved. Fine. Capture-log still records the attempt.

### 2.3 Ghost text (`useGhostText`) vs Muse (`useMuseSuggestions`) — Critical

This is the clearest duplicated-and-diverged implementation in the tree. `useGhostText.ts` even claims the Journal "follows the same rules." It does not.

| Rule | `useGhostText` | `useMuseSuggestions` |
|---|---|---|
| Min chars (`MIN_CHARS_FOR_SUGGESTION` = 12) | Yes | **No.** Fires on any non-empty text (`if (!atEnd \|\| !text) return`) |
| `runAiJob` / drop-if-stale | Yes | **No.** Direct Ollama call |
| Resource pressure | Skip + `logEvent("throttled", ...)` | Skip, **no log** |
| Settings gate | `aiSuggestionsEnabled` | Separate `museEnabled` (Journal header only) |
| Loading / thinking UI | **None** | **None** |
| Fail soft | `catch → null`, console.warn | Relies on client fail-soft; no extra catch |
| Warm-up | `warmUpGhostText` on field mount | Same, on editor+enabled |

Muse was forked from the old zen-mode copy and never rebased onto `useGhostText` after Phase 16.6 extracted the hook. The 2026-08-09 devlog says this out loud: Journal keeps ProseMirror decorations "because a mirror div can't work inside a rich-text document. Two mechanisms, both deliberate." Rendering can stay split. The **lifecycle** (debounce, min chars, queue, pressure, pending flag) should not have.

**Missing loading/thinking.** Neither hook exposes `pending`. `GhostTextField` / `ZenModeEditor` / Journal decorations only paint `suggestion`. A 12s Ollama timeout, a cold `dolphin-phi` load, or a queued-then-dropped ghost job all look identical: nothing happens. Muse is worse because it is not even in the queue, so a journal generation in the background will stall `suggestContinuation` with no ticker and no ghost.

**Silent watchdog on Muse.** Under CPU ≥ 90% or mem ≥ 95% (confirmed 300ms later), Muse returns without logging. Ghost text logs. Capture and check-in tell the user. Muse looks broken.

**Two toggles.** Settings "AI writing suggestions" copy still says "Ghost-text continuations while writing in zen mode." That toggle does not control Journal Muse. Muse is a header chip with its own `journal_muse_enabled` key. Turning suggestions off in Settings leaves Muse on unless it was never persisted and still defaults from the other flag.

**Capture drawer and check-in freeform are still plain `<input>` / `<textarea>`.** "Ghost text everywhere" did not include them.

### 2.4 Capture agent, check-in, resource watchdog — Medium / High

**Capture** (`captureStore.submit`): pressure check first, then `routeCapture` (Layer 0 Ollama classify + Layer 1 OpenClaw in **one** queue slot). Under pressure it sets `phase: "resource_pressure"` and offers `fileAsNoteAnyway`. That is the honest pattern the rest of the app should have copied. Thinking feedback is a "…" on the Go button, not a sentence, but the field disables. Decline vs pressure are distinguishable.

**Check-in** (`CheckInFlow`): pressure → static Tier-0 with a spoken notice. Unreachable / bad JSON → same static dialog, different notice. Connecting UI is a literal `"…"` in faint ink. After a reply it goes back to `connecting` and plays `please_wait`. Weak copy, but it is not a dead button. Adaptive turns use `client.call` (multi-turn session) and `releaseDaemon` on the way out.

**Ghost text / Muse under pressure:** skip with no toast. Ghost text writes `resource_events`. Muse writes nothing. This is the class of bug the workflow map already named ("looks exactly like the feature is broken") and then reintroduced on the Journal fork.

Watchdog thresholds (90/95, double sample) are documented and unit-tested in Rust. The remaining problem is **who surfaces the skip**, not the classifier itself.

### 2.5 Model selection, Grok 4.5 vs 4.6, fallback honesty — High

**Verified. Copy and constant still say 4.5.**

| Location | What it says |
|---|---|
| `openclawClient.ts` `GROK4_MODEL` | `"xai/grok-4.5"` (unused) |
| Settings checkbox | "Use Grok 4.5 (cloud)" |
| Settings help | "Grok 4.5 (Jeremy's own paid subscription)" |
| Preferred-model placeholder | `xai/grok-4.5` |
| `ai-workflow-map.md`, `next-build-wave-plan.md`, tests, fixtures | `xai/grok-4.5` |
| Router `modelMatches` | suffix-tolerant, so `grok-4.6` vs `xai/grok-4.6` would match if anyone set the preference |

With Grok on and `preferredModel === ""` (the default):

1. No `--model` override is sent.
2. OpenClaw's configured default answers (whatever it is today, including 4.6).
3. No model-retry loop runs.
4. `usedFallback` is always `false` on a successful OpenClaw call.
5. If OpenClaw is down, Ollama fallback sets `usedFallback: true`, but that bit is not stored or shown (see §1).

`ModelBadge.friendlyModel` would render `xai/grok-4.6` as "Grok 4.6" if that string were in `model_used`. The lie is the Settings chrome and the unused constant, not the badge formatter.

**Grok-off local picker** is a hardcoded `LOCAL_MODELS` snapshot from `ollama list` on 2026-08-08. No runtime `ollama list`. A model removed from the machine still appears. A newly pulled model does not. `GHOST_TEXT_MODEL` and `CLASSIFY_MODEL` are separate hardcodes (`dolphin-phi:latest`, `hermes3:8b`), independent of the picker.

### 2.6 AI calls that fail with zero or stale UI — summary

| Call | Failure / wait | What the user sees |
|---|---|---|
| Journal Retry | Generation in flight, row still `failed` | Failed + Retry, looks dead |
| Journal first gen, user still on Tasks | Pending row in Library, not visible | Dialog gone, Tasks as before |
| Weekly button while first pending exists | Extra rows / no disable | Button looks idle |
| Project failed report | No Retry | Static Failed line |
| Project pending after crash | No sweep | "Writing…" forever |
| Muse suggestion | Queue miss, pressure, timeout, <12 chars not even a factor | Nothing. Muse chip still "on" |
| Ghost text | Pressure, drop-as-stale, timeout, Origin 403 | Nothing (console.warn only) |
| Assist | `null` | "Couldn't get an answer…" (honest) |
| Capture Layer 1 throw | Fail closed to decline | Decline copy (can look like a content refusal) |
| Check-in | null / pressure | Static fallback + notice (honest) |
| Grok on, wrong model, empty preference | Silent default | Badge shows whatever came back, no fallback styling |

---

## 3. UX and feedback gaps

### Buttons that appear to do nothing — Critical / High

1. **Library Retry** (Critical). Root cause: no pending transition. See §2.1.
2. **Muse on, pause, nothing** (Critical). Root cause: no pending decoration, no min-char explanation, no queue, silent pressure skip. A 1–11 character line never fires on ghost text (correct) and *does* fire on Muse (noise). A 12+ character line on Muse can sit in a raw Ollama call behind a journal job with no ticker (ghost_text is `SILENT` in the queue anyway; Muse is not even queued).
3. **Clock-out "AI writes it"** (High). Dialog closes. Library does not open. No shell-level "Writing your report" unless another job is already queued (ticker) or the user happens to open Library.
4. **Project Failed row** (High). No control. "Write status report" is a different action (new row). Easy to click, think Retry isn't there, and assume generation is broken.

### Missing loading / thinking / pending

- Muse: no.
- Ghost text / zen mode / GhostTextField: no.
- Check-in connecting: `"…"`.
- Capture thinking: Go button `"…"`.
- Assist: "Thinking…" (the one that got this right).
- Journal first-time pending: progress bar (right).
- Journal Retry: none (wrong).
- Project first-time: button "Writing…" plus row "Writing…" (right).

`AiQueueTicker` explicitly hides the single-job case. That design only works if every visible call site has its own in-place indicator. Retry and Muse do not. The ticker cannot save them.

### Silent throttling

Ghost text: logged, not shown.
Muse: not logged, not shown.
Capture / check-in: shown. Treat those two as the template.

### Tray, zen, compartments, pocket-book density — Medium

**Compartment tabs:** seven vertical tabs (Tasks, Notes, Todos, Projects, Progress, Library, Settings) on a 480×680 window (content height 540 after Jeremy asked for "a little taller"). The original mockup was 340×480 with fewer tabs. The pull-tab idea is intact. The density is not a pocket notebook anymore; it is a compressed dashboard with a moss strip.

**Library accordion** (one section open) is the right instinct. **Books** expands to "Not built yet." That is a dead end shipped as a section, not a hidden future.

**Journal lives behind Library → Journal → Open Journal**, then a full-screen TipTap editor. Reports (AI session journals) live in the same compartment under a different name. Two features named "journal" in the data model (`journals` vs `journal_entries` / `DiaryEntry`) and in the UI (Reports vs Journal). The code comments know this is confusing. The chrome still asks the user to hold it.

**Zen exit** is a labeled button plus Escape. Journal zen also has a shortcuts overlay that eats the first Escape. That is correct. Notes zen Escape exits immediately.

**Dark mode:** CLAUDE.md requires a Settings toggle. `src/index.css` has a full `[data-theme="dark"]` palette **and** a `@media (prefers-color-scheme: dark)` rule that applies dark tokens unless `data-theme="light"` is set. `index.html` sets neither. There is no Settings control and no `data-theme` write in TS/TSX. Result: light is **not** forced. An OS-dark machine gets dark without opting in, and there is no way to switch. The design rule was "light default, dark optional." The CSS does the opposite of a default.

**Onboarding / accessibility** still exist despite CLAUDE.md flipping the product to personal-only on 2026-08-06. Not harmful. Extra chrome on a one-user app.

---

## 4. Code quality and process self-critique

### Duplicated logic that should have been shared

1. **Muse vs `useGhostText`** (Critical example). Rendering split is justified. Lifecycle split is not. `useMuseSuggestions.ts` still comments that it is "the same shape of logic" as `ZenModeEditor.tsx`, which no longer contains that logic.
2. **`runLocalReportWithRetry`** copied between `journalGeneration.ts` and `projectAssist.ts` (same 90s, same one-retry, same `usedFallback: false`).
3. **`stripCodeFence` + fail-closed JSON parse** in `captureAgent.ts` and `checkinConversation.ts`.
4. **Filename stamp / slug** is fine where it is. Not the problem.

### Tests that assert DOM presence, not user-visible behavior

The 2026-08-09 devlog already diagnosed this: jsdom has no layout, opaque stacking still passes `getByText`, Muse's old `doc.content.size` guard shipped with green tests. The follow-up tests are incomplete.

- Ghost text: asserts `bg-transparent` and that `suggestContinuation` is called. Does **not** assert a pending/thinking state (there is none). Does not assert computed opacity of the mirror span.
- Journal Muse: "Muse actually fires once the caret is at the end" waits for `suggestContinuation` to be called. It does **not** assert the decoration text is in the document, does not type 12 characters as a contract, does not assert anything while the promise is outstanding.
- Library Retry: button present. Not clicked.
- `journalsStore.retryJournal`: final status `ok`. No pending snapshot.
- `ModelBadge` fallback styling is tested in isolation, then never wired to real rows.

This is how "Retry looks dead" and "Muse never fires" survive a full suite.

### Optimistic updates, status transitions, error recovery

First-time journal/report generation is the good pattern: insert pending, paint pending, resolve to ok/failed, never leave pending on throw.

Retry skipped the first two steps.

`markResult` always writes every column (`model_used`, `content`, `exported_path`, `failure_reason`, `backend_used`) from the patch, defaulting missing fields to `null`. A retry that fails after a previous ok (if that were possible) would wipe content. Failed rows are already empty, so Retry is safe today only because failure already cleared the payload.

`discardPending` deletes rather than failing. Correct for quit-now. It finds **one** pending journal (`find`). Two pending weeklies from a double-click would leave one behind.

Project `generateReport` awaits generation then `loadReports`. No optimistic failure if `loadReports` races. Adequate.

Capture fail-closed-to-decline means "Ollama threw" and "this text is off-topic" share one message. Recovery is: rephrase. There is no "the classifier is down" copy.

### Comments and docs that drift from the code

| Doc / comment | Reality |
|---|---|
| `docs/reference/ai-workflow-map.md`: Muse goes through `aiQueue`, same as ghost text | Muse does not |
| Same map: Grok 4.5 | Copy-level 4.5; runtime is OpenClaw default |
| `useGhostText.ts`: Journal follows the same rules | Journal does not (min chars, queue, pressure log) |
| `useMuseSuggestions.ts`: same shape as zen mode | Zen mode now uses the hook Muse did not adopt |
| `docs/reference/ghost-text-everywhere-plan.md`: three mechanics, nothing for plain inputs, still unresolved | `GhostTextField` exists; plan was not updated |
| `docs/reference/next-build-wave-plan.md`: `model_used` captured but never displayed | `ModelBadge` exists; `usedFallback` still not displayed on real rows |
| Settings AI-suggestions blurb: "zen mode" | Wired to todos, notes, projects, clock-out, manual reports |
| `AGENTS.md`: public repo; other people; **phases never auto-chain**; wait for Jeremy | `CLAUDE.md` / `INSTRUCTIONS.md`: private, personal-only, **phases auto-chain**, one manual pass at the end |
| Design README: 340×480, notes auto-timestamp into books, recap card | Window is 480×680; books unbuilt; no recap card |

`packaging-and-updates.md` is unusually honest (placeholder domain, secrets Jeremy must set). It has not been executed. That is an ops gap, not a prose lie.

### Phase / process rules that produced this

Auto-chain after 2026-08-09 removed the only gate that would have caught Retry and Muse: a human clicking the button in a real window. Automated tests plus "audit the diff against intent" were supposed to replace that. Diff audit does not click Retry. Tests that never click Retry do not either.

The Muse/ghost split is a phase artifact: zen-mode ghost text (Phase 8), Journal Muse (16.5), extract `useGhostText` + everywhere (16.6). The extract did not migrate the Journal. The step closed out green. The divergence shipped.

Grok 4.5 strings were true when written. Nothing in the process revisits constants when the subscribed model moves. `GROK4_MODEL` being unused means even a constant bump would not change runtime until Settings/OpenClaw default do.

Judgment-call rule ("don't ask Jeremy, put it in the devlog") is how "two mechanisms, both deliberate" avoided a shared lifecycle. The deliberate part was rendering. The accidental part was dropping the queue and the 12-char guard.

### Hardcoded names, magic numbers, settings keys that will age

- `xai/grok-4.5` / "Grok 4.5" in UI and `GROK4_MODEL`
- `LOCAL_MODELS` machine snapshot (2026-08-08)
- `GHOST_TEXT_MODEL`, `CLASSIFY_MODEL`
- `SUGGEST_TIMEOUT_MS = 12000`, `LOCAL_REPORT_TIMEOUT_SECS = 90`, OpenClaw 180s + 75s Rust grace, check-in 60s, assist 45s, capture 30s
- Watchdog 90 / 95 / 300ms
- `STALE_PENDING_THRESHOLD_MS = 3 * 60 * 1000` (journals only)
- `MIN_CHARS_FOR_SUGGESTION = 12` (ghost only)
- `OLLAMA_URL = http://127.0.0.1:11434` plus a **machine env var** `OLLAMA_ORIGINS` documented in a comment, not in setup
- Real-ESRGAN `D:\_Dev\AI-Setup\upscaler\realesrgan-ncnn-vulkan`
- Updater endpoint `https://updates.myceliainteractive.com/mycelia-time/latest.json` (docs: guessed)
- Settings keys scattered: `grok4_enabled`, `preferred_model`, `journal_muse_enabled`, `ai_suggestions_enabled`

---

## 5. Packaging, updates, and operational reality

### NSIS / updater / signing / R2 — High (ops), code is ready

`tauri.conf.json`: NSIS only, `currentUser`, `createUpdaterArtifacts: true`, pubkey present, endpoint compiled in. `.github/workflows/release.yml` builds on `v*` tags, runs typecheck + vitest + cargo test, drafts a GitHub release, assembles `latest.json`, uploads to R2.

**Not done in the world, only described:**

- Cloudflare bucket + custom domain. Docs say do not use r2.dev.
- `UPDATE_BASE_URL` repo variable. Workflow throws if missing.
- Secrets: `TAURI_SIGNING_PRIVATE_KEY` (file at `C:\Users\jroba\.tauri\mycelia-time.key`, **no password**), R2 keys, bucket name.
- App version is `0.1.0`. No evidence a `v*` tag has published a real feed.
- Settings `UpdateCheck` is manual-only, fails soft to "couldn't check." An unconfigured feed looks the same as "up to date" from a glance unless the copy is read. Check `UpdateCheck.tsx` when implementing: unreachable must stay distinct.

Until R2 and the domain exist, auto-update is dead code behind a button.

### Local-only constraints — High for any install that is not this machine

This is a personal workstation app. The tree assumes:

- OpenClaw CLI on PATH, gateway optionally already a Scheduled Task. App will start it; will not stop one it did not start. `runOnce` leaves it up.
- Ollama listening on 11434 with **this machine's** `OLLAMA_ORIGINS` including `http://tauri.localhost` (prod WebView) / `http://localhost:1420` (dev). A packaged WebView2 origin mismatch is a silent ghost-text 403 (`ollamaClient.ts` comment, 2026-08-08).
- Models in `LOCAL_MODELS` plus `dolphin-phi:latest` for ghost text. Missing model → fail soft / failed row, depending on call site.
- Voice-Agent (`ensure_voice_agent_running` / `start_all.ps1`) for Kokoro/Piper. Startup waits up to 20s then continues.
- Real-ESRGAN at a **literal developer path**. Packaged installs will report "not installed" with that path in the message. Gallery upscale cannot work off this PC without a Settings path or a bundled binary.
- Video gen: anonymous Hugging Face Space, optional fal/Replicate keys in Settings.

CLAUDE.md: "never the app's own API keys, and never stop a daemon it didn't start itself." Both still hold. Personal-only also means these paths are acceptable **if documented as machine contract**. They are documented in comments and `packaging-and-updates.md`, not in a single "this PC must have" checklist at the repo root.

---

## 6. Prioritized fix list (user impact first)

1. **Critical — Journal Retry pending.** Before `runJournalGeneration`, set the row to `pending` in SQLite and in `journalsStore`, clear `failure_reason` for display, disable Retry. Same for weekly. Prevent double-submit. Persist (or re-apply) the clock-out brief on retry if you still have it; if not, say so in the prompt path rather than silently dropping it.
2. **Critical — Muse lifecycle parity.** Drive Muse off the same debounce / min-chars / `runAiJob(ghost_text)` / pressure-log path as `useGhostText`. Keep ProseMirror decorations. Expose `pending` and paint a caret-adjacent thinking affordance (opacity ghost "…" or `aria-busy`) until suggestion or failure. Do not leave Muse as a second scheduler.
3. **High — Ghost-text pending affordance.** Same `pending` flag on `useGhostText` for zen mode and `GhostTextField`. Tab/accept unchanged. Empty suggestion + pending must not look like "AI is off."
4. **High — Clock-out AI path.** After "AI writes it", switch to Library the same way "I'll write it" does, so the pending bar is on screen. Optionally keep the dialog open on the generating row instead of racing back to Tasks.
5. **High — Project report Retry + stale sweep.** Either Retry-in-place (pending on the same id) or hide Failed and only keep the latest. Sweep stale pending like journals.
6. **High — Grok 4.6 honesty.** Replace UI copy, placeholder, and `GROK4_MODEL`. Decide whether Grok-on sends an explicit `--model` (recommended) or keeps trusting OpenClaw's default. Default `preferredModel` should not be empty if the toggle's whole point is a named cloud model.
7. **High — Persist and show `usedFallback`.** Column or derive from `preferred_model` vs `model_used` at render time. Pass it into `ModelBadge` from Library and Projects.
8. **High — Dark mode actually optional.** Set `data-theme="light"` as the real default. Add the Settings toggle CLAUDE.md already describes. Stop following `prefers-color-scheme` without an explicit choice.
9. **Medium — Resource throttle toast for ghost/Muse.** One line, auto-dismiss, same voice as capture's pressure message. Stop logging into a table nobody opens.
10. **Medium — Align Grok-off backends.** Assist (and consider capture Layer 1 / check-in) should use direct Ollama when Grok is off, or the Settings copy should say those paths still go through OpenClaw.
11. **Medium — Settings copy and one suggestions master switch.** "Zen mode" blurb is false. Decide whether Muse is independent; if yes, say so in Settings.
12. **Medium — Weekly button disable** while a weekly pending exists. Capture/check-in connecting copy ("Thinking…" not "…").
13. **Medium — Docs sync.** `ai-workflow-map.md` Muse/queue row; `ghost-text-everywhere-plan.md` status; `AGENTS.md` vs `CLAUDE.md` process and public/private; Grok version strings.
14. **Low — Books section.** Hide until built. `greet` / HTML title. `LOCAL_MODELS` from `ollama list` or a Settings text field. Real-ESRGAN path from Settings. Updater domain/secrets (ops, not a code puzzle).

---

## 7. Process self-critique

The 2026-08-09 process change (phases auto-chain, one manual `tauri dev` pass at the very end) optimized for not bothering Jeremy. It also removed the only check that cares whether a button *feels* dead. "Audit the diff against intent" cannot see that Retry never `set`s `pending`. "Full suite green" cannot see it if the test never clicks Retry and never samples store state mid-await.

Two other process habits made this worse:

**Fork then extract, don't migrate the fork.** Muse shipped as a copy. `useGhostText` shipped as the shared hook. The Journal was left behind with a comment that it "follows the same rules." The suite added "was `suggestContinuation` called?" which is the wrong question for a feature whose failure mode is "I don't see anything."

**Presence tests after a visibility bug.** The opaque-textarea incident was written up clearly in the 2026-08-09 devlog, including "jsdom has no layout engine." The new tests still stop at className and mock call counts. Nobody added: click Retry → expect "Generating…"; type in Journal → expect a thinking decoration before the suggestion; `usedFallback` on a row rendered by Library.

**Conflicting agent instructions.** `AGENTS.md` still says stop at phase end and wait. `CLAUDE.md` / `INSTRUCTIONS.md` say auto-chain. An agent that reads the wrong file will do the wrong close-out. The process bug is now in the repo, not just in chat.

**Constants as archaeology.** Grok 4.5, `LOCAL_MODELS`, the Real-ESRGAN path, and the guessed updates domain are snapshots of one machine on one day. Nothing in the phase checklist says "re-read Settings copy against the live OpenClaw default."

What the process got right: fail-closed capture, check-in static fallback with a spoken reason, first-time pending rows, `backend_used` column, spawn_blocking so generation does not freeze the window, single-instance + hide-to-tray. Those were designed with a user in the loop. Retry and Muse were designed with a test in the loop.

---

## 8. Recommended next commits

Concrete, in impact order. Do not bundle 4.6 copy-edits with Retry.

**Commit 1 — Retry actually pending**
- Add `journalsRepository.markStatus(id, "pending")` (or `markResult` that does not null out every column).
- `retryJournal`: write pending, `set(upsert)`, then `runJournalGeneration`.
- Disable Retry / hide it while pending. Guard against a second in-flight retry on the same id.
- Test: click Retry in `LibraryCompartment`; assert "Generating…" and `.progress-indeterminate` *before* the fake client resolves. Store test: spy a deferred `runOnce` and assert `status === "pending"` while awaited.
- Optional same commit: `handleAiWritesReport` calls `setActive("library")`.

**Commit 2 — Project reports Retry + stale sweep**
- Mirror journals: `retryReport(id)` remakes pending on the same row, or a Retry button that does.
- `sweepStalePendingProjectReports` on `loadReports` / `loadProjects`.
- Test the Failed → pending → ok path in the compartment, not only in `projectAssist.test.ts`.

**Commit 3 — Shared suggestion scheduler + thinking UI**
- Extract the debounce / min-chars / pressure / `runAiJob` body from `useGhostText` so Muse can call it and only handle `setMuseSuggestion`.
- Return `{ suggestion, pending, ... }`.
- Journal: decoration or widget for pending (muted ellipsis at caret). `GhostTextField` / zen: same, visually distinct from placeholder.
- Muse: log throttles like ghost text.
- Tests: pending true while the Ollama promise is outstanding; no `suggestContinuation` below 12 chars in Journal; pressure skip logs an event.

**Commit 4 — Model truth**
- `GROK4_MODEL = "xai/grok-4.6"` (or whatever OpenClaw actually has; confirm with `openclaw models status`, do not guess twice).
- Settings strings and placeholder.
- When Grok is on, pass that id as `model` and/or default `preferredModel` to it so `modelMatches` and retries mean something.
- Persist fallback (column or render-time compare) and pass `usedFallback` from Library and Projects.

**Commit 5 — Theme default + Settings toggle**
- `document.documentElement.dataset.theme = "light"` unless the user saved dark.
- Settings control. Persist `theme`. Remove unsolicited `prefers-color-scheme` override, or only use it when the setting is "system."

**Commit 6 — Docs and process files**
- Fix the Muse/queue row in `ai-workflow-map.md`.
- Mark `ghost-text-everywhere-plan.md` as done/partial with pointers to `useGhostText` / Muse remaining work.
- Make `AGENTS.md` match `CLAUDE.md` on private/personal and auto-chain (or explicitly split "Cursor cloud agents" vs this repo).
- One short "machine contract" section: Ollama origins, OpenClaw, models, Real-ESRGAN path, updater domain still placeholder.

Do not start a packaging/R2 commit until Jeremy has actually created the bucket and set the domain. The code is waiting on the world, not the other way around.

---

*End of audit. No code was changed in this pass except this file.*
