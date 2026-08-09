const KOKORO_URL = "http://127.0.0.1:8006";
const FASTER_WHISPER_URL = "http://127.0.0.1:8005";
const HEALTH_TIMEOUT_MS = 1500;

/**
 * The live-narration engine, replacing Piper — Piper's own voice quality
 * was rejected outright during a real audition 2026-08-08 ("piper sounds
 * like shit"). Kokoro-82M (D:\_Dev\AI-Setup\Voice-Agent\tts\kokoro) is
 * still small/fast enough for live use, unlike the other engine tested
 * (Qwen3-TTS, a voice-cloning model taking 20-40s per line on this
 * machine — fine for something pre-baked once, not for "needs to feel
 * instant"). `af_heart` at +200 cents was the first locked-in pick after
 * comparing three voices and a 5-500 cent pitch range; the roster below
 * (12 entries, confirmed live against Kokoro's actual voice catalog and
 * approved after a full audition 2026-08-08) adds three pitch steps of
 * Heart plus 8 more male/female voices. `voice` is the literal Kokoro
 * voice id sent to the server — distinct from `id`, since the three
 * Heart entries share one `voice` at three different `pitchShiftCents`.
 */
export const NARRATION_VOICES = [
  { id: "af_heart_200", label: "Heart — Bright", voice: "af_heart", pitchShiftCents: 200 },
  { id: "af_heart_150", label: "Heart — Warm", voice: "af_heart", pitchShiftCents: 150 },
  { id: "af_heart_100", label: "Heart — Soft", voice: "af_heart", pitchShiftCents: 100 },
  { id: "af_sarah", label: "Sarah", voice: "af_sarah", pitchShiftCents: 0 },
  { id: "af_sky", label: "Sky", voice: "af_sky", pitchShiftCents: 0 },
  { id: "af_nova", label: "Nova", voice: "af_nova", pitchShiftCents: 0 },
  { id: "af_kore", label: "Kore", voice: "af_kore", pitchShiftCents: 0 },
  { id: "am_adam", label: "Adam", voice: "am_adam", pitchShiftCents: 0 },
  { id: "am_michael", label: "Michael", voice: "am_michael", pitchShiftCents: 0 },
  { id: "am_onyx", label: "Onyx", voice: "am_onyx", pitchShiftCents: 0 },
  { id: "am_liam", label: "Liam", voice: "am_liam", pitchShiftCents: 0 },
  { id: "am_echo", label: "Echo", voice: "am_echo", pitchShiftCents: 0 },
] as const;

export const DEFAULT_VOICE_ID = NARRATION_VOICES[0].id;

function resolveVoice(voiceId: string): { voice: string; pitchShiftCents: number } {
  const entry = NARRATION_VOICES.find((v) => v.id === voiceId);
  return entry ? { voice: entry.voice, pitchShiftCents: entry.pitchShiftCents } : { voice: voiceId, pitchShiftCents: 0 };
}

/**
 * Local HTTP client for the fast, live-narration voice services
 * (Kokoro TTS, faster-whisper STT) — see D:\_Dev\AI-Setup\Voice-Agent.
 * Neither service is a background daemon like OpenClaw's scheduled
 * task, so every call is written to fail soft: unreachable/errored
 * calls resolve to `null` rather than throwing, and callers decide what
 * "no voice available right now" means (usually: stay silent).
 */
export interface VoiceClient {
  speak(text: string, voiceId?: string): Promise<Blob | null>;
  transcribe(audioBlob: Blob): Promise<string | null>;
  isTtsAvailable(): Promise<boolean>;
  isSttAvailable(): Promise<boolean>;
}

async function checkHealth(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    return res.ok;
  } catch {
    return false;
  }
}

export function createHttpVoiceClient(): VoiceClient {
  return {
    async speak(text, voiceId) {
      const trimmed = text.trim();
      if (!trimmed) return null;
      try {
        const resolved = resolveVoice(voiceId ?? DEFAULT_VOICE_ID);
        const form = new FormData();
        form.append("text", trimmed);
        form.append("voice", resolved.voice);
        form.append("pitch_shift_cents", String(resolved.pitchShiftCents));
        const res = await fetch(`${KOKORO_URL}/tts`, { method: "POST", body: form });
        if (!res.ok) return null;
        return await res.blob();
      } catch {
        return null;
      }
    },

    async transcribe(audioBlob) {
      try {
        const form = new FormData();
        form.append("file", audioBlob, "clip.wav");
        const res = await fetch(`${FASTER_WHISPER_URL}/transcribe`, { method: "POST", body: form });
        if (!res.ok) return null;
        const data = (await res.json()) as { text?: string };
        return data.text?.trim() ?? null;
      } catch {
        return null;
      }
    },

    isTtsAvailable: () => checkHealth(KOKORO_URL),
    isSttAvailable: () => checkHealth(FASTER_WHISPER_URL),
  };
}
