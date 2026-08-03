import Database from "@tauri-apps/plugin-sql";
import type { SqlExecutor } from "./sqlExecutor";

const DB_URL = "sqlite:mycelia-time.db";

let dbPromise: Promise<Database> | null = null;

function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load(DB_URL);
  }
  return dbPromise;
}

/** Production SqlExecutor, backed by tauri-plugin-sql. Same interface the node:sqlite test executor implements. */
export function createTauriSqlExecutor(): SqlExecutor {
  return {
    async execute(sql, params = []) {
      const db = await getDb();
      const result = await db.execute(sql, params);
      return { lastInsertId: result.lastInsertId, rowsAffected: result.rowsAffected };
    },
    async select<T>(sql: string, params: unknown[] = []) {
      const db = await getDb();
      return db.select<T[]>(sql, params);
    },
  };
}
