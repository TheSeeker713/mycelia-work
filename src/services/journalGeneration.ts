import { invoke } from "@tauri-apps/api/core";
import voiceNotes from "../../docs/reference/authentic-voice-notes.md?raw";
import type {
  Journal,
  Note,
  Repositories,
  SessionEvent,
  Task,
  TaskSession,
} from "../data";
import {
  DEFAULT_LOCAL_MODEL_ID,
  GROK4_ENABLED_KEY,
  LOCAL_MODEL_ID_KEY,
  PREFERRED_MODEL_KEY,
  resolveModelOverride,
  type OpenClawClient,
} from "./openclawClient";
import type { OllamaClient } from "./ollamaClient";
import { runAiJob } from "./aiQueue";
import { routeAiCall, type RoutedResult } from "./aiBackendRouter";

export interface RawSessionLog {
  task: Task;
  session: TaskSession;
  events: SessionEvent[];
  /**
   * Includes any forgot-to-clock-out check-in exchange, since that gets
   * folded in as a real note on the session rather than kept separate —
   * the same note is then visible in the Notes compartment, not just
   * baked invisibly into this prompt.
   */
  notes: Note[];
}

const EVENT_LABELS: Record<SessionEvent["type"], string> = {
  clock_in: "Clocked in",
  break_start: "Started a break",
  break_resume: "Resumed from break",
  clock_out: "Clocked out",
  reconstructed: "Closed via forgot-to-clock-out check-in",
};

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Same slugging rule the plan's filename pattern implies: lowercase, spaces to hyphens, strip anything else. */
export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "untitled"
  );
}

/**
 * Both halves come from local time — mixing `toISOString` (UTC) for the
 * date with local wall-clock time for the HHmm half is a real bug: near
 * midnight, in any timezone that isn't UTC, the two can land on
 * different calendar days.
 */
function filenameStamp(generatedAt: Date): { date: string; time: string } {
  const year = generatedAt.getFullYear();
  const month = String(generatedAt.getMonth() + 1).padStart(2, "0");
  const day = String(generatedAt.getDate()).padStart(2, "0");
  const hours = String(generatedAt.getHours()).padStart(2, "0");
  const minutes = String(generatedAt.getMinutes()).padStart(2, "0");
  return { date: `${year}-${month}-${day}`, time: `${hours}${minutes}` };
}

export function sessionJournalFilename(task: Task, generatedAt: Date): string {
  const { date, time } = filenameStamp(generatedAt);
  return `${date}_${time}_${slugify(task.title)}.md`;
}

export function weeklyRollupFilename(generatedAt: Date): string {
  const { date, time } = filenameStamp(generatedAt);
  return `${date}_${time}_weekly-rollup.md`;
}

/**
 * For the Library compartment's manual "Export" button — every journal
 * already auto-exports on generation (below), but that's invisible in
 * the UI, so this gives a real, explicit re-export path a user can
 * trigger and get confirmation from. Doesn't need the original Task
 * (unlike sessionJournalFilename), since a Journal record on its own
 * only has task_id, not the task's title.
 */
export function libraryExportFilename(journal: Journal): string {
  const { date, time } = filenameStamp(new Date(journal.generated_at));
  return journal.kind === "weekly" ? `${date}_${time}_weekly-rollup.md` : `${date}_${time}_session-journal.md`;
}

/**
 * The generation prompt includes the voice-rules doc directly (not just
 * a reference to it) so the generated entry doesn't read as AI-toned
 * filler, per CLAUDE.md — same document the devlogs themselves follow.
 */
export function buildSessionJournalPrompt(log: RawSessionLog, brief?: string, contextBlock?: string): string {
  const { task, session, events, notes } = log;

  const eventLines = events
    .map((e) => `- ${formatTimestamp(e.occurred_at)} — ${EVENT_LABELS[e.type]}`)
    .join("\n");

  const noteLines =
    notes.length > 0
      ? notes.map((n) => `- ${formatTimestamp(n.created_at)}: ${n.body}`).join("\n")
      : "(no notes taken during this session)";

  // The clock-out prompt's optional "in a few words, what did you do?"
  // field — folded in as Jeremy's own steer on what the entry should
  // actually cover, not just inferred from the raw event/note log.
  const briefSection = brief?.trim() ? `\n\nJeremy's own brief note on what he did:\n${brief.trim()}` : "";

  return `${voiceNotes}

---

Using the voice rules above, write a first-person work journal entry as
Jeremy, documenting the work session below. Output ONLY the journal
entry text itself — no preamble, no meta-commentary about what you're
about to write, no markdown title unless it reads naturally as part of
the entry.

Task: ${task.title}${task.tag ? ` (tag: ${task.tag})` : ""}
Clocked in: ${formatTimestamp(session.clocked_in_at)}
Clocked out: ${session.clocked_out_at ? formatTimestamp(session.clocked_out_at) : "still running"}${session.is_estimated ? " (estimated close time, not a live clock-out)" : ""}

Session event log:
${eventLines}

Notes taken during the session:
${noteLines}${briefSection}${contextBlock?.trim() ? `\n\n${contextBlock.trim()}` : ""}`;
}

export function buildWeeklyRollupPrompt(sessionJournals: Journal[], weekLabel: string): string {
  const entries = sessionJournals
    .filter((j) => j.content)
    .map((j) => `### ${formatTimestamp(j.generated_at)}\n\n${j.content}`)
    .join("\n\n");

  return `${voiceNotes}

---

Using the voice rules above, write a first-person weekly review as
Jeremy, summarizing the work documented in the session journal entries
below (week: ${weekLabel}). Output ONLY the weekly review text itself —
no preamble, no meta-commentary, no markdown title unless it reads
naturally as part of the entry.

${entries || "(no session journal entries logged this week)"}`;
}

export function exportWorkJournalFile(filename: string, content: string): Promise<string> {
  return invoke<string>("export_workjournal_file", { filename, content });
}

/**
 * Real generation calls finish in well under a minute (session journal
 * ~5-15s for the model turn, plus a fast local file write) — anything
 * still `pending` past this is orphaned, not slow. Generous on purpose:
 * this should never mistake a genuinely in-flight call for a stuck one.
 */
export const STALE_PENDING_THRESHOLD_MS = 3 * 60 * 1000;
const STALE_PENDING_REASON =
  "Generation didn't finish — the app was likely closed or reloaded mid-run.";

/**
 * Sweeps journals stuck on `pending` from an interrupted process (a dev
 * reload, or the app-freeze bug fixed in Phase 7's test pass) into a
 * real `failed` state, so "Generating…" forever becomes an honest,
 * retryable "Failed" instead. Safe to call on every load — a no-op when
 * nothing's actually stale.
 */
export function sweepStalePendingJournals(repos: Repositories, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - STALE_PENDING_THRESHOLD_MS).toISOString();
  return repos.journals.markStalePendingAsFailed(cutoff, STALE_PENDING_REASON);
}

/**
 * Grok-off reports skip OpenClaw's CLI/gateway entirely (see
 * `OllamaClient.generateReport`'s doc comment) — no ~60s fixed tax to
 * budget for, only real local-model inference time, so this stays well
 * under the OpenClaw path's own 180s timeout.
 */
const LOCAL_REPORT_TIMEOUT_SECS = 90;

/** One automatic retry, for the direct-Ollama path. A cold model load can genuinely fail once and succeed immediately after. */
async function runLocalReportWithRetry(
  ollama: OllamaClient,
  prompt: string,
  model: string,
): Promise<RoutedResult> {
  const call = async (): Promise<RoutedResult> => ({
    text: await ollama.generateReport(prompt, model, LOCAL_REPORT_TIMEOUT_SECS),
    model: `ollama/${model}`,
    backend: "ollama",
    // Local is the deliberate choice when Grok is off, not a fallback.
    usedFallback: false,
  });
  try {
    return await call();
  } catch {
    return await call();
  }
}

/**
 * Runs one generation attempt against an already-`pending` journal row
 * and always resolves it to `ok` or `failed` — never leaves it dangling
 * `pending` on a thrown error, so the UI's retry affordance always has
 * something concrete to react to.
 */
export async function runJournalGeneration(params: {
  repos: Repositories;
  client: OpenClawClient;
  ollama: OllamaClient;
  journalId: string;
  sessionKey: string;
  prompt: string;
  filename: string;
}): Promise<Journal> {
  const { repos, client, ollama, journalId, sessionKey, prompt, filename } = params;
  try {
    const grok4Enabled = (await repos.settings.get(GROK4_ENABLED_KEY)) === "true";
    const localModelId = (await repos.settings.get(LOCAL_MODEL_ID_KEY)) ?? DEFAULT_LOCAL_MODEL_ID;
    const preferredModel = (await repos.settings.get(PREFERRED_MODEL_KEY)) ?? "";
    // Under the app-wide AI lock: one model call at a time across the
    // whole app, so this can't fight a ghost-text suggestion or a
    // capture classification for the same CPU.
    //
    // Grok on goes through the router (connect retries, preferred-model
    // retry, then a direct-Ollama fallback if OpenClaw never answers).
    // Grok off skips OpenClaw entirely, which is the point of 16.1 —
    // there's no gateway overhead to route around when the whole call
    // is already local.
    const result = await runAiJob({ kind: "journal", label: "Writing your report" }, () =>
      grok4Enabled
        ? routeAiCall({
            openClaw: client,
            ollama,
            input: {
              sessionKey,
              message: prompt,
              timeoutSecs: 180,
              model: resolveModelOverride(grok4Enabled, localModelId, preferredModel),
            },
            preferredModel,
            localModelId,
            localTimeoutSecs: LOCAL_REPORT_TIMEOUT_SECS,
          })
        : runLocalReportWithRetry(ollama, prompt, localModelId),
    );
    const exportedPath = await exportWorkJournalFile(filename, result.text);
    await repos.journals.markResult(journalId, "ok", {
      modelUsed: result.model,
      content: result.text,
      exportedPath,
      backendUsed: result.backend,
      usedFallback: result.usedFallback,
    });
  } catch (err) {
    // Raw log is untouched either way — the journal row is the only
    // thing that moves to `failed`, so retrying just re-runs generation.
    const failureReason = err instanceof Error ? err.message : String(err);
    await repos.journals.markResult(journalId, "failed", { failureReason });
  }
  const updated = await repos.journals.getById(journalId);
  if (!updated) {
    throw new Error(`journal ${journalId} disappeared during generation`);
  }
  return updated;
}
