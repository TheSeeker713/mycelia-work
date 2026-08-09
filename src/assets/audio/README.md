# Audio cues

The one pre-recorded voice cue — "please wait" — generated offline via
the local Kokoro TTS server at `D:\_Dev\AI-Setup\Voice-Agent\tts\kokoro`
and committed as static assets. The app never depends on that server
being up at runtime — these files ship as-is.

One file **per narration-voice roster entry** (12, as of Phase 16.6),
not a single fixed file — so whichever voice is selected in Settings,
the pre-baked cue actually matches it instead of playing a mismatched
voice. Generation script: `scripts/generate-voice-lines.mjs`. Re-run it
any time the roster changes (with Kokoro running —
`cd D:\_Dev\AI-Setup\Voice-Agent && .\start_all.ps1`).

Down to this one cue as of 2026-08-08 — clock-in/break-start/break-resume/
clock-out moved to live self-voicing (`useSelfVoicing`, Kokoro TTS)
once that engine actually sounded like something worth hearing; pre-baking
those never had a real advantage once the live engine was fast and good.
"Welcome"/"Goodbye" (app launch/exit) also went live, not pre-baked —
never generated as static files at all, despite an old table here once
listing them as planned.

| File pattern | Trigger |
|---|---|
| `please-wait-<voiceId>.wav` (one per `NARRATION_VOICES` entry in `src/services/voiceClient.ts`) | An AI call is in flight (check-in conversation, journal generation) and will take a moment — plays immediately, live narration follows once the real response is ready. Stays pre-baked on purpose: it covers a real network-call wait, so zero-latency/no-network-dependency playback is the whole point. |

`useVoiceCues.ts` is the entry point that plays this — it picks the
file matching whichever `narrationVoiceId` is currently selected,
falling back to the default voice's file if a specific one is somehow
missing. Add a new pre-baked cue by generating the file(s), wiring it
into `CUE_FILES`/`play()` there, and wiring the trigger. Everything
else spoken by the app goes through live self-voicing
(`useSelfVoicing.ts`) instead.
