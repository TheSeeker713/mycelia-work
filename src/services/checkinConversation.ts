import type { Task } from "../data";
import { DEFAULT_LOCAL_MODEL_ID, resolveModelOverride, type OpenClawClient } from "./openclawClient";

/** Hard cap on turns — if the model hasn't resolved by then, abandon to the Tier-0 static fallback rather than let a conversation run forever. */
export const MAX_CHECKIN_TURNS = 6;

export interface CheckinOption {
  label: string;
  value: string;
}

export interface CheckinTurn {
  message: string;
  /** Bucketed choices to render as buttons; `null` means this turn expects a short freeform reply instead (the optional closing note). */
  options: CheckinOption[] | null;
  final: boolean;
  resolvedCloseAt: string | null;
  resolvedNote: string | null;
}

/**
 * The fixed system prompt for step 6.4's adaptive reconstruction
 * conversation, per docs/reference/checkin-conversation-guide.md — not
 * improvised per-conversation. Every rule in the guide (anchored not
 * open recall, one question at a time, direct/literal language,
 * non-judgmental tone, predictable structure) is encoded here as an
 * explicit instruction, not left to the model's own judgment.
 */
export function buildCheckinSystemPrompt(task: Task, clockedInAtIso: string, nowIso: string): string {
  return `You are running a short, structured check-in conversation inside Mycelia Time, a time-tracking app. The user clocked into a task and the app never saw them clock out — it's been running unattended since the timestamp below. Your job is to help resolve a real close time for that session, following the rules below exactly. These rules exist because this conversation is designed with ADHD and autism communication needs in mind — follow them even where a more "natural" conversational style would do something different.

Known facts (anchor every question to these, never ask open recall like "how long did you work"):
- Task: ${task.title}
- Clocked in at: ${clockedInAtIso}
- Current time: ${nowIso}

Rules:
1. Direct, literal language. No idioms, no rhetorical questions, no small talk, no sarcasm.
2. One question at a time. Never ask more than one thing in a single message.
3. Every question anchors to the known clock-in time or task title above — never open-ended time recall.
4. Non-judgmental tone. Forgetting to clock out is normal, not a failure — no apologizing on the user's behalf, no guilt-tripping, no exclamation-point cheerfulness either.
5. Bucketed, multiple-choice-style options wherever possible (2-4 short choices). Only ask for freeform text for the single optional closing note about what happened, and say plainly that it's optional.
6. You must resolve to a final answer within ${MAX_CHECKIN_TURNS} messages total, including this one.
7. The final message must set "final": true, a concrete "resolvedCloseAt" (ISO 8601 timestamp, not earlier than the clock-in time and not later than the current time above), and "resolvedNote" (a short string if the user gave one, otherwise null).

Output format — this is strict, read it carefully:
Respond with ONLY a single JSON object, no markdown code fences, no commentary before or after it, matching exactly this shape:
{"message": string, "options": [{"label": string, "value": string}] | null, "final": boolean, "resolvedCloseAt": string | null, "resolvedNote": string | null}

Start now with your first question.`;
}

function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenced ? fenced[1] : trimmed;
}

function isValidOptions(value: unknown): value is CheckinOption[] | null {
  if (value === null) return true;
  if (!Array.isArray(value) || value.length < 2 || value.length > 6) return false;
  return value.every(
    (o) =>
      typeof o === "object" &&
      o !== null &&
      typeof (o as { label?: unknown }).label === "string" &&
      (o as { label: string }).label.trim().length > 0 &&
      typeof (o as { value?: unknown }).value === "string" &&
      (o as { value: string }).value.trim().length > 0,
  );
}

/**
 * Fails closed: anything that doesn't match the exact expected shape
 * returns `null` rather than a best-effort guess, which is what tells
 * the calling flow to abandon the adaptive conversation and fall back
 * to the static Tier-0 dialogue.
 */
export function parseCheckinTurn(raw: string): CheckinTurn | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(raw));
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;

  if (typeof obj.message !== "string" || obj.message.trim().length === 0) return null;
  if (!isValidOptions(obj.options)) return null;
  if (typeof obj.final !== "boolean") return null;

  if (obj.final) {
    if (typeof obj.resolvedCloseAt !== "string") return null;
    const parsedDate = new Date(obj.resolvedCloseAt);
    if (Number.isNaN(parsedDate.getTime())) return null;
    if (obj.resolvedNote !== null && typeof obj.resolvedNote !== "string") return null;
    return {
      message: obj.message,
      options: obj.options as CheckinOption[] | null,
      final: true,
      resolvedCloseAt: obj.resolvedCloseAt,
      resolvedNote: (obj.resolvedNote as string | null) ?? null,
    };
  }

  return {
    message: obj.message,
    options: obj.options as CheckinOption[] | null,
    final: false,
    resolvedCloseAt: null,
    resolvedNote: null,
  };
}

export async function startCheckinConversation(
  client: OpenClawClient,
  task: Task,
  clockedInAtIso: string,
  sessionKey: string,
  grok4Enabled = false,
  localModelId: string = DEFAULT_LOCAL_MODEL_ID,
): Promise<CheckinTurn | null> {
  try {
    const prompt = buildCheckinSystemPrompt(task, clockedInAtIso, new Date().toISOString());
    const result = await client.call({
      sessionKey,
      message: prompt,
      timeoutSecs: 60,
      model: resolveModelOverride(grok4Enabled, localModelId),
    });
    return parseCheckinTurn(result.text);
  } catch {
    return null;
  }
}

export async function continueCheckinConversation(
  client: OpenClawClient,
  sessionKey: string,
  userReply: string,
  grok4Enabled = false,
  localModelId: string = DEFAULT_LOCAL_MODEL_ID,
): Promise<CheckinTurn | null> {
  try {
    const result = await client.call({
      sessionKey,
      message: userReply,
      timeoutSecs: 60,
      model: resolveModelOverride(grok4Enabled, localModelId),
    });
    return parseCheckinTurn(result.text);
  } catch {
    return null;
  }
}
