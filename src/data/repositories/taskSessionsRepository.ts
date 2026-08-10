import type { SqlExecutor } from "../sqlExecutor";
import type { TaskSession, TaskSessionStatus } from "../types";
import { fromBool, newId, nowIso, toBool } from "../sqliteUtil";
import { createSessionEventsRepository } from "./sessionEventsRepository";

interface TaskSessionRow {
  id: string;
  task_id: string;
  clocked_in_at: string;
  clocked_out_at: string | null;
  status: TaskSessionStatus;
  is_estimated: number;
}

function mapRow(row: TaskSessionRow): TaskSession {
  return { ...row, is_estimated: toBool(row.is_estimated) };
}

export function createTaskSessionsRepository(executor: SqlExecutor) {
  const sessionEvents = createSessionEventsRepository(executor);

  return {
    /** Starts a new running session for a task and logs the clock_in event. */
    async clockIn(taskId: string): Promise<TaskSession> {
      const session: TaskSession = {
        id: newId(),
        task_id: taskId,
        clocked_in_at: nowIso(),
        clocked_out_at: null,
        status: "running",
        is_estimated: false,
      };
      await executor.execute(
        `INSERT INTO task_sessions (id, task_id, clocked_in_at, clocked_out_at, status, is_estimated)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          session.id,
          session.task_id,
          session.clocked_in_at,
          session.clocked_out_at,
          session.status,
          fromBool(session.is_estimated),
        ],
      );
      await sessionEvents.log(session.id, "clock_in", session.clocked_in_at);
      return session;
    },

    async setStatus(
      id: string,
      status: TaskSessionStatus,
      eventType: "break_start" | "break_resume",
    ): Promise<void> {
      await executor.execute("UPDATE task_sessions SET status = ? WHERE id = ?", [
        status,
        id,
      ]);
      await sessionEvents.log(id, eventType);
    },

    /** Closes a session. `isEstimated` marks a close resolved via the check-in flow, not a live clock-out. */
    async clockOut(
      id: string,
      options: { isEstimated?: boolean; clockedOutAt?: string } = {},
    ): Promise<void> {
      const clockedOutAt = options.clockedOutAt ?? nowIso();
      await executor.execute(
        `UPDATE task_sessions SET status = 'stopped', clocked_out_at = ?, is_estimated = ? WHERE id = ?`,
        [clockedOutAt, fromBool(options.isEstimated ?? false), id],
      );
      await sessionEvents.log(
        id,
        options.isEstimated ? "reconstructed" : "clock_out",
        clockedOutAt,
      );
    },

    async getById(id: string): Promise<TaskSession | null> {
      const rows = await executor.select<TaskSessionRow>(
        "SELECT * FROM task_sessions WHERE id = ?",
        [id],
      );
      return rows[0] ? mapRow(rows[0]) : null;
    },

    async listByTask(taskId: string): Promise<TaskSession[]> {
      const rows = await executor.select<TaskSessionRow>(
        "SELECT * FROM task_sessions WHERE task_id = ? ORDER BY clocked_in_at, rowid",
        [taskId],
      );
      return rows.map(mapRow);
    },

    /** Sessions still `running` or `on_break` — the forgot-to-clock-out detector's input. */
    /**
     * Every closed session in a date range, for the calendar heatmap.
     * Only stopped sessions count — a still-running one has no duration
     * to attribute to a day yet.
     */
    async listClosedSince(sinceIso: string): Promise<TaskSession[]> {
      return executor.select<TaskSession>(
        "SELECT * FROM task_sessions WHERE status = 'stopped' AND clocked_out_at IS NOT NULL AND clocked_in_at >= ? ORDER BY clocked_in_at",
        [sinceIso],
      );
    },

    async listDangling(): Promise<TaskSession[]> {
      const rows = await executor.select<TaskSessionRow>(
        "SELECT * FROM task_sessions WHERE status IN ('running', 'on_break') ORDER BY clocked_in_at, rowid",
      );
      return rows.map(mapRow);
    },
  };
}

export type TaskSessionsRepository = ReturnType<
  typeof createTaskSessionsRepository
>;
