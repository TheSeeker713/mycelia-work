import Database from "@tauri-apps/plugin-sql";
import type { ExecuteResult, SqlExecutor } from "./executor";

const DB_URL = "sqlite:mycelia-time.db";

/** sqlx (used by tauri-plugin-sql) requires `$1, $2, ...` bind placeholders
 * for sqlite, not the native `?`. Repository code is written against plain
 * `?` throughout, so translate it here, once. */
export function toDollarPlaceholders(query: string): string {
  let index = 0;
  return query.replace(/\?/g, () => `$${++index}`);
}

let dbPromise: Promise<Database> | null = null;

function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load(DB_URL);
  }
  return dbPromise;
}

export const tauriExecutor: SqlExecutor = {
  async execute(query, params = []) {
    const db = await getDb();
    const result = await db.execute(toDollarPlaceholders(query), params);
    return result as ExecuteResult;
  },
  async select<T>(query: string, params: unknown[] = []) {
    const db = await getDb();
    return db.select<T[]>(toDollarPlaceholders(query), params);
  },
};
