import { runAiJob } from "./aiQueue";
import type { OllamaClient } from "./ollamaClient";
import type { AggregatedSession } from "./activityAggregation";

export async function labelActivitySession(
  ollama: OllamaClient,
  session: AggregatedSession,
): Promise<string | null> {
  const prompt = `Label this computer-use span in at most 6 words. App: ${session.app}. Window: ${session.title ?? "(none)"}. Idle: ${session.idle}. Output only the label.`;
  return runAiJob(
    {
      kind: "ghost_text",
      label: "Labeling activity",
      isStillRelevant: () => true,
    },
    () => ollama.suggestContinuation(prompt),
  ).catch(() => null);
}
