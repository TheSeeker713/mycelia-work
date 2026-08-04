# Audio cues

Short voice cues, generated once (offline) via the local Chatterbox-Turbo
TTS server at `D:\_Dev\AI-Setup\Voice-Agent\` and committed as static
assets. The app never depends on that server being up at runtime — these
files ship as-is.

Generation script: `scripts/generate-voice-lines.mjs`. Re-run it any time
(with Chatterbox running — `cd D:\_Dev\AI-Setup\Voice-Agent && .\start_all.ps1`)
to regenerate with a different reference voice clip.

## Generated (Phase 7 — real, wired trigger points)

| File | Trigger |
|---|---|
| `clock-in.wav` | Clocking into a task |
| `break-start.wav` | Starting a break |
| `break-resume.wav` | Resuming from a break |
| `clock-out.wav` | Clocking out of a task |
| `please-wait.wav` | An AI call is in flight (check-in conversation, journal generation) and will take a moment — plays immediately, live narration follows once the real response is ready |

## Not yet generated (Phase 11 polish — no wired trigger point yet)

| File | Trigger |
|---|---|
| `welcome.mp3` | App launch / first run of the day |
| `todo-alert.mp3` | A todo's alert time fires |
| `idle-nudge.mp3` | Short-idle toast |
| `checkin-return.mp3` | Returning to the forgot-to-clock-out check-in |
| `journal-ready.mp3` | AI work journal finished generating |
| `goodbye.mp3` | App exit |

`playVoiceCue()` (`src/hooks/useVoiceCues.ts`) is the single entry point that plays
these — add a new cue by generating the file, adding it to `CUE_FILES`
there, and wiring the trigger.
