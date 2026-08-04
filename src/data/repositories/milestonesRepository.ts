import type { SqlExecutor } from "../sqlExecutor";
import type { Milestone } from "../types";
import { newId, nowIso } from "../sqliteUtil";

export function createMilestonesRepository(executor: SqlExecutor) {
  return {
    async create(
      projectId: string,
      name: string,
      targetDate: string | null = null,
    ): Promise<Milestone> {
      const milestone: Milestone = {
        id: newId(),
        project_id: projectId,
        name,
        target_date: targetDate,
        created_at: nowIso(),
        completed_at: null,
      };
      await executor.execute(
        `INSERT INTO milestones (id, project_id, name, target_date, created_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          milestone.id,
          milestone.project_id,
          milestone.name,
          milestone.target_date,
          milestone.created_at,
          milestone.completed_at,
        ],
      );
      return milestone;
    },

    async listByProject(projectId: string): Promise<Milestone[]> {
      return executor.select<Milestone>(
        "SELECT * FROM milestones WHERE project_id = ? ORDER BY (target_date IS NULL), target_date, created_at",
        [projectId],
      );
    },

    async complete(id: string): Promise<void> {
      await executor.execute("UPDATE milestones SET completed_at = ? WHERE id = ?", [
        nowIso(),
        id,
      ]);
    },

    async delete(id: string): Promise<void> {
      await executor.execute("DELETE FROM milestones WHERE id = ?", [id]);
    },
  };
}

export type MilestonesRepository = ReturnType<typeof createMilestonesRepository>;
