import type { SqlExecutor } from "../sqlExecutor";
import type { SessionEvent, SessionEventType } from "../types";
import { newId, nowIso } from "../sqliteUtil";

export function createSessionEventsRepository(executor: SqlExecutor) {
  return {
    async log(
      taskSessionId: string,
      type: SessionEventType,
      occurredAt: string = nowIso(),
    ): Promise<SessionEvent> {
      const event: SessionEvent = {
        id: newId(),
        task_session_id: taskSessionId,
        type,
        occurred_at: occurredAt,
      };
      await executor.execute(
        `INSERT INTO session_events (id, task_session_id, type, occurred_at)
         VALUES (?, ?, ?, ?)`,
        [event.id, event.task_session_id, event.type, event.occurred_at],
      );
      return event;
    },

    async listBySession(taskSessionId: string): Promise<SessionEvent[]> {
      return executor.select<SessionEvent>(
        "SELECT * FROM session_events WHERE task_session_id = ? ORDER BY occurred_at, rowid",
        [taskSessionId],
      );
    },
  };
}

export type SessionEventsRepository = ReturnType<
  typeof createSessionEventsRepository
>;
