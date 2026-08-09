const OLLAMA_URL = "http://127.0.0.1:11434";
const HEALTH_TIMEOUT_MS = 1500;
/**
 * A cold `dolphin-phi` load measured ~6.2s on the reference machine
 * (Ollama unloads idle models after its own default keep-alive window,
 * so "cold" is the common case, not the exception) — 6000ms was
 * timing out almost every real suggestion. `warmUp()` below exists to
 * absorb that cold-load cost before the user's first typing pause, but
 * the timeout still needs enough headroom for whenever warm-up hasn't
 * finished (or wasn't called) by the time a suggestion fires.
 */
const SUGGEST_TIMEOUT_MS = 12_000;
const CLASSIFY_TIMEOUT_MS = 8000;

/**
 * Layer 0 of the capture agent (docs/reference/capture-agent-guide.md) —
 * a small, fast on-topic/safety judgment call, not the raw-speed pick
 * ghost text uses. Picked from the doc's own listed options
 * (qwen3.5-abliterated:9b / hermes3:8b / dolphin3:8b): hermes3:8b, a
 * well-rounded instruct model, since this call is actual judgment, not
 * pattern-completion — worth the extra size over dolphin-phi even
 * though it's slower.
 */
export const CLASSIFY_MODEL = "hermes3:8b";

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
  /** Layer 0 of the capture agent: fast on-topic/safety check, run before Layer 1 ever sees the text. Fails closed (false) on any error — an unreachable safety check is treated the same as "not safe," never silently skipped. */
  classifyOnTopic(text: string): Promise<boolean>;
  /** Fire-and-forget: loads GHOST_TEXT_MODEL into memory ahead of the user's first typing pause, so the real suggestion call lands warm. Never throws, nothing to await for correctness — call it and move on. */
  warmUpGhostText(): void;
  /** Same idea as warmUpGhostText, generalized to any model id — used by the startup screen to pre-load whichever local model Settings' picker has selected as the Grok-off fallback, so the first real OpenClaw call doesn't pay its cold-load cost too. */
  warmUpModel(modelId: string): void;
  /** Plain reachability check for the startup system-check screen — Ollama isn't something this app can start on its own (no known launch command, unlike OpenClaw/Voice-Agent), so this only reports whether it's already up. */
  isAvailable(): Promise<boolean>;
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

    async classifyOnTopic(text) {
      const trimmed = text.trim();
      if (!trimmed) return false;
      try {
        const res = await fetch(`${OLLAMA_URL}/api/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: CLASSIFY_MODEL,
            prompt: `Is the following text on-topic for a personal productivity app (a note, a todo/task, or progress on a project), AND free of anything harmful, illegal, dangerous, or unsafe? Answer with exactly one word: yes or no.\n\nText: "${trimmed}"`,
            stream: false,
            options: { num_predict: 5, temperature: 0 },
          }),
          signal: AbortSignal.timeout(CLASSIFY_TIMEOUT_MS),
        });
        if (!res.ok) return false;
        const data = (await res.json()) as { response?: string };
        return /\byes\b/i.test(data.response ?? "");
      } catch {
        return false;
      }
    },

    warmUpGhostText() {
      this.warmUpModel(GHOST_TEXT_MODEL);
    },

    warmUpModel(modelId) {
      // An empty prompt is Ollama's own idiom for "load this model into
      // memory, don't generate anything" — cheaper than a real
      // suggestion call, and exactly what's needed here.
      fetch(`${OLLAMA_URL}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelId, prompt: "" }),
        signal: AbortSignal.timeout(SUGGEST_TIMEOUT_MS),
      }).catch(() => {
        // Best-effort — a failed warm-up just means the first real
        // call pays the cold-load cost itself.
      });
    },

    async isAvailable() {
      try {
        const res = await fetch(`${OLLAMA_URL}/api/version`, {
          signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
        });
        return res.ok;
      } catch {
        return false;
      }
    },
  };
}
