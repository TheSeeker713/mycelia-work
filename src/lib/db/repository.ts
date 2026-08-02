import type { SqlExecutor } from "./executor";
import type {
  Journal,
  JournalKind,
  Note,
  ResourceEvent,
  ResourceEventKind,
  SessionEvent,
  SessionEventType,
  SessionStatus,
  Task,
  TaskSession,
  Todo,
} from "./types";

const now = () => new Date().toISOString();

// --- row shapes (raw SQLite columns) -> domain types -----------------------

interface TaskRow {
  id: number;
  title: string;
  tag: string | null;
  billable: number;
  created_at: string;
  archived_at: string | null;
}

const mapTask = (row: TaskRow): Task => ({
  id: row.id,
  title: row.title,
  tag: row.tag,
  billable: Boolean(row.billable),
  createdAt: row.created_at,
  archivedAt: row.archived_at,
});

interface TaskSessionRow {
  id: number;
  task_id: number;
  clocked_in_at: string;
  clocked_out_at: string | null;
  status: SessionStatus;
  is_estimated: number;
}

const mapTaskSession = (row: TaskSessionRow): TaskSession => ({
  id: row.id,
  taskId: row.task_id,
  clockedInAt: row.clocked_in_at,
  clockedOutAt: row.clocked_out_at,
  status: row.status,
  isEstimated: Boolean(row.is_estimated),
});

interface SessionEventRow {
  id: number;
  task_session_id: number;
  type: SessionEventType;
  occurred_at: string;
}

const mapSessionEvent = (row: SessionEventRow): SessionEvent => ({
  id: row.id,
  taskSessionId: row.task_session_id,
  type: row.type,
  occurredAt: row.occurred_at,
});

interface NoteRow {
  id: number;
  task_session_id: number;
  body: string;
  created_at: string;
}

const mapNote = (row: NoteRow): Note => ({
  id: row.id,
  taskSessionId: row.task_session_id,
  body: row.body,
  createdAt: row.created_at,
});

interface TodoRow {
  id: number;
  text: string;
  done: number;
  alert_at: string | null;
  snooze_count: number;
  created_at: string;
  completed_at: string | null;
}

const mapTodo = (row: TodoRow): Todo => ({
  id: row.id,
  text: row.text,
  done: Boolean(row.done),
  alertAt: row.alert_at,
  snoozeCount: row.snooze_count,
  createdAt: row.created_at,
  completedAt: row.completed_at,
});

interface JournalRow {
  id: number;
  task_id: number | null;
  task_session_id: number | null;
  generated_at: string;
  model_used: string | null;
  status: "pending" | "ok" | "failed";
  content: string | null;
  exported_path: string | null;
  kind: JournalKind;
}

const mapJournal = (row: JournalRow): Journal => ({
  id: row.id,
  taskId: row.task_id,
  taskSessionId: row.task_session_id,
  generatedAt: row.generated_at,
  modelUsed: row.model_used,
  status: row.status,
  content: row.content,
  exportedPath: row.exported_path,
  kind: row.kind,
});

interface ResourceEventRow {
  id: number;
  occurred_at: string;
  kind: ResourceEventKind;
  detail: string | null;
}

const mapResourceEvent = (row: ResourceEventRow): ResourceEvent => ({
  id: row.id,
  occurredAt: row.occurred_at,
  kind: row.kind,
  detail: row.detail,
});

// --- errors -----------------------------------------------------------------

export class RepositoryError extends Error {}

// --- tasks -------------------------------------------------------------------

export async function createTask(
  db: SqlExecutor,
  input: { title: string; tag?: string | null; billable?: boolean },
): Promise<Task> {
  const createdAt = now();
  const result = await db.execute(
    "INSERT INTO tasks (title, tag, billable, created_at) VALUES (?, ?, ?, ?)",
    [input.title, input.tag ?? null, input.billable ? 1 : 0, createdAt],
  );
  const id = result.lastInsertId as number;
  return {
    id,
    title: input.title,
    tag: input.tag ?? null,
    billable: Boolean(input.billable),
    createdAt,
    archivedAt: null,
  };
}

export async function listTasks(
  db: SqlExecutor,
  opts: { includeArchived?: boolean } = {},
): Promise<Task[]> {
  const rows = await db.select<TaskRow>(
    opts.includeArchived
      ? "SELECT * FROM tasks ORDER BY created_at DESC, id DESC"
      : "SELECT * FROM tasks WHERE archived_at IS NULL ORDER BY created_at DESC, id DESC",
  );
  return rows.map(mapTask);
}

export async function archiveTask(db: SqlExecutor, id: number): Promise<void> {
  await db.execute("UPDATE tasks SET archived_at = ? WHERE id = ?", [
    now(),
    id,
  ]);
}

// --- task sessions (clock in / break / clock out) ----------------------------

async function insertSessionEvent(
  db: SqlExecutor,
  taskSessionId: number,
  type: SessionEventType,
  occurredAt: string,
): Promise<void> {
  await db.execute(
    "INSERT INTO session_events (task_session_id, type, occurred_at) VALUES (?, ?, ?)",
    [taskSessionId, type, occurredAt],
  );
}

export async function getSession(
  db: SqlExecutor,
  id: number,
): Promise<TaskSession | undefined> {
  const rows = await db.select<TaskSessionRow>(
    "SELECT * FROM task_sessions WHERE id = ?",
    [id],
  );
  return rows[0] ? mapTaskSession(rows[0]) : undefined;
}

export async function listActiveSessionsForTask(
  db: SqlExecutor,
  taskId: number,
): Promise<TaskSession[]> {
  const rows = await db.select<TaskSessionRow>(
    "SELECT * FROM task_sessions WHERE task_id = ? AND status != 'stopped'",
    [taskId],
  );
  return rows.map(mapTaskSession);
}

export async function listRunningSessions(
  db: SqlExecutor,
): Promise<TaskSession[]> {
  const rows = await db.select<TaskSessionRow>(
    "SELECT * FROM task_sessions WHERE status != 'stopped' ORDER BY clocked_in_at ASC, id ASC",
  );
  return rows.map(mapTaskSession);
}

export async function clockIn(
  db: SqlExecutor,
  taskId: number,
  occurredAt: string = now(),
): Promise<TaskSession> {
  const active = await listActiveSessionsForTask(db, taskId);
  if (active.length > 0) {
    throw new RepositoryError(
      `Task ${taskId} already has an active session (#${active[0].id})`,
    );
  }
  const result = await db.execute(
    "INSERT INTO task_sessions (task_id, clocked_in_at, status, is_estimated) VALUES (?, ?, 'running', 0)",
    [taskId, occurredAt],
  );
  const id = result.lastInsertId as number;
  await insertSessionEvent(db, id, "clock_in", occurredAt);
  return {
    id,
    taskId,
    clockedInAt: occurredAt,
    clockedOutAt: null,
    status: "running",
    isEstimated: false,
  };
}

export async function pauseSession(
  db: SqlExecutor,
  sessionId: number,
  occurredAt: string = now(),
): Promise<void> {
  const session = await getSession(db, sessionId);
  if (!session) {
    throw new RepositoryError(`Session ${sessionId} does not exist`);
  }
  if (session.status !== "running") {
    throw new RepositoryError(
      `Cannot pause session ${sessionId}: status is ${session.status}, not running`,
    );
  }
  await db.execute("UPDATE task_sessions SET status = 'on_break' WHERE id = ?", [
    sessionId,
  ]);
  await insertSessionEvent(db, sessionId, "break_start", occurredAt);
}

export async function resumeSession(
  db: SqlExecutor,
  sessionId: number,
  occurredAt: string = now(),
): Promise<void> {
  const session = await getSession(db, sessionId);
  if (!session) {
    throw new RepositoryError(`Session ${sessionId} does not exist`);
  }
  if (session.status !== "on_break") {
    throw new RepositoryError(
      `Cannot resume session ${sessionId}: status is ${session.status}, not on_break`,
    );
  }
  await db.execute("UPDATE task_sessions SET status = 'running' WHERE id = ?", [
    sessionId,
  ]);
  await insertSessionEvent(db, sessionId, "break_resume", occurredAt);
}

export async function clockOut(
  db: SqlExecutor,
  sessionId: number,
  opts: { occurredAt?: string; isEstimated?: boolean } = {},
): Promise<void> {
  const session = await getSession(db, sessionId);
  if (!session) {
    throw new RepositoryError(`Session ${sessionId} does not exist`);
  }
  if (session.status === "stopped") {
    throw new RepositoryError(`Session ${sessionId} is already stopped`);
  }
  const occurredAt = opts.occurredAt ?? now();
  const isEstimated = opts.isEstimated ?? false;
  await db.execute(
    "UPDATE task_sessions SET status = 'stopped', clocked_out_at = ?, is_estimated = ? WHERE id = ?",
    [occurredAt, isEstimated ? 1 : 0, sessionId],
  );
  await insertSessionEvent(
    db,
    sessionId,
    isEstimated ? "reconstructed" : "clock_out",
    occurredAt,
  );
}

export async function listSessionEvents(
  db: SqlExecutor,
  sessionId: number,
): Promise<SessionEvent[]> {
  const rows = await db.select<SessionEventRow>(
    "SELECT * FROM session_events WHERE task_session_id = ? ORDER BY occurred_at ASC, id ASC",
    [sessionId],
  );
  return rows.map(mapSessionEvent);
}

// --- notes --------------------------------------------------------------------

export async function addNote(
  db: SqlExecutor,
  sessionId: number,
  body: string,
): Promise<Note> {
  const createdAt = now();
  const result = await db.execute(
    "INSERT INTO notes (task_session_id, body, created_at) VALUES (?, ?, ?)",
    [sessionId, body, createdAt],
  );
  return {
    id: result.lastInsertId as number,
    taskSessionId: sessionId,
    body,
    createdAt,
  };
}

export async function listNotesForSession(
  db: SqlExecutor,
  sessionId: number,
): Promise<Note[]> {
  const rows = await db.select<NoteRow>(
    "SELECT * FROM notes WHERE task_session_id = ? ORDER BY created_at ASC, id ASC",
    [sessionId],
  );
  return rows.map(mapNote);
}

// --- todos ----------------------------------------------------------------------

export async function createTodo(
  db: SqlExecutor,
  input: { text: string; alertAt?: string | null },
): Promise<Todo> {
  const createdAt = now();
  const result = await db.execute(
    "INSERT INTO todos (text, done, alert_at, snooze_count, created_at) VALUES (?, 0, ?, 0, ?)",
    [input.text, input.alertAt ?? null, createdAt],
  );
  return {
    id: result.lastInsertId as number,
    text: input.text,
    done: false,
    alertAt: input.alertAt ?? null,
    snoozeCount: 0,
    createdAt,
    completedAt: null,
  };
}

export async function listTodos(
  db: SqlExecutor,
  opts: { includeDone?: boolean } = {},
): Promise<Todo[]> {
  const rows = await db.select<TodoRow>(
    opts.includeDone
      ? "SELECT * FROM todos ORDER BY created_at DESC, id DESC"
      : "SELECT * FROM todos WHERE done = 0 ORDER BY created_at DESC, id DESC",
  );
  return rows.map(mapTodo);
}

export async function completeTodo(db: SqlExecutor, id: number): Promise<void> {
  await db.execute(
    "UPDATE todos SET done = 1, completed_at = ? WHERE id = ?",
    [now(), id],
  );
}

export async function snoozeTodo(
  db: SqlExecutor,
  id: number,
  newAlertAt: string,
): Promise<void> {
  await db.execute(
    "UPDATE todos SET alert_at = ?, snooze_count = snooze_count + 1 WHERE id = ?",
    [newAlertAt, id],
  );
}

export async function deleteTodo(db: SqlExecutor, id: number): Promise<void> {
  await db.execute("DELETE FROM todos WHERE id = ?", [id]);
}

// --- journals ---------------------------------------------------------------------

export async function createPendingJournal(
  db: SqlExecutor,
  input: {
    taskId?: number | null;
    taskSessionId?: number | null;
    kind: JournalKind;
  },
): Promise<Journal> {
  const generatedAt = now();
  const result = await db.execute(
    "INSERT INTO journals (task_id, task_session_id, generated_at, status, kind) VALUES (?, ?, ?, 'pending', ?)",
    [input.taskId ?? null, input.taskSessionId ?? null, generatedAt, input.kind],
  );
  return {
    id: result.lastInsertId as number,
    taskId: input.taskId ?? null,
    taskSessionId: input.taskSessionId ?? null,
    generatedAt,
    modelUsed: null,
    status: "pending",
    content: null,
    exportedPath: null,
    kind: input.kind,
  };
}

export async function markJournalOk(
  db: SqlExecutor,
  id: number,
  result: { content: string; modelUsed: string; exportedPath: string },
): Promise<void> {
  await db.execute(
    "UPDATE journals SET status = 'ok', content = ?, model_used = ?, exported_path = ? WHERE id = ?",
    [result.content, result.modelUsed, result.exportedPath, id],
  );
}

export async function markJournalFailed(
  db: SqlExecutor,
  id: number,
): Promise<void> {
  await db.execute("UPDATE journals SET status = 'failed' WHERE id = ?", [id]);
}

export async function getJournal(
  db: SqlExecutor,
  id: number,
): Promise<Journal | undefined> {
  const rows = await db.select<JournalRow>(
    "SELECT * FROM journals WHERE id = ?",
    [id],
  );
  return rows[0] ? mapJournal(rows[0]) : undefined;
}

// --- resource events -----------------------------------------------------------------

export async function logResourceEvent(
  db: SqlExecutor,
  kind: ResourceEventKind,
  detail?: string,
): Promise<void> {
  await db.execute(
    "INSERT INTO resource_events (occurred_at, kind, detail) VALUES (?, ?, ?)",
    [now(), kind, detail ?? null],
  );
}

export async function listResourceEvents(
  db: SqlExecutor,
): Promise<ResourceEvent[]> {
  const rows = await db.select<ResourceEventRow>(
    "SELECT * FROM resource_events ORDER BY occurred_at DESC, id DESC",
  );
  return rows.map(mapResourceEvent);
}
