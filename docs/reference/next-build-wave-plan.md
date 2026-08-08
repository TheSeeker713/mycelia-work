# Next build wave: 11+11 revision, gamification, AI-backend transparency/pluggability, auto-update

> **Handoff note (2026-08-06):** this app is **desktop only** — no
> Android companion app. The personal Android companion app that was
> designed below as Section 2A is cut from scope entirely; that section
> is kept below, struck through, as a record of the design work in case
> it's ever revisited, not as something to build. Jeremy wants this
> build wave moving soon — treat the phase sequencing at the bottom as
> the priority order. This doc is a copy of the working plan handed off
> for continued work (originally drafted in a Claude Code planning
> session); the repo itself is moving from public to private — see
> Jeremy directly for current repo status before assuming anything about
> public distribution below (Section 3 Phase B in particular was written
> against a "this app is public" assumption that may no longer hold).
>
> **Update (2026-08-06):** the repo is now actually private (flipped via
> `gh repo edit`). Also, **the entire 11+11 plan (Section 1 below) is
> cut** — Jeremy revised the gamification asset pipeline directly (see
> `assets/gamification/README.md`) and no longer needs a hidden-unlock
> gate or a DLC canvas to reach adult-content assets; that content now
> just lives in the gamification system's normal, visible reward flow.
> The hidden-unlock system that already existed in the app (the old
> 18+ mechanic Section 1 was going to revise into 11+11) has been
> **removed entirely, not revised** — `HiddenUnlockPanel.tsx`,
> `rewards.rs`, `rewardsClient.ts`, the Help menu's "this should not be
> here" entry, and the `rewardsUnlocked`/`eighteenPlusEnabled` settings
> keys are all gone from the codebase as of this update. Section 1 below
> is kept only as a historical record of that design — do not build any
> of it.

## Context

Phases 0-11 are done, tested, and pushed. This plan covers everything
Jeremy raised in the next planning pass, across several messages
tonight:

1. **The 18+ hidden unlock gets revised** — same infrastructure, new
   sequence ("11+11", a play on 11:11), a new password prompt (the
   spoon-boy riddle from *The Matrix*), and the old 18+ checkbox/asset
   UI is retired in favor of a placeholder "11+11" tap that will later
   open a full DLC media canvas — that canvas itself is explicitly
   **not** built now, only the tap and an empty placeholder screen.
2. **Gamification** — XP, levels, streaks, achievements, stickers —
   the feature Jeremy said he'd "purposely withheld" until other things
   worked. He's said twice now this needs a real back-and-forth
   conversation before it gets planned, not a document — that
   conversation hasn't happened yet (Section 2 is a placeholder). The
   existing Settings "Rewards" section (currently 18+-only) gets
   repurposed as the home for gamification reward assets specifically
   — a **separate system** from the 18+/DLC canvas, with **no
   hidden-unlock gate of any kind**, confirmed explicitly.
3. **AI-backend transparency and retry/fallback** — Jeremy noticed
   journal generation "felt slow, like a local model was being used."
   A live, read-only check tonight against the actual running OpenClaw
   config (`openclaw models status --json`) found `"missingProvidersInUse":
   ["xai"]` — a real, plausible explanation: the xAI OAuth profile may
   not be resolving at call time, silently landing on OpenClaw's own
   Ollama fallback chain (`hermes3:8b`, `dolphin3:8b`, etc.) instead of
   Grok 4.5, with nothing in the UI ever showing that happened. The
   data (`model_used`) has been captured in the database since Phase 6
   but is never displayed anywhere — confirmed via a full grep, zero
   UI references.
4. **A pluggable AI backend + onboarding** — designed against the
   assumption this app stays public; confirm that's still true before
   building it (see handoff note above). Jeremy's own OpenClaw+Grok 4.5
   setup is his personal paid subscription; other users won't have it
   and shouldn't be assumed to. Onboarding needs a real "which AI
   backend do you have" step: OpenClaw, Ollama, LM Studio, or a cloud
   API with the user's own key.
5. **Auto-update** — both automated and manual (user's choice which
   mode), tradeoffs laid out rather than picked for him.
6. ~~A personal Android companion app~~ — **cut, this build is desktop
   only.** Original design kept in Section 2A below for the record.

**Explicitly out of scope for this plan**, confirmed directly by Jeremy:
- **MyKaia** — a separate Flutter/Dart ecosystem (`mykaia-app`,
  `mykaia-character`, `mykaia-web`) that parts of this app will
  eventually become a module of, as a new `mykaia-task` repo. Jeremy is
  handling that conversion himself via Cursor. Nothing in this plan
  touches it, converts anything to Flutter, or creates that repo.
- **Quest 3 / VR** — deferred per Jeremy's own call; may end up folded
  into the Kaia project instead of this one. Noted here only so it
  isn't forgotten, no design work done on it now.
- **Android companion app** — see handoff note above. Cut entirely.

**Designed now, built later:** the DLC infinite-canvas media viewer
(draggable thumbnails, photo/music/video players) that the "11+11" tap
will eventually open. Jeremy explicitly said this "requires a new phase
and build," deferred until he's acquired and set up the real assets —
but this plan **does** design the extension point now (Section 1) so
that future phase is a real plug-in, not a from-scratch build.

---

## Section 1 — ~~Revise the hidden unlock: 18+ → "11+11"~~ (CUT — see handoff note)

**Files:** `src/components/HiddenUnlockPanel.tsx`, `src/components/MenuBar.tsx`
(entry point text, unchanged path: full screen → Settings → Help →
"this should not be here" → blank panel), `src/components/compartments/
SettingsCompartment.tsx` (`RewardsSection` gets rewritten), `src-tauri/
src/rewards.rs` (password hash comment/constant unchanged — same
password, "there is no spoon" — only the *prompt text* around it
changes, which lives in the frontend, not Rust), `src/store/
settingsStore.ts` (rename/retire the `eighteenPlusEnabled` key).

**Sequence change:** replace the old "3 clicks then type 111" with:
type `1`, `1`, Space, `1`, `1`, Enter on the blank panel — no clicks at
all now. Same "zero visual feedback until it's right" rule. Any wrong
key resets silently, exactly like today.

**Password prompt copy:** the first half only of the riddle from *The
Matrix*'s waiting-room scene, spoken by the boy bending the spoon —
Jeremy confirmed reproducing this verbatim is fine (same "public repo,
doesn't matter" call he made about the original secret — recheck this
call now that the repo is going private, though the reasoning likely
still holds), and confirmed the quote stops before the second half
("Then you'll see it is not the spoon that bends...") — that part is
omitted entirely:

> "Do not try and bend the spoon. That's impossible. Instead, only try
> to realize the truth... There is no spoon."

Password stays the same: **"there is no spoon"**.

**UI changes on success:**
- The old `RewardsSection`'s 18+ checkbox and asset-count display are
  **removed entirely** — not hidden, actually deleted.
- The existing "Rewards" label/section in Settings is **kept and
  repurposed** — it becomes the future home for gamification reward
  assets (Section 2 below), not 18+ content.
- A **new**, separate element appears in pocket-mode Settings after a
  successful unlock: a button/tap labeled "11+11". Clicking it opens a
  full-screen, currently-empty placeholder canvas (just a blank screen
  with an obvious way back out, same exit pattern as zen mode) — no
  thumbnails, photo/music/video players, or drag-and-drop yet. That's
  the deferred future phase.
- `settingsStore`: retire `eighteenPlusEnabled`/`EIGHTEEN_PLUS_KEY`
  entirely (no more 18+ concept); `rewardsUnlocked` stays (still gates
  whether the "11+11" tap is visible at all, same as it gated the old
  Rewards section).

**Backend:** `rewards.rs`'s asset-storage functions (`rewards_dir`,
`list_reward_assets`, `read_reward_asset`, local `app_data_dir`
storage, never in the repo) are **kept as-is** — they become the
storage mechanism for the future DLC canvas content when that phase
arrives, not deleted. `RewardsClient`/`rewardsClient.ts` stay
unchanged for the same reason.

**Verification:** update `HiddenUnlockPanel.test.tsx` for the new
sequence, `SettingsCompartment.test.tsx` for the removed 18+ toggle and
the new "11+11" tap + placeholder canvas, `Dashboard.test.tsx`'s
existing end-to-end unlock test for the new keystrokes and the new
post-unlock UI. Real quick manual check: Jeremy runs the sequence once
himself.

### Designing the DLC canvas extension point now, building it later

Not building the canvas itself this round, but shaping the placeholder
so the real thing plugs in cleanly when Jeremy has assets, instead of
becoming a rewrite:

- **Component boundary set now:** the placeholder screen (opened by
  the "11+11" tap) is its own component, `src/components/DlcCanvas.tsx`,
  full-screen, same exit pattern as zen mode — even though today it
  renders nothing but blank space + an exit control. The future build
  replaces *only this component's internals*; the tap, the unlock gate,
  the full-screen entry/exit wiring in `Dashboard.tsx` all stay exactly
  as built now.
- **Asset storage shaped for the real thing:** `rewards.rs`'s existing
  `list_reward_assets`/`read_reward_asset` functions already return a
  flat filename list + base64 `data:` URIs — generic enough to back
  photos, audio, and video without changing their shape now. The
  future phase's real work is almost entirely frontend (the infinite
  canvas, drag-and-drop, the photo/music/video viewer components) —
  the backend asset-serving plumbing this plan builds for Section 1
  doesn't need touching again later.
- **Desktop-only, deliberately:** the canvas is explicitly
  full-screen-only, consistent with the whole app being desktop-only.
- **Data model left alone for now:** no `dlc_assets` table or asset
  metadata schema is designed yet — deferred to the real build phase,
  once Jeremy knows what the actual content and its properties look
  like (a photo needs different metadata than a song). Filesystem-listing
  today's `list_reward_assets` already provides is enough for a blank
  placeholder to exist truthfully (an empty folder returns an empty list).

---

## Section 2 — Gamification core

Real design, after the actual back-and-forth Jeremy asked for. No
hidden-unlock gate of any kind on any of this — visible, ordinary
feature, unlike Section 1's 11+11 canvas. Local-file asset storage
follows the same *pattern* `rewards.rs` already uses (not the same
folder, not gated the same way) for holding placeholder-then-real
sticker/badge images.

### 2.1 — XP sources (confirmed structure)

| Source | XP | Notes |
|---|---|---|
| Clock in | small flat amount (proposed 5) | Just for starting a session |
| Clocked time, per hour | proposed 10/hr | Calculated from elapsed duration at clock-out, not accrued live |
| 4-hour cumulative mark, same calendar day | bonus (proposed +20) | Summed across *all* sessions clocked that day, not just one session |
| 8-hour cumulative mark, same calendar day | bonus (proposed +50) | Same day-level summing |
| Note written | small (proposed 2) | Existing Notes feature |
| Personal journal entry written | word-count based — a starting reward for beginning an entry, more for more words written | The **new** journal feature below — not the existing AI-generated work journal, see 2.2's naming note. **Only manually-typed words count** — any text accepted via the journal's Tab-triggered AI auto-suggestion (same pattern as `ZenModeEditor.tsx`'s ghost text) is excluded from the word count entirely, confirmed |
| Project created | small (proposed 5) | Setting one up |
| Project finished (status → done) | bigger (proposed 40) + a sticker | Real completion, not setup |
| Todo completed | proposed 5 | Completion only — creating a todo earns nothing, confirmed |
| Daily use | small (proposed 5) | Any day with at least one real action (clock-in, todo, note, etc.) |
| 7-day use streak | bigger + weekly sticker | See 2.3 for how gaps are handled |
| 30-day use streak | bigger still + monthly sticker | Same |

All proposed numbers are a first pass, easy to retune in one constants
file (`src/services/gamification.ts`) — flag anything that reads wrong
once you see it in practice rather than treating these as final.

### 2.2 — New feature surfaced mid-brainstorm: a real, user-written journal

Note/journal are being split into two genuinely different things —
worth naming carefully so the two don't collide in code or in the UI:

- **"Work journal"** (existing, unchanged) — the AI-generated summary
  written automatically on clock-out, currently in the Library
  compartment (`journals` table, `journalGeneration.ts`). Stays exactly
  as it is.
- **"Personal journal"** (new, what Jeremy just described) — a real,
  user-*authored* entry: a tab inside the Notes card, clicking it
  expands into a full journal-entry editor. Rich-text (RTF-style)
  editing with a real formatting toolbar, plus AI integration —
  "listeners and auto suggestions" — full-screen and desktop-only.

This is real, well-formed scope Jeremy explicitly flagged as "a new
feature I just thought of" mid-conversation — **not built in this
pass**. Capturing it now, precisely, as its own future phase (same
treatment as the DLC canvas: designed enough to not be lost, not
implemented yet) rather than folding a rich-text editor + a second AI
integration surface into an already-large plan. One thing worth
resolving before that phase starts, not now: what exactly "listeners
and auto suggestions" means beyond ghost-text-while-typing (which
`ZenModeEditor.tsx` already does for Notes) — live audio listening, or
just the same suggestion pattern applied to a richer editor? Needs its
own short conversation when that phase comes up.

Gamification's XP hook for this (2.1's "personal journal entry
written") only activates once that feature exists — no XP source is
dead code in the meantime, it's simply unreachable until the journal
feature ships.

### 2.3 — Levels, badges, and the exponential-vs-cap tension

**Cap: level 111** (confirmed) — fits the 11:11 theme already running
through tonight's changes.

**The tension:** true exponential growth (each level costing some fixed
multiple more XP than the last) and a level-111 cap don't coexist
sanely — literal doubling from a 100 XP level 2 would put level 111
somewhere past 10^30 XP, meaningless for a real person's usage. Reading
"exponential, more challenging as progress grows" as the actual intent
(each level noticeably harder than the last) rather than literal
doubling, proposing a **tempered curve** instead — cumulative XP for
level *N*: `100 * (N-1)^1.6`, rounded. Sample checkpoints so the pacing
is checkable against real numbers, not just a formula:

> **Correction (2026-08-06, during Phase 13 implementation):** the
> table below was recomputed against the actual formula — the original
> planning-session numbers didn't match `100 * (N-1)^1.6` (a mental-math
> error, not a formula change). The qualitative pacing described in the
> right-hand column still holds at the corrected numbers.

| Level | Cumulative XP needed | Roughly... |
|---|---|---|
| 2 | 100 | matches your anchor exactly |
| 5 | 919 | a solid first week or two of real use |
| 10 | 3,363 | a month or two in |
| 25 | 16,156 | several months of consistent use |
| 50 | 50,619 | a year-ish of regular use |
| 111 | 184,599 | a genuine long-term milestone, years out |

If that pacing feels off once you see it laid out (too slow, too fast,
front-loaded wrong), the growth exponent (`1.6` above) is the one
number to adjust — flag it and it changes everywhere at once.

**Badges vs. stickers, now two distinct reward categories:**
- **Badges** — earned by leveling up, confirmed cadence: **level 1,
  level 2, level 5**, then **every 5 levels from 10 onward** (10, 15,
  20, 25, ... 110), plus a **special completion badge at the level-111
  cap** — 25 badges total (1 + 1 + 1 + 21 from the 10-to-110 run + 1
  at 111). Level 111 *also* unlocks "special access to something we
  have yet to build" — not designed further per Jeremy's explicit call
  ("don't ask me because i haven't figured that out yet"). Built as a
  generic extensibility hook now — a `features_unlocked_at_level_111`
  style flag/marker with nothing real behind it yet, same "build the
  plug, not the thing that plugs in" treatment as the DLC canvas above
  — so whatever that future feature turns out to be, it has something
  real to check against rather than needing new plumbing later.
- **Stickers** — earned by milestone/achievement completions (project
  finished, streak tiers, "welcome back," etc. — see 2.1 and 2.4).

**Achievement pop-up:** a timed toast on unlock (proposed ~4-5 seconds,
matching `ShortIdleToast`'s existing visual language), then fades —
confirmed, matches what you asked for.

### 2.4 — No punishment, only rewards — and "coming back" is itself rewarded

Confirmed design rule: nothing here ever takes XP away, resets a level,
or shows a negative state. A gap in usage just means no *new* rewards
accrue during it — streak counters (2.1's daily/weekly/monthly use)
simply pause rather than reset to zero.

**"Welcome back" mechanic** (new, per your explicit ask that returning
after a gap should itself be encouraged): after an absence of roughly
3+ days, the next real action (clock-in, or just opening the app)
triggers its own small reward — a flat XP bonus + **one of 10 distinct
"welcome back" stickers, chosen at random each time** (confirmed
re-earnable after every qualifying gap, not one-time — a pool, not a
single fixed sticker, so it stays a little surprising instead of
repeating the exact same reward every time you come back) + a warm,
specific voice line, not a generic one. Same spirit already built into
the forgot-to-clock-out check-in (`checkin-conversation-guide.md`'s
"forgetting is normal, not a failure") extended into gamification.

### 2.5 — Voice cues: AOL-style Welcome/Goodbye, holding on exit

Two things here connect directly to the **already-planned** remaining
voice cues phase in the existing roster (see the phase sequencing table
below) — this isn't new phase scope, it's added specificity to a phase
that already listed "welcome" and "goodbye" as pending cues:

- Corrected model, per Jeremy: AOL said exactly two things — "Welcome"
  on login, "Goodbye" on logout. ("You've got mail" was cited only as
  an illustration of how AOL's cue system worked — explicitly **not**
  a request to add a mail-style notification cue to this app. Nothing
  resembling it is in scope here.)
- **"Welcome"** plays on every app launch (the login-equivalent moment
  here), not just the first time ever.
- **"Goodbye"** plays on exit, and — this is the real behavior change —
  **the app now waits for the cue to finish playing before it actually
  closes**, rather than cutting audio off mid-line. Ties directly into
  2.6 below, since "hold before closing" and "don't lose in-flight AI
  work" are the same kind of problem.

### 2.6 — Emergency exit stops being instant

Real, standalone behavior change to `useWindowControls.emergencyExit()`
(currently: one click, `getCurrentWindow().destroy()`, no confirmation,
no awareness of in-flight work) and its trigger points in
`DeviceBar.tsx`/`MenuBar.tsx`.

**New flow on clicking emergency exit:**
1. A real confirmation dialog — "Are you sure you want to exit?"
2. If anything AI-related is currently in flight (a `pending` journal,
   a `pending` project report, an active check-in/capture-agent call —
   a new lightweight aggregate check across the relevant stores), the
   dialog says so specifically, not just the generic question.
3. Three real options, not just yes/no:
   - **Wait for it to finish, then exit** — the "slow exit": the
     dialog stays open (or shows a waiting state) until generation
     resolves, then closes for real.
   - **Hide to tray instead** — same as a normal window close today,
     offered explicitly here too rather than making tray-hiding only
     reachable by *not* clicking the emergency button.
   - **Quit now anyway** — kills the in-flight generation for real
     (this is exactly what Section 3's Rust-side subprocess
     cancellation, `child.kill()` in `openclaw.rs`'s `run_cli`, already
     exists to do — reused here, not reinvented) and **deletes** the
     resulting incomplete row rather than leaving it to the existing
     stale-pending sweep to clean up later. A real delete, not an
     abandoned row.

### 2.7 — The rules get documented, not just discovered

Confirmed requirement: the whole XP/rewards/leveling system gets a
real, written explanation inside the app itself — not something a user
has to reverse-engineer by playing. Two pieces:
- **`docs/reference/gamification-guide.md`** (new) — the durable design
  doc and source-of-truth copy, same role `checkin-conversation-guide.md`
  and `capture-agent-guide.md` already play for their features: what
  earns XP, how leveling works, badges vs. stickers, the no-punishment
  rule, how "welcome back" works. Written once, referenced rather than
  re-derived.
- **A real in-app Help entry** surfacing a condensed version of that
  doc — likely a new item alongside the existing "Replay onboarding
  tips" in the Help menu (`MenuBar.tsx`), opening a real read panel
  rather than a tooltip. Exact placement (Help menu vs. a tab inside
  the new Progress/rewards surface itself) is a small implementation
  call, not something that needs deciding in this planning pass.

**Verification (2.1-2.7 together):** repository/store tests for XP
math (including the day-level 4hr/8hr cumulative logic, which is
genuinely easy to get wrong — test it against multiple same-day
sessions, not just one), the level-curve formula against the table
above, streak pause-not-reset behavior, achievement-unlock triggers
(including the manual-vs-Tab-accepted word count split for the journal
XP source), the welcome-back detection window and its 10-sticker random
pool, the emergency-exit dialog's three paths (including a real
assertion that "quit now" actually deletes the pending row, not just
abandons it). Manual test: Jeremy earns XP across a real session,
watches a level-up and an achievement pop-up fire, triggers the
emergency-exit dialog mid-generation and tries all three paths, and
reads the new Help entry to confirm it actually explains the system
accurately.

---

## Section 2A — ~~Personal Android companion app~~ (CUT — desktop only)

**This section is cut from scope.** The app is desktop only going
forward. Kept below, unmodified, purely as a record of the design work
already done — do not build this unless Jeremy explicitly revives it.

<details>
<summary>Original design (cut)</summary>

Separate from `mykaia-task` (Cursor's job, not this plan's). This was
scoped as a personal tool for Jeremy: an Android app that would connect
**directly** to his running desktop Mycelia Time instance, rather than
being a standalone app with its own database and its own AI connection.

**What was confirmed before the cut:**
- **Feature parity boundary = pocket mode.** Anything that requires
  full-screen mode on desktop (zen mode, the DLC canvas above, the
  full-screen AI-assist/report views) simply wouldn't exist on Android.
  Everything that already fits the compact pocket-card layout (tasks,
  todos, notes, the capture drawer, compact project cards) was the
  scope.
- **AI would be routed from the desktop app, not connected to
  independently.** The Android app would not hold its own
  OpenClaw/Ollama/cloud connection — it would send requests to the
  desktop app, which channels them through whichever AI backend *it*
  has configured (Section 3's `aiBackendRouter`), and relay the answer
  back.
- **This was personal, not the public distribution path.** No
  onboarding, no support for arbitrary pairing with strangers'
  desktops — a fixed pairing between Jeremy's own devices would have
  been enough.

**Open questions that were never answered** (this is exactly why the
section stalled before this cut):
1. Transport — LAN-only, or remote access requiring a relay/tunnel?
2. Tech stack for the Android app itself — Flutter or something else?
3. Data path — live sync against the same SQLite database, or a
   separate local copy kept in sync?
4. Auth/pairing — how the Android app proves it's really Jeremy's own
   paired device.
5. Repo location — same repo (`src-mobile/`) or a separate repo?

</details>

---

## Section 3 — AI backend: transparency + retry/fallback, then pluggability

Split into two phases per the design review — ship the lower-risk,
directly-diagnostic piece first (answers "what's actually happening
with my slow generation" with real data), then the larger multi-backend
piece once that's proven. **Phase B below was designed assuming this
app stays public — confirm current repo-visibility plans with Jeremy
before building it; if this stays a private, personal-only build,
Phase B may be unnecessary and Phase A alone may be enough.**

### Phase A — Model transparency + OpenClaw retry/fallback (Jeremy's own setup only)

**New:** `src/components/ModelBadge.tsx` — a small presentational chip
reading `{ modelUsed: string | null; usedFallback?: boolean }`, mapping
known provider prefixes (`xai` → "xAI", `ollama` → "Ollama") to a
friendly label, styled distinctly (amber/dashed, matching the existing
failed-journal treatment in `LibraryCompartment.tsx`) when a fallback
was used instead of the plain case. Wired into `LibraryCompartment.tsx`
(journal entries) and `ProjectsCompartment.tsx` (status reports) —
both already store `model_used`, this is purely additive rendering.

**New migration column:** `backend_used TEXT` on both `journals` and
`project_reports` (`ALTER TABLE`, following the exact precedent of the
existing `failure_reason`/`target_datetime` additions), populated
alongside `model_used` in `markResult`.

**Retry/fallback logic** (`src/services/aiBackendRouter.ts`, new — sits
in front of the existing `openclawClient.ts`, every current call site
keeps calling `.runOnce()`/`.call()` exactly as today):

1. Up to 3 connection attempts against OpenClaw (subprocess launch +
   Gateway reachability) before giving up on it entirely, with a short
   delay between attempts.
2. Once connected, if Jeremy has a preferred model set (default
   `xai/grok-4.5`), and the response's actual model doesn't match, retry
   up to 2 more times passing `--model <id>` explicitly — confirmed live
   tonight that `openclaw agent` supports this flag. If it still doesn't
   land on the preferred model, **accept the response anyway** rather
   than looping forever — a real answer from a fallback model beats no
   answer, and the badge above makes it visible instead of silent.
3. If OpenClaw is unreachable after all connection attempts, fall back
   to a **direct** Ollama call (`src/services/backends/ollamaBackend.ts`,
   new — separate from the existing `ollamaClient.ts`, which is tuned
   for ghost-text/classification latency, not general-purpose journal
   generation), targeting the first model in OpenClaw's own already-
   configured fallback chain. Result gets tagged `backend_used = "ollama"`.
4. If that also fails, propagate the error exactly as today — every
   existing caller (`journalGeneration.ts` marks `failed` with a
   message, `projectAssist.ts` returns `null`) already handles this,
   no call-site changes needed.

**Rust change:** thread an optional `model: Option<String>` through
`openclaw_call_agent`/`run_openclaw_agent`/`call_agent` in
`openclaw.rs`, appended as `--model <id>` to the CLI invocation when
present — reuses the exact `run_cli` subprocess pattern already
rewritten this session (real spawn+poll+kill timeout, not
`Command::output()`).

**Settings addition:** a "preferred model" field (default `xai/grok-4.5`
for Jeremy, empty = no preference for anyone who hasn't set one) —
this is the one part of this phase that's config, not hardcoded to
Grok specifically, consistent with CLAUDE.md's "personal preference
sets defaults, doesn't get hard-coded as the only option."

### Phase B — Pluggable backend (OpenClaw / Ollama / LM Studio / Cloud API) + onboarding

This is the part that makes a *public* version of the app not depend
on Jeremy's own OpenClaw+Grok subscription. **Re-check whether this is
still needed before building** — see the note at the top of this
section.

**New shared types** (`src/services/aiBackend.ts`): a generalized
`AiBackendClient` interface (same four methods `OpenClawClient` already
has — `runOnce`/`ensureDaemon`/`call`/`releaseDaemon` — with
`ensureDaemon`/`releaseDaemon` becoming no-ops for the stateless
backends) so every existing call site's type annotation swaps
mechanically without touching call-site logic.

**New backend adapters:**
- `src/services/backends/ollamaBackend.ts` (already built in Phase A,
  reused here as the "Ollama" backend choice, not just the fallback path)
- `src/services/backends/lmStudioBackend.ts` — LM Studio's OpenAI-
  compatible `/v1/chat/completions`, default `http://localhost:1234/v1`
- `src/services/backends/cloudBackend.ts` — thin TS wrapper invoking a
  **new Rust command** (`src-tauri/src/cloud_backend.rs`, `reqwest`-based,
  same `async fn` + blocking-work pattern as the rest of `src-tauri/src`)
  rather than calling `fetch()` from the webview directly — sidesteps
  likely CORS issues with cloud providers and keeps the user's API key
  out of the browser devtools network tab entirely.

**Where the user's cloud API key lives:** the `keyring` Rust crate
(OS-native credential storage — Windows Credential Manager / macOS
Keychain / Linux Secret Service), via a new `src-tauri/src/secrets.rs`
exposing store/has/delete commands. The key is written once from a
Settings text field, then discarded from JS state immediately — every
actual cloud call happens entirely in Rust. This needs a real
smoke-test on this machine before being trusted (see Open Questions).

**Onboarding:** new `src/components/AiBackendOnboarding.tsx`, same
structural shape as the existing `AccessibilityOnboarding.tsx`
(`role="dialog"`, same panel styling, "explain → choose → Continue
persists + calls onDone", shown once ever). Four choices — OpenClaw
(default-selected, no extra setup), Ollama (base URL field, pre-filled
`http://127.0.0.1:11434`), LM Studio (base URL field, pre-filled
`http://localhost:1234/v1`), Cloud API (provider + model id + API key
field, write-only). Slots into `Dashboard.tsx`'s existing onboarding
gate chain, after accessibility, before the general coach mark. A
shared `AiBackendPicker.tsx` component is reused for the same choice
in Settings, so changing your mind later doesn't need a second UI.

**Backwards compatibility:** default `aiBackendKind = "openclaw"` — an
existing/new settings row simply not having this key yet resolves to
today's only behavior, so Jeremy's daily flow is unaffected until he
explicitly changes it. The elaborate connect-retry/preferred-model/
Ollama-fallback policy from Phase A only activates for the `openclaw`
backend kind — a user who picked LM Studio or their own cloud key gets
a simpler "retry this one backend, then fail honestly" policy, since
silently jumping to a different backend behind an explicit choice
would defeat the point of letting them choose.

**Verification:** unit tests per new adapter (mocked HTTP), router
tests for the retry/fallback decision tree (attempt counts, model-
match/no-match, total-failure propagation), onboarding component tests
matching the existing `AccessibilityOnboarding.test.tsx` shape. Manual
gate: Jeremy runs through onboarding picking each of the four options
at least once, and (if he sets up a real key) confirms an actual cloud
call round-trips.

**Open questions carried into implementation** (can't be resolved by
reading code alone):
- LM Studio's exact response shape/auth requirements — not installed
  on this machine, needs a live check when that adapter is actually built.
- Cloud provider scope for v1 — one OpenAI-compatible-shaped provider,
  or a small registry from day one (Anthropic's Messages API has a
  different shape and would need its own branch).
- Whether `keyring` behaves cleanly on this machine and packages
  correctly for other users' machines across platforms — needs a real
  smoke test before shipping, not just assumed.

---

## Section 4 — Auto-update: tradeoffs

Two real paths, laid out rather than picked, per Jeremy's request:

### Option A — GitHub Releases + Tauri's official updater plugin (`tauri-plugin-updater`)
- **How it works:** CI builds and signs a release on tag push, publishes
  the binaries plus a `latest.json` manifest to GitHub Releases; the app
  checks that manifest URL, and either prompts the user or silently
  downloads/installs, per a setting.
- **Needs:** one signing keypair generated once (`tauri signer generate`,
  private key kept secret, public key baked into `tauri.conf.json`); a
  new `.github/workflows/release.yml` (this repo currently has **no**
  `.github` directory at all — confirmed, zero CI exists today); the
  `tauri-plugin-updater` + `tauri-plugin-process` dependencies.
- **Cost:** effectively free if the repo is public — GitHub Releases
  hosting is free for a public repo, no server to run or maintain. If
  the repo goes private, GitHub Releases still works but check current
  private-repo bandwidth/storage limits before relying on it.
- **Tradeoff:** ties the release process to GitHub specifically; every
  release needs to go through the signed CI pipeline, not an ad hoc
  manual upload.

### Option B — Self-hosted update server
- **How it works:** same `tauri-plugin-updater` client-side, but the
  manifest/binaries are served from infrastructure Jeremy runs himself
  instead of GitHub Releases.
- **Needs:** everything Option A needs *plus* a real server to build,
  deploy, and keep online — more moving parts for no functional gain
  unless there's a reason not to use GitHub.
- **Tradeoff:** more control (e.g. private betas, custom rollout
  logic) at the cost of real ongoing infrastructure to maintain.

### The "automated vs. manual, user's choice" part is orthogonal to hosting

Either option above uses the *same* underlying mechanism — a settings
toggle picks the UX mode on top of it, not a different pipeline:
- **Automatic:** the plugin's `check()` finds an update, `downloadAndInstall()`
  runs without asking, app restarts on the user's next natural relaunch.
- **Manual:** `check()` still runs (e.g. on launch, or a "check for
  updates" button in Settings), but only surfaces a "update available —
  install now?" prompt; the user clicks to actually download/install.

**Recommendation** (not a decision made for Jeremy, just the default
this plan would build toward absent a different call): Option A —
GitHub Releases, since it adds zero infrastructure regardless of the
repo's visibility. Sequenced **after** the packaging phase in the
existing roster, since there's no real release process to check
against until packaging produces one.

**Verification:** can't be meaningfully tested until a real signed
release exists to update *from* — the concrete build/verify steps for
this section belong in its own phase report once reached, not this
planning pass.

---

## Proposed phase sequencing

Renumbering the existing queue (current Phase 12/13/14 → pushed later)
to slot the new work in. Desktop only — the Android companion app row
from the original plan is removed; everything else here has a real
design behind it.

| # | Phase |
|---|---|
| ~~12~~ | ~~11+11 unlock revision (Section 1)~~ — cut, hidden-unlock system removed entirely instead (done 2026-08-06, not a phase) |
| ~~13~~ | ~~Gamification core~~ — **done 2026-08-06.** XP, levels/badges, streaks (7/30/100/365), no-punishment + welcome-back, first-time achievements, count milestones (10/50/100 notes/todos/sessions), in-app disclosure (Section 2.1-2.4, 2.7) — every curated achievement concept is wired to a real trigger and real art, drawn from a random pool per concept (`gamificationAssets.ts`), except the personal-journal sticker (that feature isn't built yet). |
| 14 | Emergency exit confirmation + in-flight-generation awareness (Section 2.6) |
| 15 | AI backend: model transparency + OpenClaw retry/fallback (Section 3, Phase A) |
| 16 | AI backend: pluggable (OpenClaw/Ollama/LM Studio/Cloud) + onboarding (Section 3, Phase B) — re-confirm this is still needed before starting, given the private-build decision |
| 17 | Remaining voice-cue & progressive-disclosure polish, including AOL-style Welcome/hold-on-exit Goodbye (Section 2.5) |
| 18 | Export, backup, calendar heatmap |
| 19 | Windows packaging & final verification |
| 20 | Auto-update (Section 4) — after packaging, since it needs a real release to check against |
| — | **Not this app's work, no phase number:** MyKaia / `mykaia-task` (Cursor's job) |
| — | **Deferred, no phase number yet:** the personal journal feature (designed in Section 2.2); Quest 3/VR |
| — | **Cut, kept only as a record:** Android companion app (Section 2A); 11+11 unlock + DLC infinite-canvas media viewer (Section 1) |

This ordering is a recommendation, not a lock-in — flag any reordering
you want and this doc gets updated to match before Phase 12 starts.

## Verification approach (unchanged from the existing project convention)

Every phase: automated tests (`npm test`/`cargo test`), output read and
cross-checked (not just exit code), diff audited against intent,
commit + push + devlog per step, full stop for Jeremy's manual test
pass at the end of any phase that changes something visible or
interactive — no exceptions, same as every phase so far.
