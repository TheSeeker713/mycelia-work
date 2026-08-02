import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ExecuteResult, SqlExecutor } from "../lib/db/executor";

const MIGRATION_PATH = resolve(
  process.cwd(),
  "src-tauri/migrations/0001_init.sql",
);

/**
 * Runs the exact same schema migration SQLite ships with, against an
 * in-memory database, via Node's built-in sqlite module. Repository code
 * under test is byte-for-byte the same code path the real Tauri app runs -
 * only the low-level executor differs.
 */
export function createTestDb(): { db: SqlExecutor; close: () => void } {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync(MIGRATION_PATH, "utf-8"));

  const executor: SqlExecutor = {
    async execute(query, params = []) {
      const stmt = sqlite.prepare(query);
      const info = stmt.run(...(params as never[]));
      const result: ExecuteResult = {
        rowsAffected: Number(info.changes),
      };
      if (info.lastInsertRowid !== undefined) {
        result.lastInsertId = Number(info.lastInsertRowid);
      }
      return result;
    },
    async select<T>(query: string, params: unknown[] = []) {
      const stmt = sqlite.prepare(query);
      return stmt.all(...(params as never[])) as T[];
    },
  };

  return { db: executor, close: () => sqlite.close() };
}
