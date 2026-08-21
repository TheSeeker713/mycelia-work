import type { SqlExecutor } from "../sqlExecutor";
import type { ActivityEvent } from "../types";
import { newId, nowIso } from "../sqliteUtil";

export function createActivityEventsRepository(executor: SqlExecutor) {
  return {
    async insert(input: {
      app: string;
      title?: string | null;
      url?: string | null;
      idle: boolean;
      sampledAt?: string;
    }): Promise<ActivityEvent> {
      const row: ActivityEvent = {
        id: newId(),
        sampled_at: input.sampledAt ?? nowIso(),
        app: input.app,
        title: input.title ?? null,
        url: input.url ?? null,
        idle: input.idle ? 1 : 0,
      };
      await executor.execute(
        `INSERT INTO activity_events (id, sampled_at, app, title, url, idle) VALUES (?, ?, ?, ?, ?, ?)`,
        [row.id, row.sampled_at, row.app, row.title, row.url, row.idle],
      );
      return row;
    },

    async listRecent(limit: number): Promise<ActivityEvent[]> {
      return executor.select<ActivityEvent>(
        "SELECT * FROM activity_events ORDER BY sampled_at DESC, rowid DESC LIMIT ?",
        [limit],
      );
    },

    async listBetween(fromIso: string, toIso: string): Promise<ActivityEvent[]> {
      return executor.select<ActivityEvent>(
        "SELECT * FROM activity_events WHERE sampled_at >= ? AND sampled_at <= ? ORDER BY sampled_at, rowid",
        [fromIso, toIso],
      );
    },
  };
}

export type ActivityEventsRepository = ReturnType<typeof createActivityEventsRepository>;
