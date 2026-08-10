import type { AiBackendId } from "../data";
import type { OllamaClient } from "./ollamaClient";
import type { OpenClawCallInput, OpenClawCallResult, OpenClawClient } from "./openclawClient";

/** What actually happened, so the UI can say so instead of just looking slow. */
export interface RoutedResult {
  text: string;
  model: string;
  backend: AiBackendId;
  /** True when the request did not land on the preferred backend/model. */
  usedFallback: boolean;
}

/**
 * OpenClaw's gateway is a subprocess that can be genuinely down for a
 * moment (starting up, mid-restart) rather than broken, so a couple of
 * quick retries recover a real class of failure. Past that it's down,
 * and waiting longer just makes the app feel stuck.
 */
export const CONNECT_ATTEMPTS = 3;
const CONNECT_RETRY_DELAY_MS = 400;

/**
 * If a preferred model is set and the answer came back from something
 * else, it's worth asking again with an explicit `--model`. Twice, not
 * more: past that the model genuinely isn't available and a real answer
 * from a fallback beats no answer at all.
 */
export const MODEL_RETRY_ATTEMPTS = 2;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Loose match: OpenClaw reports things like `xai/grok-4.5` for a preference written the same way. */
function modelMatches(actual: string, preferred: string): boolean {
  const a = actual.toLowerCase();
  const p = preferred.toLowerCase();
  return a === p || a.endsWith(`/${p}`) || p.endsWith(`/${a}`);
}

/**
 * Sits in front of the OpenClaw client for anything that persists a
 * result row, and answers the question the model badge shows: which
 * backend actually replied, and was that the one we wanted.
 *
 * Order of attempts:
 *   1. OpenClaw, up to CONNECT_ATTEMPTS times if it can't be reached.
 *   2. Still on OpenClaw, up to MODEL_RETRY_ATTEMPTS more times with an
 *      explicit model override if a preferred model was set and the
 *      response came from something else.
 *   3. Direct Ollama, if OpenClaw never became reachable at all.
 *
 * A failure at step 3 propagates, exactly as before — every caller
 * already turns a thrown error into a `failed` row or a null result.
 */
export async function routeAiCall(params: {
  openClaw: OpenClawClient;
  ollama: OllamaClient;
  input: OpenClawCallInput;
  /** e.g. `xai/grok-4.5`. Empty/undefined means no preference, so no model retry. */
  preferredModel?: string;
  /** Used only for the direct-Ollama fallback leg. */
  localModelId: string;
  localTimeoutSecs: number;
}): Promise<RoutedResult> {
  const { openClaw, ollama, input, preferredModel, localModelId, localTimeoutSecs } = params;

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= CONNECT_ATTEMPTS; attempt += 1) {
    try {
      let result: OpenClawCallResult = await openClaw.runOnce(input);

      if (preferredModel && !modelMatches(result.model, preferredModel)) {
        for (let retry = 0; retry < MODEL_RETRY_ATTEMPTS; retry += 1) {
          try {
            const retried = await openClaw.runOnce({ ...input, model: preferredModel });
            result = retried;
            if (modelMatches(retried.model, preferredModel)) break;
          } catch {
            // Keep whatever the first successful call returned — a real
            // answer from the wrong model beats losing it to a retry.
            break;
          }
        }
      }

      return {
        text: result.text,
        model: result.model,
        backend: "openclaw",
        usedFallback: preferredModel ? !modelMatches(result.model, preferredModel) : false,
      };
    } catch (err) {
      lastError = err;
      if (attempt < CONNECT_ATTEMPTS) await sleep(CONNECT_RETRY_DELAY_MS);
    }
  }

  // OpenClaw never answered. Go straight to Ollama rather than failing,
  // and mark it as a fallback so the badge can say so.
  try {
    const text = await ollama.generateReport(input.message, localModelId, localTimeoutSecs);
    return { text, model: `ollama/${localModelId}`, backend: "ollama", usedFallback: true };
  } catch {
    throw lastError instanceof Error
      ? lastError
      : new Error("No AI backend was reachable");
  }
}
