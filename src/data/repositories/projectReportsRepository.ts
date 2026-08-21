import type { SqlExecutor } from "../sqlExecutor";
import type { AiBackendId, ProjectReport } from "../types";
import { newId, nowIso } from "../sqliteUtil";

/** Same shape/lifecycle as journalsRepository — status reports are real kept content, not a transient export, per the design doc. */
export function createProjectReportsRepository(executor: SqlExecutor) {
  return {
    async createPending(projectId: string): Promise<ProjectReport> {
      const report: ProjectReport = {
        id: newId(),
        project_id: projectId,
        generated_at: nowIso(),
        model_used: null,
        status: "pending",
        content: null,
        failure_reason: null,
        backend_used: null,
        used_fallback: null,
      };
      await executor.execute(
        `INSERT INTO project_reports (id, project_id, generated_at, model_used, status, content, failure_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          report.id,
          report.project_id,
          report.generated_at,
          report.model_used,
          report.status,
          report.content,
          report.failure_reason,
        ],
      );
      return report;
    },

    async markResult(
      id: string,
      patch: {
        status: "ok" | "failed";
        content?: string | null;
        modelUsed?: string | null;
        failureReason?: string;
        backendUsed?: AiBackendId | null;
        usedFallback?: boolean;
      },
    ): Promise<void> {
      await executor.execute(
        "UPDATE project_reports SET status = ?, content = ?, model_used = ?, failure_reason = ?, backend_used = ?, used_fallback = ? WHERE id = ?",
        [
          patch.status,
          patch.content ?? null,
          patch.modelUsed ?? null,
          patch.failureReason ?? null,
          patch.backendUsed ?? null,
          patch.usedFallback === undefined ? null : patch.usedFallback ? 1 : 0,
          id,
        ],
      );
    },

    async markPending(id: string): Promise<void> {
      await executor.execute(
        "UPDATE project_reports SET status = 'pending', failure_reason = NULL WHERE id = ?",
        [id],
      );
    },

    async markStalePendingAsFailed(olderThanIso: string, reason: string): Promise<number> {
      const result = await executor.execute(
        `UPDATE project_reports SET status = 'failed', failure_reason = ? WHERE status = 'pending' AND generated_at < ?`,
        [reason, olderThanIso],
      );
      return result.rowsAffected;
    },

    async listByProject(projectId: string): Promise<ProjectReport[]> {
      return executor.select<ProjectReport>(
        "SELECT * FROM project_reports WHERE project_id = ? ORDER BY generated_at DESC, rowid DESC",
        [projectId],
      );
    },

    /** A real delete, not a status change — for the exit flow's "quit now" path, which discards an in-flight draft rather than leaving it around as a failed row. */
    async delete(id: string): Promise<void> {
      await executor.execute("DELETE FROM project_reports WHERE id = ?", [id]);
    },
  };
}

export type ProjectReportsRepository = ReturnType<typeof createProjectReportsRepository>;
