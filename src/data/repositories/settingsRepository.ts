import type { SqlExecutor } from "../sqlExecutor";

/**
 * Generic key/value store for app-level toggles (self-voicing, STT,
 * theme, ...) — one table for all of them rather than a bespoke column
 * per setting, since every setting here is the same shape: a key and a
 * string value.
 */
export function createSettingsRepository(executor: SqlExecutor) {
  return {
    async get(key: string): Promise<string | null> {
      const rows = await executor.select<{ value: string }>(
        "SELECT value FROM app_settings WHERE key = ?",
        [key],
      );
      return rows[0]?.value ?? null;
    },

    async set(key: string, value: string): Promise<void> {
      await executor.execute(
        `INSERT INTO app_settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [key, value],
      );
    },

    async getAll(): Promise<Record<string, string>> {
      const rows = await executor.select<{ key: string; value: string }>(
        "SELECT key, value FROM app_settings",
      );
      return Object.fromEntries(rows.map((r) => [r.key, r.value]));
    },
  };
}

export type SettingsRepository = ReturnType<typeof createSettingsRepository>;
