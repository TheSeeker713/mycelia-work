import type { VoiceClient } from "./voiceClient";

/**
 * Above this, live narration stops feeling instant. Set from real
 * measurement on the reference machine (~0.10-0.19s steady state for
 * Piper on plain CPU — see Voice-Agent/tts/piper/README.md) with real
 * headroom, not a guess: something meaningfully slower than that
 * reference is worth surfacing to the user, not silently endured.
 */
export const SLOW_TTS_THRESHOLD_SECONDS = 1.5;

const BENCHMARK_PHRASE = "This is a quick voice performance check.";

export type VoicePerformance = "fast" | "slow" | "unavailable";

/**
 * Real, on-this-machine measurement — not a static assumption — so a
 * weaker machine than the one this was built on gets told the truth
 * instead of just feeling broken. Callers decide what to do with a
 * "slow" result (Settings shows it, suggests trying a cloud TTS/STT
 * service instead of the local ones).
 */
export async function measureTtsLatencySeconds(client: VoiceClient): Promise<number | null> {
  const start = performance.now();
  const result = await client.speak(BENCHMARK_PHRASE);
  if (!result) return null;
  return (performance.now() - start) / 1000;
}

export function classifyVoicePerformance(latencySeconds: number | null): VoicePerformance {
  if (latencySeconds === null) return "unavailable";
  return latencySeconds <= SLOW_TTS_THRESHOLD_SECONDS ? "fast" : "slow";
}
