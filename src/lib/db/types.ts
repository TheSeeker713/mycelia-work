export type SessionStatus = "running" | "on_break" | "stopped";

export type SessionEventType =
  | "clock_in"
  | "break_start"
  | "break_resume"
  | "clock_out"
  | "reconstructed";

export type JournalStatus = "pending" | "ok" | "failed";
export type JournalKind = "session" | "weekly";
export type ResourceEventKind =
  | "throttled"
  | "deferred_job"
  | "killed_subprocess";

export interface Task {
  id: number;
  title: string;
  tag: string | null;
  billable: boolean;
  createdAt: string;
  archivedAt: string | null;
}

export interface TaskSession {
  id: number;
  taskId: number;
  clockedInAt: string;
  clockedOutAt: string | null;
  status: SessionStatus;
  isEstimated: boolean;
}

export interface SessionEvent {
  id: number;
  taskSessionId: number;
  type: SessionEventType;
  occurredAt: string;
}

export interface Note {
  id: number;
  taskSessionId: number;
  body: string;
  createdAt: string;
}

export interface Todo {
  id: number;
  text: string;
  done: boolean;
  alertAt: string | null;
  snoozeCount: number;
  createdAt: string;
  completedAt: string | null;
}

export interface Journal {
  id: number;
  taskId: number | null;
  taskSessionId: number | null;
  generatedAt: string;
  modelUsed: string | null;
  status: JournalStatus;
  content: string | null;
  exportedPath: string | null;
  kind: JournalKind;
}

export interface ResourceEvent {
  id: number;
  occurredAt: string;
  kind: ResourceEventKind;
  detail: string | null;
}
