const OLLAMA_URL = "http://127.0.0.1:11434";
const SUGGEST_TIMEOUT_MS = 6000;

/**
 * The smallest model already pulled locally (~1.6GB, phi2 family) —
 * picked specifically for ghost-text's "needs to feel instant"
 * requirement over the larger 8-9B models this machine also has
 * configured as OpenClaw's Ollama fallbacks (see
 * docs/reference/capture-agent-guide.md). This is a direct HTTP call to
 * Ollama, not routed through OpenClaw's subprocess wrapper — ghost text
 * fires on every typing pause, and paying subprocess/Gateway overhead
 * per keystroke pause would defeat the "instant" requirement entirely.
 */
export const GHOST_TEXT_MODEL = "dolphin-phi:latest";

/**
 * Local Ollama client for AI writing suggestions (Phase 8 zen mode).
 * Same "fail soft" contract as voiceClient — an unreachable or errored
 * call resolves to `null`, never throws, so a missing/unloaded model
 * just means no suggestion shows up rather than a broken editor.
 */
export interface OllamaClient {
  suggestContinuation(text: string): Promise<string | null>;
}

export function createHttpOllamaClient(): OllamaClient {
  return {
    async suggestContinuation(text) {
      const trimmed = text.trim();
      if (!trimmed) return null;
      try {
        const res = await fetch(`${OLLAMA_URL}/api/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: GHOST_TEXT_MODEL,
            prompt: `Continue this note naturally, from a few words up to one sentence. Do not repeat any of the existing text. Output only the continuation, nothing else.\n\n${trimmed}`,
            stream: false,
            options: { num_predict: 40, temperature: 0.7, stop: ["\n\n"] },
          }),
          signal: AbortSignal.timeout(SUGGEST_TIMEOUT_MS),
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { response?: string };
        const suggestion = data.response?.trim();
        return suggestion || null;
      } catch {
        return null;
      }
    },
  };
}
