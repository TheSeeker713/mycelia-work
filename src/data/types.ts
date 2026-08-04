export type ProjectStatus = "planned" | "in_progress" | "done";
export type ProjectPriority = "high" | "medium" | "low";

export interface Project {
  id: string;
  title: string;
  description: string | null;
  status: ProjectStatus;
  target_month: string;
  /** Precise completion-goal date+time (ISO 8601), set via the two-tab calendar/time picker — separate from target_month, which stays the coarser board-column grouping. */
  target_datetime: string | null;
  priority: ProjectPriority;
  created_at: string;
  archived_at: string | null;
}

export interface Task {
  id: string;
  title: string;
  tag: string | null;
  project_id: string | null;
  billable: boolean;
  completed_at: string | null;
  created_at: string;
  archived_at: string | null;
}

export type TaskSessionStatus = "running" | "on_break" | "stopped";

export interface TaskSession {
  id: string;
  task_id: string;
  clocked_in_at: string;
  clocked_out_at: string | null;
  status: TaskSessionStatus;
  is_estimated: boolean;
}

export type SessionEventType =
  | "clock_in"
  | "break_start"
  | "break_resume"
  | "clock_out"
  | "reconstructed";

export interface SessionEvent {
  id: string;
  task_session_id: string;
  type: SessionEventType;
  occurred_at: string;
}

export interface Note {
  id: string;
  task_session_id: string;
  body: string;
  created_at: string;
}

export interface Todo {
  id: string;
  text: string;
  done: boolean;
  alert_at: string | null;
  snooze_count: number;
  created_at: string;
  completed_at: string | null;
}

export type JournalStatus = "pending" | "ok" | "failed";
export type JournalKind = "session" | "weekly";

export interface Journal {
  id: string;
  task_id: string | null;
  task_session_id: string | null;
  generated_at: string;
  model_used: string | null;
  status: JournalStatus;
  content: string | null;
  exported_path: string | null;
  kind: JournalKind;
  failure_reason: string | null;
}

export type ProjectReportStatus = "pending" | "ok" | "failed";

export interface ProjectReport {
  id: string;
  project_id: string;
  generated_at: string;
  model_used: string | null;
  status: ProjectReportStatus;
  content: string | null;
  failure_reason: string | null;
}

export interface Milestone {
  id: string;
  project_id: string;
  name: string;
  target_date: string | null;
  created_at: string;
  completed_at: string | null;
}

export type ResourceEventKind =
  | "throttled"
  | "deferred_job"
  | "killed_subprocess";

export interface ResourceEvent {
  id: string;
  occurred_at: string;
  kind: ResourceEventKind;
  detail: string | null;
}
