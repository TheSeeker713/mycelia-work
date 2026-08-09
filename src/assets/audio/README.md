# Audio cues

Short voice cues, generated once (offline) via the local Chatterbox-Turbo
TTS server at `D:\_Dev\AI-Setup\Voice-Agent\` and committed as static
assets. The app never depends on that server being up at runtime — these
files ship as-is.

Generation script: `scripts/generate-voice-lines.mjs`. Re-run it any time
(with Chatterbox running — `cd D:\_Dev\AI-Setup\Voice-Agent && .\start_all.ps1`)
to regenerate with a different reference voice clip.

Down to one file as of 2026-08-08 — clock-in/break-start/break-resume/
clock-out moved to live self-voicing (`useSelfVoicing`, Kokoro TTS)
once that engine actually sounded like something worth hearing; pre-baking
those never had a real advantage once the live engine was fast and good.
"Welcome"/"Goodbye" (app launch/exit) also went live, not pre-baked —
never generated as static files at all, despite an old table here once
listing them as planned.

| File | Trigger |
|---|---|
| `please-wait.wav` | An AI call is in flight (check-in conversation, journal generation) and will take a moment — plays immediately, live narration follows once the real response is ready. Stays pre-baked on purpose: it covers a real network-call wait, so zero-latency/no-network-dependency playback is the whole point. |

`useVoiceCues.ts` is the entry point that plays this — add a new
pre-baked cue by generating the file, adding it to `CUE_FILES` there, and
wiring the trigger. Everything else spoken by the app goes through live
self-voicing (`useSelfVoicing.ts`) instead.
