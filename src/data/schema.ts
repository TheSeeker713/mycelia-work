import type { SqlExecutor } from "./sqlExecutor";

/**
 * Each entry is one migration, applied in order, once. Append new
 * entries for schema changes — never edit a statement that has already
 * shipped, since `migrations` rows below track what's already run.
 */
export const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS migrations (
    id INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL CHECK (status IN ('planned', 'in_progress', 'done')),
    target_month TEXT NOT NULL,
    priority TEXT NOT NULL CHECK (priority IN ('high', 'medium', 'low')),
    created_at TEXT NOT NULL,
    archived_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    tag TEXT,
    project_id TEXT REFERENCES projects(id),
    billable INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    created_at TEXT NOT NULL,
    archived_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS task_sessions (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id),
    clocked_in_at TEXT NOT NULL,
    clocked_out_at TEXT,
    status TEXT NOT NULL CHECK (status IN ('running', 'on_break', 'stopped')),
    is_estimated INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS session_events (
    id TEXT PRIMARY KEY,
    task_session_id TEXT NOT NULL REFERENCES task_sessions(id),
    type TEXT NOT NULL CHECK (type IN ('clock_in', 'break_start', 'break_resume', 'clock_out', 'reconstructed')),
    occurred_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    task_session_id TEXT NOT NULL REFERENCES task_sessions(id),
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS todos (
    id TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    alert_at TEXT,
    snooze_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    completed_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS journals (
    id TEXT PRIMARY KEY,
    task_id TEXT REFERENCES tasks(id),
    task_session_id TEXT REFERENCES task_sessions(id),
    generated_at TEXT NOT NULL,
    model_used TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending', 'ok', 'failed')),
    content TEXT,
    exported_path TEXT,
    kind TEXT NOT NULL CHECK (kind IN ('session', 'weekly'))
  )`,
  `CREATE TABLE IF NOT EXISTS resource_events (
    id TEXT PRIMARY KEY,
    occurred_at TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('throttled', 'deferred_job', 'killed_subprocess')),
    detail TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
];

/**
 * Applies every migration that hasn't already run, tracked by row count
 * in `migrations`. Safe to call on every app start.
 */
export async function applyMigrations(executor: SqlExecutor): Promise<void> {
  await executor.execute(MIGRATIONS[0]);
  const applied = await executor.select<{ id: number }>(
    "SELECT id FROM migrations ORDER BY id",
  );
  const appliedIds = new Set(applied.map((row) => row.id));

  for (let i = 1; i < MIGRATIONS.length; i += 1) {
    if (appliedIds.has(i)) continue;
    await executor.execute(MIGRATIONS[i]);
    await executor.execute(
      "INSERT INTO migrations (id, applied_at) VALUES (?, ?)",
      [i, new Date().toISOString()],
    );
  }
}
