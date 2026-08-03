import type { SqlExecutor } from "../sqlExecutor";
import type { Note } from "../types";
import { newId, nowIso } from "../sqliteUtil";

export function createNotesRepository(executor: SqlExecutor) {
  return {
    async create(taskSessionId: string, body: string): Promise<Note> {
      const note: Note = {
        id: newId(),
        task_session_id: taskSessionId,
        body,
        created_at: nowIso(),
      };
      await executor.execute(
        `INSERT INTO notes (id, task_session_id, body, created_at) VALUES (?, ?, ?, ?)`,
        [note.id, note.task_session_id, note.body, note.created_at],
      );
      return note;
    },

    async listBySession(taskSessionId: string): Promise<Note[]> {
      return executor.select<Note>(
        "SELECT * FROM notes WHERE task_session_id = ? ORDER BY created_at, rowid",
        [taskSessionId],
      );
    },
  };
}

export type NotesRepository = ReturnType<typeof createNotesRepository>;
