import type { SqlExecutor } from "../sqlExecutor";
import type { Journal, JournalKind, JournalStatus } from "../types";
import { newId, nowIso } from "../sqliteUtil";

export interface CreatePendingJournalInput {
  taskId?: string | null;
  taskSessionId?: string | null;
  kind: JournalKind;
}

export function createJournalsRepository(executor: SqlExecutor) {
  return {
    /** A journal always starts `pending` — the generation call fills it in afterward, success or failure. */
    async createPending(input: CreatePendingJournalInput): Promise<Journal> {
      const journal: Journal = {
        id: newId(),
        task_id: input.taskId ?? null,
        task_session_id: input.taskSessionId ?? null,
        generated_at: nowIso(),
        model_used: null,
        status: "pending",
        content: null,
        exported_path: null,
        kind: input.kind,
        failure_reason: null,
      };
      await executor.execute(
        `INSERT INTO journals (id, task_id, task_session_id, generated_at, model_used, status, content, exported_path, kind)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          journal.id,
          journal.task_id,
          journal.task_session_id,
          journal.generated_at,
          journal.model_used,
          journal.status,
          journal.content,
          journal.exported_path,
          journal.kind,
        ],
      );
      return journal;
    },

    async markResult(
      id: string,
      status: JournalStatus,
      patch: { modelUsed?: string; content?: string; exportedPath?: string; failureReason?: string } = {},
    ): Promise<void> {
      await executor.execute(
        `UPDATE journals SET status = ?, model_used = ?, content = ?, exported_path = ?, failure_reason = ? WHERE id = ?`,
        [
          status,
          patch.modelUsed ?? null,
          patch.content ?? null,
          patch.exportedPath ?? null,
          patch.failureReason ?? null,
          id,
        ],
      );
    },

    /** A real delete, not a status change — for the exit flow's "quit now" path, which discards an in-flight draft rather than leaving it around as a failed row. */
    async delete(id: string): Promise<void> {
      await executor.execute("DELETE FROM journals WHERE id = ?", [id]);
    },

    async getById(id: string): Promise<Journal | null> {
      const rows = await executor.select<Journal>(
        "SELECT * FROM journals WHERE id = ?",
        [id],
      );
      return rows[0] ?? null;
    },

    async listByTask(taskId: string): Promise<Journal[]> {
      return executor.select<Journal>(
        "SELECT * FROM journals WHERE task_id = ? ORDER BY generated_at, rowid",
        [taskId],
      );
    },

    /** Most recent journals across every task, newest first — the in-app Work Journal list. */
    async listRecent(limit: number): Promise<Journal[]> {
      return executor.select<Journal>(
        "SELECT * FROM journals ORDER BY generated_at DESC, rowid DESC LIMIT ?",
        [limit],
      );
    },

    /**
     * A journal stuck on `pending` past a reasonable generation window
     * (real calls finish in well under a minute) is orphaned — almost
     * always an interrupted app process (a reload during dev, or the
     * freeze bug that predates the async-command fix), not still
     * running. Sweeping these to `failed` is what turns "Generating…"
     * forever into an honest, retryable state. Returns how many rows
     * it touched.
     */
    async markStalePendingAsFailed(olderThanIso: string, reason: string): Promise<number> {
      const result = await executor.execute(
        `UPDATE journals SET status = 'failed', failure_reason = ? WHERE status = 'pending' AND generated_at < ?`,
        [reason, olderThanIso],
      );
      return result.rowsAffected;
    },
  };
}

export type JournalsRepository = ReturnType<typeof createJournalsRepository>;
