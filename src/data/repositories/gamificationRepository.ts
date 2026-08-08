import type { SqlExecutor } from "../sqlExecutor";
import type {
  AchievementKind,
  GamificationStats,
  UnlockedAchievement,
  XpEvent,
  XpSource,
} from "../types";
import { fromBool, newId, nowIso, toBool } from "../sqliteUtil";

const STATS_ID = "main";

interface GamificationStatsRow {
  id: string;
  total_xp: number;
  level: number;
  streak_days: number;
  last_active_date: string | null;
  daily_hours_date: string | null;
  daily_seconds: number;
  daily_4hr_awarded: number;
  daily_8hr_awarded: number;
  updated_at: string;
}

function mapStatsRow(row: GamificationStatsRow): GamificationStats {
  return {
    ...row,
    daily_4hr_awarded: toBool(row.daily_4hr_awarded),
    daily_8hr_awarded: toBool(row.daily_8hr_awarded),
  };
}

export function createGamificationRepository(executor: SqlExecutor) {
  return {
    /** Reads the singleton stats row, creating it with defaults on first call. */
    async getStats(): Promise<GamificationStats> {
      const rows = await executor.select<GamificationStatsRow>(
        "SELECT * FROM gamification_stats WHERE id = ?",
        [STATS_ID],
      );
      if (rows[0]) return mapStatsRow(rows[0]);

      const stats: GamificationStats = {
        id: STATS_ID,
        total_xp: 0,
        level: 1,
        streak_days: 0,
        last_active_date: null,
        daily_hours_date: null,
        daily_seconds: 0,
        daily_4hr_awarded: false,
        daily_8hr_awarded: false,
        updated_at: nowIso(),
      };
      await executor.execute(
        `INSERT INTO gamification_stats
         (id, total_xp, level, streak_days, last_active_date, daily_hours_date, daily_seconds, daily_4hr_awarded, daily_8hr_awarded, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          stats.id,
          stats.total_xp,
          stats.level,
          stats.streak_days,
          stats.last_active_date,
          stats.daily_hours_date,
          stats.daily_seconds,
          fromBool(stats.daily_4hr_awarded),
          fromBool(stats.daily_8hr_awarded),
          stats.updated_at,
        ],
      );
      return stats;
    },

    /** Partial update against the singleton row — callers pass only the fields that changed. Ensures the row exists first, so this is safe to call without a prior getStats(). */
    async updateStats(patch: Partial<Omit<GamificationStats, "id">>): Promise<void> {
      await executor.execute(
        `INSERT OR IGNORE INTO gamification_stats (id, total_xp, level, streak_days, daily_seconds, daily_4hr_awarded, daily_8hr_awarded, updated_at)
         VALUES (?, 0, 1, 0, 0, 0, 0, ?)`,
        [STATS_ID, nowIso()],
      );

      const fields: string[] = [];
      const values: unknown[] = [];
      for (const [key, value] of Object.entries(patch)) {
        fields.push(`${key} = ?`);
        values.push(typeof value === "boolean" ? fromBool(value) : value);
      }
      fields.push("updated_at = ?");
      values.push(nowIso());
      values.push(STATS_ID);

      await executor.execute(
        `UPDATE gamification_stats SET ${fields.join(", ")} WHERE id = ?`,
        values,
      );
    },

    async logXpEvent(source: XpSource, amount: number, stickerKey: string | null = null): Promise<XpEvent> {
      const event: XpEvent = {
        id: newId(),
        occurred_at: nowIso(),
        source,
        amount,
        sticker_key: stickerKey,
      };
      await executor.execute(
        `INSERT INTO xp_events (id, occurred_at, source, amount, sticker_key) VALUES (?, ?, ?, ?, ?)`,
        [event.id, event.occurred_at, event.source, event.amount, event.sticker_key],
      );
      return event;
    },

    async listXpEvents(): Promise<XpEvent[]> {
      return executor.select<XpEvent>(
        "SELECT * FROM xp_events ORDER BY occurred_at DESC, rowid DESC",
      );
    },

    async isAchievementUnlocked(achievementKey: string): Promise<boolean> {
      const rows = await executor.select<{ achievement_key: string }>(
        "SELECT achievement_key FROM unlocked_achievements WHERE achievement_key = ?",
        [achievementKey],
      );
      return rows.length > 0;
    },

    /**
     * Idempotent — a duplicate call for the same key is a no-op (relies
     * on the same "unique constraint failure is benign" pattern
     * `applyMigrations` already uses), so callers don't need to
     * pre-check `isAchievementUnlocked` themselves to stay safe.
     */
    async unlockAchievement(achievementKey: string, kind: AchievementKind): Promise<UnlockedAchievement> {
      const unlocked: UnlockedAchievement = {
        id: newId(),
        achievement_key: achievementKey,
        kind,
        unlocked_at: nowIso(),
      };
      try {
        await executor.execute(
          `INSERT INTO unlocked_achievements (id, achievement_key, kind, unlocked_at) VALUES (?, ?, ?, ?)`,
          [unlocked.id, unlocked.achievement_key, unlocked.kind, unlocked.unlocked_at],
        );
        return unlocked;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!/unique/i.test(message)) throw err;
        const rows = await executor.select<UnlockedAchievement>(
          "SELECT * FROM unlocked_achievements WHERE achievement_key = ?",
          [achievementKey],
        );
        return rows[0] ?? unlocked;
      }
    },

    async listUnlockedAchievements(): Promise<UnlockedAchievement[]> {
      return executor.select<UnlockedAchievement>(
        "SELECT * FROM unlocked_achievements ORDER BY unlocked_at, rowid",
      );
    },
  };
}

export type GamificationRepository = ReturnType<typeof createGamificationRepository>;
