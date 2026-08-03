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
      patch: { modelUsed?: string; content?: string; exportedPath?: string } = {},
    ): Promise<void> {
      await executor.execute(
        `UPDATE journals SET status = ?, model_used = ?, content = ?, exported_path = ? WHERE id = ?`,
        [
          status,
          patch.modelUsed ?? null,
          patch.content ?? null,
          patch.exportedPath ?? null,
          id,
        ],
      );
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
  };
}

export type JournalsRepository = ReturnType<typeof createJournalsRepository>;
