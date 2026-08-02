export interface ExecuteResult {
  rowsAffected: number;
  lastInsertId?: number;
}

/**
 * Query strings always use plain `?` placeholders (SQLite-native, and what
 * node:sqlite expects). The Tauri executor translates that to the `$1, $2, ...`
 * syntax sqlx requires internally - repository code never needs to know.
 */
export interface SqlExecutor {
  execute(query: string, params?: unknown[]): Promise<ExecuteResult>;
  select<T>(query: string, params?: unknown[]): Promise<T[]>;
}
