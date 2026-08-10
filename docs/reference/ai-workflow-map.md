# Every AI and rule-based decision path in the app

Written 2026-08-09 during a full audit pass. The point is that "where
does this app make a decision, and what happens when that decision
can't be made" should be answerable by reading one page rather than
grepping.

Two categories: calls that actually reach a model, and deterministic
rules that stand in for one. Both matter, because the rule-based ones
are where a bad threshold silently suppresses a real feature (see the
resource watchdog's history below).

## Model-backed call sites

Every one of these routes through `services/aiQueue.ts`, so only one
runs at a time app-wide.

| Call site | Model path | On failure | Queue behavior |
|---|---|---|---|
| Ghost text (`useGhostText`, every text field) | Ollama direct, `dolphin-phi:latest`, 12s | Returns null, no suggestion shows, console warning | **Drops** if stale when its turn comes |
| Muse (`useMuseSuggestions`, the Journal) | Same as ghost text | Same | Same |
| Session/weekly report (`journalGeneration`) | Grok on: router. Grok off: Ollama direct, 90s, one retry | Row marked `failed` with the reason, retryable from Library | Waits |
| Project status report (`projectAssist`) | Same as above | Row marked `failed` | Waits |
| Project assist actions (`runProjectAssist`) | OpenClaw, 45s | Returns null, panel shows a "couldn't get an answer" message | Waits |
| Capture agent (`captureAgent`) | Layer 0 Ollama classify, then Layer 1 OpenClaw | Declines, which is the fail-closed answer | Waits, **both layers in one slot** |
| Check-in conversation (`checkinConversation`) | OpenClaw, 60s per turn | Returns null, falls back to the static Tier-0 dialogue | Waits |
| Gallery upscale | Real-ESRGAN subprocess, auto GPU, 10min cap | Error surfaced in the art view | Waits |
| Gallery animate | Cloud connector chain | Error names every provider that failed | Waits |

### Why ghost text drops instead of waiting

A completion for a sentence finished two minutes ago is worse than no
completion. Relevance is checked at the moment the job would start, not
when it was queued, using the same `requestId` counter the hook already
tracks for its own staleness. Everything else in the table is something
deliberately asked for, so it waits rather than being thrown away.

## Fallback and retry chains

- **`aiBackendRouter.routeAiCall`** (reports only, Grok on): up to 3
  OpenClaw connect attempts → up to 2 more with an explicit `--model` if
  a preferred model was set and something else answered → direct Ollama
  → throw. Records `backend_used` so a fallback is visible in the UI
  rather than just feeling slow.
- **Local report path** (Grok off): one automatic retry. A cold model
  load genuinely fails once and succeeds immediately after.
- **Capture agent**: no retry by design. It fails closed to `decline`,
  and retrying a safety check that already said no is the wrong move.
- **Check-in**: no retry at the call level. The conversation has a
  6-turn cap and a full static fallback, which is a better answer than
  hammering a model that isn't responding.

## Rule-based decision paths (no model involved)

These are the ones worth re-reading periodically, because a wrong
constant here disables a feature without any error anywhere.

| Rule | Where | Threshold | What it gates |
|---|---|---|---|
| Resource pressure | `resource_watchdog.rs` | CPU ≥ 90%, memory ≥ 95%, confirmed by a second sample 300ms later | Skips ghost-text suggestions |
| Voice performance | `hardwareCheck.ts` | TTS latency > 1.5s reads as "slow" | Advisory only, shows a Settings message |
| Dangling session | `sessionsStore.isDangling` | 8+ hours still running | Triggers the check-in conversation |
| Stale pending report | `journalGeneration` | 3 minutes still `pending` | Sweeps to `failed` so it stops saying "Generating…" forever |
| Ghost-text minimum | `useGhostText` | 12 characters | Below this, no request at all |
| Welcome back | `gamification` | 3+ days away | Grants the returning bonus |

The watchdog thresholds were raised from 85/90 to 90/95 in Phase 15.6
after they fired during ordinary multitasking and silently suppressed
the capture agent. The double-sample confirmation was added at the same
time so a momentary spike can't do it. Worth remembering that this
class of bug looks exactly like "the feature is broken."

## Things that deliberately have no fallback

- **Ollama being down** stops ghost text entirely. There's no cloud
  fallback for a suggestion that needs to feel instant, and a slow
  remote completion is worse than none.
- **Kokoro being down** stops live narration. The one pre-recorded cue
  (`please_wait`) exists precisely because it covers a network wait and
  can't itself depend on the network.
- **Video generation** has no local option at all. Nothing open runs
  usefully on this hardware, which is why it's the only cloud-dependent
  feature in the app and why it has three providers instead of one.
