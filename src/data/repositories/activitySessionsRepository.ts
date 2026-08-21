import type { SqlExecutor } from "../sqlExecutor";
import { newId } from "../sqliteUtil";

export type ActivitySessionStatus = "candidate" | "accepted" | "discarded";

export interface ActivitySession {
  id: string;
  started_at: string;
  ended_at: string;
  app: string;
  title: string | null;
  label: string | null;
  status: ActivitySessionStatus;
  task_id: string | null;
  project_id: string | null;
  task_session_id: string | null;
  idle: number;
}

export function createActivitySessionsRepository(executor: SqlExecutor) {
  return {
    async create(input: {
      started_at: string;
      ended_at: string;
      app: string;
      title?: string | null;
      idle: boolean;
    }): Promise<ActivitySession> {
      const row: ActivitySession = {
        id: newId(),
        started_at: input.started_at,
        ended_at: input.ended_at,
        app: input.app,
        title: input.title ?? null,
        label: null,
        status: "candidate",
        task_id: null,
        project_id: null,
        task_session_id: null,
        idle: input.idle ? 1 : 0,
      };
      await executor.execute(
        `INSERT INTO activity_sessions (id, started_at, ended_at, app, title, label, status, task_id, project_id, task_session_id, idle)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.started_at,
          row.ended_at,
          row.app,
          row.title,
          row.label,
          row.status,
          row.task_id,
          row.project_id,
          row.task_session_id,
          row.idle,
        ],
      );
      return row;
    },

    async attach(id: string, patch: { taskId?: string | null; projectId?: string | null; taskSessionId?: string | null }) {
      await executor.execute(
        `UPDATE activity_sessions SET task_id = COALESCE(?, task_id), project_id = COALESCE(?, project_id), task_session_id = COALESCE(?, task_session_id), status = 'accepted' WHERE id = ?`,
        [patch.taskId ?? null, patch.projectId ?? null, patch.taskSessionId ?? null, id],
      );
    },

    async setLabel(id: string, label: string) {
      await executor.execute(`UPDATE activity_sessions SET label = ? WHERE id = ?`, [label, id]);
    },

    async setStatus(id: string, status: ActivitySessionStatus) {
      await executor.execute(`UPDATE activity_sessions SET status = ? WHERE id = ?`, [status, id]);
    },

    async listForDay(dayIso: string): Promise<ActivitySession[]> {
      const start = `${dayIso}T00:00:00.000Z`;
      const end = `${dayIso}T23:59:59.999Z`;
      return executor.select<ActivitySession>(
        `SELECT * FROM activity_sessions WHERE started_at >= ? AND started_at <= ? ORDER BY started_at`,
        [start, end],
      );
    },

    async listAcceptedBetween(fromIso: string, toIso: string): Promise<ActivitySession[]> {
      return executor.select<ActivitySession>(
        `SELECT * FROM activity_sessions WHERE status = 'accepted' AND started_at >= ? AND started_at <= ? ORDER BY started_at`,
        [fromIso, toIso],
      );
    },
  };
}

export type ActivitySessionsRepository = ReturnType<typeof createActivitySessionsRepository>;
