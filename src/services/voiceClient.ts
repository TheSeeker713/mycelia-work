const PIPER_URL = "http://127.0.0.1:8004";
const FASTER_WHISPER_URL = "http://127.0.0.1:8005";
const HEALTH_TIMEOUT_MS = 1500;

/**
 * Local HTTP client for the fast, live-narration voice services
 * (Piper TTS, faster-whisper STT) — see D:\_Dev\AI-Setup\Voice-Agent.
 * Neither service is a background daemon like OpenClaw's scheduled
 * task, so every call is written to fail soft: unreachable/errored
 * calls resolve to `null` rather than throwing, and callers decide what
 * "no voice available right now" means (usually: stay silent).
 */
export interface VoiceClient {
  speak(text: string): Promise<Blob | null>;
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
    async speak(text) {
      const trimmed = text.trim();
      if (!trimmed) return null;
      try {
        const form = new FormData();
        form.append("text", trimmed);
        const res = await fetch(`${PIPER_URL}/tts`, { method: "POST", body: form });
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

    isTtsAvailable: () => checkHealth(PIPER_URL),
    isSttAvailable: () => checkHealth(FASTER_WHISPER_URL),
  };
}
