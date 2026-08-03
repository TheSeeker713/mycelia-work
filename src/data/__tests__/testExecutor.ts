import { DatabaseSync } from "node:sqlite";
import type { SqlExecutor } from "../sqlExecutor";

/**
 * Backs the SqlExecutor interface with Node's built-in SQLite for tests,
 * so repository logic runs against a real SQLite engine without needing
 * the Tauri runtime. Production uses `tauri-plugin-sql` instead — same
 * interface, different driver.
 */
export function createTestExecutor(): SqlExecutor {
  const db = new DatabaseSync(":memory:");
  return {
    async execute(sql, params = []) {
      const stmt = db.prepare(sql);
      const info = stmt.run(...(params as never[]));
      return {
        lastInsertId: Number(info.lastInsertRowid),
        rowsAffected: Number(info.changes),
      };
    },
    async select(sql, params = []) {
      const stmt = db.prepare(sql);
      return stmt.all(...(params as never[])) as never[];
    },
  };
}
