import type { SqlExecutor } from "../sqlExecutor";
import type { Project, ProjectPriority, ProjectStatus } from "../types";
import { newId, nowIso } from "../sqliteUtil";

export interface CreateProjectInput {
  title: string;
  description?: string | null;
  status?: ProjectStatus;
  targetMonth: string;
  targetDatetime?: string | null;
  priority: ProjectPriority;
}

export interface UpdateProjectInput {
  title?: string;
  description?: string | null;
  status?: ProjectStatus;
  targetMonth?: string;
  targetDatetime?: string | null;
  priority?: ProjectPriority;
}

export function createProjectsRepository(executor: SqlExecutor) {
  return {
    async create(input: CreateProjectInput): Promise<Project> {
      const project: Project = {
        id: newId(),
        title: input.title,
        description: input.description ?? null,
        status: input.status ?? "planned",
        target_month: input.targetMonth,
        target_datetime: input.targetDatetime ?? null,
        priority: input.priority,
        created_at: nowIso(),
        archived_at: null,
      };
      await executor.execute(
        `INSERT INTO projects (id, title, description, status, target_month, target_datetime, priority, created_at, archived_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          project.id,
          project.title,
          project.description,
          project.status,
          project.target_month,
          project.target_datetime,
          project.priority,
          project.created_at,
          project.archived_at,
        ],
      );
      return project;
    },

    async getById(id: string): Promise<Project | null> {
      const rows = await executor.select<Project>(
        "SELECT * FROM projects WHERE id = ?",
        [id],
      );
      return rows[0] ?? null;
    },

    async list(options: { includeArchived?: boolean } = {}): Promise<Project[]> {
      // priority is text ('high'/'medium'/'low') — sorting it directly
      // would go alphabetical (high, low, medium), not the intended
      // high-to-low urgency order, so rank it explicitly.
      const orderBy =
        "ORDER BY target_month, CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 END, rowid";
      if (options.includeArchived) {
        return executor.select<Project>(`SELECT * FROM projects ${orderBy}`);
      }
      return executor.select<Project>(
        `SELECT * FROM projects WHERE archived_at IS NULL ${orderBy}`,
      );
    },

    async update(id: string, patch: UpdateProjectInput): Promise<void> {
      const fields: string[] = [];
      const params: unknown[] = [];
      if (patch.title !== undefined) {
        fields.push("title = ?");
        params.push(patch.title);
      }
      if (patch.description !== undefined) {
        fields.push("description = ?");
        params.push(patch.description);
      }
      if (patch.status !== undefined) {
        fields.push("status = ?");
        params.push(patch.status);
      }
      if (patch.targetMonth !== undefined) {
        fields.push("target_month = ?");
        params.push(patch.targetMonth);
      }
      if (patch.targetDatetime !== undefined) {
        fields.push("target_datetime = ?");
        params.push(patch.targetDatetime);
      }
      if (patch.priority !== undefined) {
        fields.push("priority = ?");
        params.push(patch.priority);
      }
      if (fields.length === 0) return;
      params.push(id);
      await executor.execute(
        `UPDATE projects SET ${fields.join(", ")} WHERE id = ?`,
        params,
      );
    },

    async archive(id: string): Promise<void> {
      await executor.execute("UPDATE projects SET archived_at = ? WHERE id = ?", [
        nowIso(),
        id,
      ]);
    },

    /** Permanent removal, distinct from archive() — SQLite FK enforcement isn't on in this app (no PRAGMA foreign_keys anywhere), so milestones and reports are deleted explicitly rather than relying on a cascade that wouldn't fire. */
    async delete(id: string): Promise<void> {
      await executor.execute("DELETE FROM milestones WHERE project_id = ?", [id]);
      await executor.execute("DELETE FROM project_reports WHERE project_id = ?", [id]);
      await executor.execute("DELETE FROM projects WHERE id = ?", [id]);
    },
  };
}

export type ProjectsRepository = ReturnType<typeof createProjectsRepository>;
