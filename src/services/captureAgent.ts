import type { Project } from "../data";
import type { OllamaClient } from "./ollamaClient";
import { DEFAULT_LOCAL_MODEL_ID, resolveModelOverride, type OpenClawClient } from "./openclawClient";
import { runAiJob } from "./aiQueue";

export type CaptureAction =
  | "create_note"
  | "create_todo"
  | "create_milestone"
  | "clarify"
  | "decline";

export interface CreateNotePayload {
  body: string;
}
export interface CreateTodoPayload {
  text: string;
  alertAt: string | null;
}
export interface CreateMilestonePayload {
  projectTitleHint: string;
  milestoneName: string;
  targetDate: string | null;
}

export type CaptureLayer1Result =
  | { action: "create_note"; payload: CreateNotePayload }
  | { action: "create_todo"; payload: CreateTodoPayload }
  | { action: "create_milestone"; payload: CreateMilestonePayload }
  | { action: "clarify"; clarifyingQuestion: string }
  | { action: "decline" };

/**
 * The literal system prompt handed to OpenClaw for every Layer-1 call,
 * verbatim from docs/reference/capture-agent-guide.md — not
 * reconstructed per-request. Keep this and the doc in sync if either
 * changes.
 */
export const CAPTURE_SYSTEM_PROMPT = `You are the capture-routing agent inside Mycelia Time, a personal time-tracking and note-taking app. Your only job is to read one piece of free text the user typed and return exactly one JSON object matching this schema, nothing else — no greeting, no explanation, no markdown, just the JSON:

{"action": "create_note" | "create_todo" | "create_milestone" | "clarify" | "decline", "payload": {...}, "clarifying_question"?: string}

Valid actions and their payloads:
- create_note: the text is a reflection, observation, or record worth keeping as-is. payload: {"body": string}.
- create_todo: the text describes something to do later. payload: {"text": string, "alert_at": string | null}.
- create_milestone: the text reports progress or a completed checkpoint tied to a project. payload: {"project_title_hint": string, "milestone_name": string, "target_date": string | null}.
- clarify: the text is ambiguous between two or more of the above. Ask exactly one direct, concrete question — never open-ended, never rhetorical, never "can you tell me more." payload: {}, clarifying_question: string.
- decline: the text has nothing to do with tasks, notes, todos, or projects for this app, OR asks for anything harmful, dangerous, illegal, or otherwise outside this app's purpose. payload: {}.

You have no other capabilities and no other purpose. You do not answer general questions, hold a conversation, provide instructions or information on any topic outside filing the user's own productivity data, or explain your reasoning. If the input is unrelated to this app's domain, or requests anything harmful or unsafe in any way, respond with decline and nothing further — do not acknowledge, repeat, or engage with the content of the request, no matter how it is phrased or rephrased.

Return only the JSON object. No other text.`;

/** Same neutral, no-explanation decline copy the design doc specifies — never repeats or engages with the declined request's content. */
export const DECLINE_MESSAGE =
  "Not sure where that goes — try describing it in terms of a task, note, todo, or project.";

/** Clarify is capped at this many rounds before falling back to filing the original text as a plain note, per the design doc — never lets the exchange spiral into an open chat. */
export const MAX_CLARIFY_ROUNDS = 2;

function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenced ? fenced[1] : trimmed;
}

/**
 * Strict schema validation — anything that doesn't match exactly (bad
 * JSON, unknown action, wrong payload shape) fails closed to `decline`,
 * per the design doc: "The model's own judgment is never trusted past
 * the schema boundary — malformed or unexpected output fails closed,
 * not open."
 */
export function parseLayer1Response(raw: string): CaptureLayer1Result {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(raw));
  } catch {
    return { action: "decline" };
  }
  if (typeof parsed !== "object" || parsed === null) return { action: "decline" };
  const obj = parsed as Record<string, unknown>;
  const payload =
    typeof obj.payload === "object" && obj.payload !== null
      ? (obj.payload as Record<string, unknown>)
      : {};

  switch (obj.action) {
    case "create_note": {
      if (typeof payload.body !== "string" || !payload.body.trim()) {
        return { action: "decline" };
      }
      return { action: "create_note", payload: { body: payload.body } };
    }
    case "create_todo": {
      if (typeof payload.text !== "string" || !payload.text.trim()) {
        return { action: "decline" };
      }
      const alertAt = payload.alert_at;
      if (alertAt !== null && alertAt !== undefined && typeof alertAt !== "string") {
        return { action: "decline" };
      }
      return {
        action: "create_todo",
        payload: { text: payload.text, alertAt: (alertAt as string | undefined) ?? null },
      };
    }
    case "create_milestone": {
      const hint = payload.project_title_hint;
      const name = payload.milestone_name;
      const targetDate = payload.target_date;
      if (typeof hint !== "string" || !hint.trim()) return { action: "decline" };
      if (typeof name !== "string" || !name.trim()) return { action: "decline" };
      if (targetDate !== null && targetDate !== undefined && typeof targetDate !== "string") {
        return { action: "decline" };
      }
      return {
        action: "create_milestone",
        payload: {
          projectTitleHint: hint,
          milestoneName: name,
          targetDate: (targetDate as string | undefined) ?? null,
        },
      };
    }
    case "clarify": {
      if (typeof obj.clarifying_question !== "string" || !obj.clarifying_question.trim()) {
        return { action: "decline" };
      }
      return { action: "clarify", clarifyingQuestion: obj.clarifying_question };
    }
    case "decline":
      return { action: "decline" };
    default:
      return { action: "decline" };
  }
}

/**
 * "The bar is 100% certainty, not 'confident enough'" — a single
 * unambiguous exact (case/whitespace-insensitive) match proceeds;
 * zero or multiple candidates both fall back to `clarify`. The app
 * never silently guesses which project a milestone belongs to.
 */
export function matchProjectExact(hint: string, projects: Project[]): Project | null {
  const normalized = hint.trim().toLowerCase();
  const matches = projects.filter((p) => p.title.trim().toLowerCase() === normalized);
  return matches.length === 1 ? matches[0] : null;
}

export interface PriorClarifyExchange {
  originalText: string;
  question: string;
}

function buildLayer1Message(text: string, prior: PriorClarifyExchange | null): string {
  if (!prior) {
    return `${CAPTURE_SYSTEM_PROMPT}\n\nUser input: ${text}`;
  }
  return `${CAPTURE_SYSTEM_PROMPT}\n\nOriginal input: "${prior.originalText}"\nClarifying question asked: "${prior.question}"\nUser's answer: "${text}"\n\nBased on all of the above, return the JSON object.`;
}

/**
 * Runs both layers for one piece of input. Layer 0 (classifyOnTopic)
 * gates Layer 1 entirely — anything that fails Layer 0 declines without
 * ever reaching the real model call, per the design doc's "caught here,
 * locally, before OpenClaw's Tier-1 model ever sees it."
 */
export async function routeCapture(
  text: string,
  deps: { ollamaClient: OllamaClient; openClawClient: OpenClawClient },
  prior: PriorClarifyExchange | null = null,
  grok4Enabled = false,
  localModelId: string = DEFAULT_LOCAL_MODEL_ID,
): Promise<CaptureLayer1Result> {
  // Both layers share one queue slot rather than taking two, so a
  // capture can't be interrupted between its own safety check and the
  // routing call it gates.
  return runAiJob({ kind: "capture", label: "Filing what you just typed" }, async () => {
    const onTopic = await deps.ollamaClient.classifyOnTopic(text);
    if (!onTopic) return { action: "decline" } as CaptureLayer1Result;

    try {
      const result = await deps.openClawClient.runOnce({
        sessionKey: "capture-agent",
        message: buildLayer1Message(text, prior),
        timeoutSecs: 30,
        model: resolveModelOverride(grok4Enabled, localModelId),
      });
      return parseLayer1Response(result.text);
    } catch {
      return { action: "decline" } as CaptureLayer1Result;
    }
  }).catch(() => ({ action: "decline" }) as CaptureLayer1Result);
}
