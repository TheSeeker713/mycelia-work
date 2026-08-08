import type { SqlExecutor } from "../sqlExecutor";
import type { ProjectAssistNote } from "../types";
import { newId, nowIso } from "../sqliteUtil";

/** Real kept content now, not a shown-once-and-discarded toast — see ProjectAssistNote's own doc comment for why. */
export function createProjectAssistNotesRepository(executor: SqlExecutor) {
  return {
    async create(
      projectId: string,
      action: string,
      content: string,
      question: string | null = null,
    ): Promise<ProjectAssistNote> {
      const note: ProjectAssistNote = {
        id: newId(),
        project_id: projectId,
        action,
        question,
        content,
        created_at: nowIso(),
      };
      await executor.execute(
        `INSERT INTO project_assist_notes (id, project_id, action, question, content, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [note.id, note.project_id, note.action, note.question, note.content, note.created_at],
      );
      return note;
    },

    async listByProject(projectId: string): Promise<ProjectAssistNote[]> {
      return executor.select<ProjectAssistNote>(
        "SELECT * FROM project_assist_notes WHERE project_id = ? ORDER BY created_at DESC, rowid DESC",
        [projectId],
      );
    },
  };
}

export type ProjectAssistNotesRepository = ReturnType<typeof createProjectAssistNotesRepository>;
