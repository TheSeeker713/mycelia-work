/**
 * Every SQL access in this app goes through this interface, never a
 * concrete driver directly. Production code gets an implementation
 * backed by `tauri-plugin-sql`; tests get one backed by Node's built-in
 * `node:sqlite`. Same interface, same repository code, two drivers.
 */
export interface SqlExecuteResult {
  lastInsertId?: number;
  rowsAffected: number;
}

export interface SqlExecutor {
  execute(sql: string, params?: unknown[]): Promise<SqlExecuteResult>;
  select<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
}
