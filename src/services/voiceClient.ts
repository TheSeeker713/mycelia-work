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
 * instant"). `af_heart` at +200 cents is the actual locked-in pick after
 * comparing three voices and a 5-500 cent pitch range — the server
 * defaults to this exact combination too, so `pitchShiftCents` here just
 * keeps the two in sync rather than being a second source of truth.
 */
export const NARRATION_VOICES = [
  { id: "af_heart", label: "Heart", pitchShiftCents: 200 },
] as const;

export const DEFAULT_VOICE_ID = NARRATION_VOICES[0].id;

function pitchShiftFor(voiceId: string): number {
  return NARRATION_VOICES.find((v) => v.id === voiceId)?.pitchShiftCents ?? 0;
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
        const resolvedVoiceId = voiceId ?? DEFAULT_VOICE_ID;
        const form = new FormData();
        form.append("text", trimmed);
        form.append("voice", resolvedVoiceId);
        form.append("pitch_shift_cents", String(pitchShiftFor(resolvedVoiceId)));
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
