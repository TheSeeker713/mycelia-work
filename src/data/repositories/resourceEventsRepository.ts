import type { SqlExecutor } from "../sqlExecutor";
import type { ResourceEvent, ResourceEventKind } from "../types";
import { newId, nowIso } from "../sqliteUtil";

export function createResourceEventsRepository(executor: SqlExecutor) {
  return {
    /** Every auto-resolve action (throttle, defer, kill) writes one of these — nothing throttles silently. */
    async log(kind: ResourceEventKind, detail?: string): Promise<ResourceEvent> {
      const event: ResourceEvent = {
        id: newId(),
        occurred_at: nowIso(),
        kind,
        detail: detail ?? null,
      };
      await executor.execute(
        `INSERT INTO resource_events (id, occurred_at, kind, detail) VALUES (?, ?, ?, ?)`,
        [event.id, event.occurred_at, event.kind, event.detail],
      );
      return event;
    },

    async list(): Promise<ResourceEvent[]> {
      // occurred_at alone doesn't break ties when two events land in the
      // same millisecond — rowid as a secondary key keeps insertion order.
      return executor.select<ResourceEvent>(
        "SELECT * FROM resource_events ORDER BY occurred_at DESC, rowid DESC",
      );
    },
  };
}

export type ResourceEventsRepository = ReturnType<
  typeof createResourceEventsRepository
>;
