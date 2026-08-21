import { create } from "zustand";
import type { Journal, Repositories, Task } from "../data";
import type { OpenClawClient } from "../services/openclawClient";
import type { OllamaClient } from "../services/ollamaClient";
import {
  buildSessionJournalPrompt,
  buildWeeklyRollupPrompt,
  runJournalGeneration,
  sessionJournalFilename,
  sweepStalePendingJournals,
  weeklyRollupFilename,
} from "../services/journalGeneration";
import { formatContextForPrompt, loadWorkContext } from "../services/contextBus";

const RECENT_JOURNALS_LIMIT = 20;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface JournalsState {
  journals: Journal[];
  loadRecent: () => Promise<void>;
  /**
   * Fetches this session's own events/notes fresh from the repository
   * rather than trusting whatever's cached in another store — a
   * just-clocked-out session's notes may not be loaded into
   * `notesStore` yet, and this always needs the true, current record.
   */
  /** Re-fetches the session fresh (not from another store's cache) so a just-closed session's `clocked_out_at` is always current. Optional `brief` is Jeremy's own few-word steer from the clock-out popup, folded into the prompt. */
  generateSessionJournal: (task: Task, sessionId: string, brief?: string) => Promise<void>;
  generateWeeklyRollup: () => Promise<void>;
  retryJournal: (journalId: string) => Promise<void>;
  /** For the exit flow's "quit now" path — deletes whichever journal is still `pending`, a real discard rather than leaving it to fail. No-op if nothing's pending. */
  discardPending: () => Promise<void>;
  /** The clock-out popup's "I'll write it" path — a report with no generation involved, `ok` from the start with empty content, ready to type into. Returns the created row so the caller can navigate to and focus it. */
  createManualReport: (taskId: string, sessionId: string) => Promise<Journal>;
  /** Saves manually-typed report content — reused for every edit, not just the first. */
  saveManualReport: (journalId: string, content: string) => Promise<void>;
}

function upsert(journals: Journal[], updated: Journal): Journal[] {
  return journals.some((j) => j.id === updated.id)
    ? journals.map((j) => (j.id === updated.id ? updated : j))
    : [updated, ...journals];
}

export function createJournalsStore(repos: Repositories, client: OpenClawClient, ollama: OllamaClient) {
  const retrying = new Set<string>();
  return create<JournalsState>((set, get) => ({
    journals: [],

    async loadRecent() {
      await sweepStalePendingJournals(repos);
      const journals = await repos.journals.listRecent(RECENT_JOURNALS_LIMIT);
      set({ journals });
    },

    async generateSessionJournal(task, sessionId, brief) {
      const session = await repos.taskSessions.getById(sessionId);
      if (!session) return;

      const pending = await repos.journals.createPending({
        taskId: task.id,
        taskSessionId: session.id,
        kind: "session",
      });
      set({ journals: upsert(get().journals, pending) });

      const events = await repos.sessionEvents.listBySession(session.id);
      const notes = await repos.notes.listBySession(session.id);

      const result = await runJournalGeneration({
        repos,
        client,
        ollama,
        journalId: pending.id,
        sessionKey: `agent:main:mycelia-time-journal-${session.id}`,
        prompt: buildSessionJournalPrompt(
          { task, session, events, notes },
          brief,
          formatContextForPrompt(await loadWorkContext(repos)),
        ),
        filename: sessionJournalFilename(task, new Date(pending.generated_at)),
      });
      set({ journals: upsert(get().journals, result) });
    },

    async generateWeeklyRollup() {
      const cutoff = Date.now() - WEEK_MS;
      const recentSessionJournals = get().journals.filter(
        (j) => j.kind === "session" && j.status === "ok" && new Date(j.generated_at).getTime() >= cutoff,
      );

      const pending = await repos.journals.createPending({ kind: "weekly" });
      set({ journals: upsert(get().journals, pending) });

      const generatedAt = new Date(pending.generated_at);
      const result = await runJournalGeneration({
        repos,
        client,
        ollama,
        journalId: pending.id,
        sessionKey: `agent:main:mycelia-time-weekly-${pending.id}`,
        prompt: buildWeeklyRollupPrompt(recentSessionJournals, generatedAt.toLocaleDateString()),
        filename: weeklyRollupFilename(generatedAt),
      });
      set({ journals: upsert(get().journals, result) });
    },

    async retryJournal(journalId) {
      if (retrying.has(journalId)) return;
      const existing = get().journals.find((j) => j.id === journalId) ?? (await repos.journals.getById(journalId));
      if (!existing) return;
      retrying.add(journalId);

      try {
        const pending = await repos.journals.markPending(journalId);
        if (pending) set({ journals: upsert(get().journals, pending) });

        if (existing.kind === "weekly") {
          const cutoff = new Date(existing.generated_at).getTime() - WEEK_MS;
          const recentSessionJournals = get().journals.filter(
            (j) =>
              j.kind === "session" &&
              j.status === "ok" &&
              j.id !== journalId &&
              new Date(j.generated_at).getTime() >= cutoff,
          );
          const generatedAt = new Date(existing.generated_at);
          const result = await runJournalGeneration({
            repos,
            client,
            ollama,
            journalId,
            sessionKey: `agent:main:mycelia-time-weekly-${journalId}`,
            prompt: buildWeeklyRollupPrompt(recentSessionJournals, generatedAt.toLocaleDateString()),
            filename: weeklyRollupFilename(generatedAt),
          });
          set({ journals: upsert(get().journals, result) });
          return;
        }

        if (!existing.task_id || !existing.task_session_id) return;
        const task = await repos.tasks.getById(existing.task_id);
        const session = await repos.taskSessions.getById(existing.task_session_id);
        if (!task || !session) return;
        const events = await repos.sessionEvents.listBySession(session.id);
        const notes = await repos.notes.listBySession(session.id);

        const result = await runJournalGeneration({
          repos,
          client,
          ollama,
          journalId,
          sessionKey: `agent:main:mycelia-time-journal-${session.id}`,
          prompt: buildSessionJournalPrompt(
            { task, session, events, notes },
            undefined,
            formatContextForPrompt(await loadWorkContext(repos)),
          ),
          filename: sessionJournalFilename(task, new Date(existing.generated_at)),
        });
        set({ journals: upsert(get().journals, result) });
      } finally {
        retrying.delete(journalId);
      }
    },

    async discardPending() {
      const pending = get().journals.find((j) => j.status === "pending");
      if (!pending) return;
      await repos.journals.delete(pending.id);
      set({ journals: get().journals.filter((j) => j.id !== pending.id) });
    },

    async createManualReport(taskId, sessionId) {
      const manual = await repos.journals.createManual({
        taskId,
        taskSessionId: sessionId,
        kind: "session",
      });
      set({ journals: upsert(get().journals, manual) });
      return manual;
    },

    async saveManualReport(journalId, content) {
      await repos.journals.markResult(journalId, "ok", { content });
      const updated = await repos.journals.getById(journalId);
      if (updated) set({ journals: upsert(get().journals, updated) });
    },
  }));
}

export type JournalsStore = ReturnType<typeof createJournalsStore>;
