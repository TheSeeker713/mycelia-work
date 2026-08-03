import type { SqlExecutor } from "../sqlExecutor";
import type { Task } from "../types";
import { fromBool, newId, nowIso, toBool } from "../sqliteUtil";

interface TaskRow {
  id: string;
  title: string;
  tag: string | null;
  project_id: string | null;
  billable: number;
  completed_at: string | null;
  created_at: string;
  archived_at: string | null;
}

function mapRow(row: TaskRow): Task {
  return { ...row, billable: toBool(row.billable) };
}

export interface CreateTaskInput {
  title: string;
  tag?: string | null;
  projectId?: string | null;
  billable?: boolean;
}

export function createTasksRepository(executor: SqlExecutor) {
  return {
    async create(input: CreateTaskInput): Promise<Task> {
      const task: Task = {
        id: newId(),
        title: input.title,
        tag: input.tag ?? null,
        project_id: input.projectId ?? null,
        billable: input.billable ?? false,
        completed_at: null,
        created_at: nowIso(),
        archived_at: null,
      };
      await executor.execute(
        `INSERT INTO tasks (id, title, tag, project_id, billable, completed_at, created_at, archived_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          task.id,
          task.title,
          task.tag,
          task.project_id,
          fromBool(task.billable),
          task.completed_at,
          task.created_at,
          task.archived_at,
        ],
      );
      return task;
    },

    async getById(id: string): Promise<Task | null> {
      const rows = await executor.select<TaskRow>(
        "SELECT * FROM tasks WHERE id = ?",
        [id],
      );
      return rows[0] ? mapRow(rows[0]) : null;
    },

    async listByProject(projectId: string): Promise<Task[]> {
      const rows = await executor.select<TaskRow>(
        "SELECT * FROM tasks WHERE project_id = ? AND archived_at IS NULL ORDER BY created_at, rowid",
        [projectId],
      );
      return rows.map(mapRow);
    },

    async list(options: { includeArchived?: boolean } = {}): Promise<Task[]> {
      const rows = options.includeArchived
        ? await executor.select<TaskRow>(
            "SELECT * FROM tasks ORDER BY created_at, rowid",
          )
        : await executor.select<TaskRow>(
            "SELECT * FROM tasks WHERE archived_at IS NULL ORDER BY created_at, rowid",
          );
      return rows.map(mapRow);
    },

    async complete(id: string): Promise<void> {
      await executor.execute("UPDATE tasks SET completed_at = ? WHERE id = ?", [
        nowIso(),
        id,
      ]);
    },

    async archive(id: string): Promise<void> {
      await executor.execute("UPDATE tasks SET archived_at = ? WHERE id = ?", [
        nowIso(),
        id,
      ]);
    },
  };
}

export type TasksRepository = ReturnType<typeof createTasksRepository>;
