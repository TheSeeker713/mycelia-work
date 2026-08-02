# Audio cues

Ten short voice/audio cues live here, generated once (offline) via the
local Chatterbox-Turbo TTS server at `D:\_Dev\AI-Setup\Voice-Agent\` and
committed as static assets. The app never depends on that server being up
at runtime — these files are shipped as-is.

Generation script: `scripts/generate-voice-lines.mjs` (added when Phase 8
is reached). Re-run it any time to regenerate with a different reference
voice clip.

Expected filenames (`.mp3` or `.wav`, both work with the Web Audio API):

| File | Trigger |
|---|---|
| `welcome.mp3` | App launch / first run of the day |
| `clock-in.mp3` | Clocking into a task |
| `break-start.mp3` | Starting a break |
| `break-resume.mp3` | Resuming from a break |
| `clock-out.mp3` | Clocking out of a task |
| `todo-alert.mp3` | A todo's alert time fires |
| `idle-nudge.mp3` | Short-idle toast |
| `checkin-return.mp3` | Returning to the forgot-to-clock-out check-in |
| `journal-ready.mp3` | AI work journal finished generating |
| `goodbye.mp3` | App exit |

Until the voice-cue phase is reached, this folder is a placeholder — do
not drop files in manually before then, since the generation script owns
the exact filenames and format.
