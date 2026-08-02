# Audio cues

Ten short voice/audio cues live here, generated once (offline) via the
local Chatterbox-Turbo TTS server at `D:\_Dev\AI-Setup\Voice-Agent\` and
committed as static assets. The app never depends on that server being up
at runtime — these files are shipped as-is.

Generation script: `scripts/generate-voice-lines.mjs` (added in Phase 7).
Re-run it any time to regenerate with a different reference voice clip.

Expected filenames (`.mp3` or `.wav`, both work with the Web Audio API):

| File | Trigger |
|---|---|
| `welcome.mp3` | App launch / first run of the day |
| `clock-in.mp3` | Clocking into a task |
| `break-start.mp3` | Starting a break |
| `break-resume.mp3` | Resuming from a break |
| `clock-out.mp3` | Clocking out of a task |
| `todo-alert.mp3` | A todo's alert time fires |
| `idle-nudge.mp3` | Short-idle check ("still there?") |
| `checkin-return.mp3` | Returning after a long gap / forgot-to-clock-out flow |
| `journal-ready.mp3` | AI work journal finished generating |
| `goodbye.mp3` | App exit |

Until Phase 7 wires these up, this folder is a placeholder — do not drop
files in manually before then, since the generation script will own the
exact filenames and format.
