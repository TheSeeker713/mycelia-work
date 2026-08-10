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
  /** When the due-time reminder actually fired (notification + spoken cue) — null means not yet alerted. */
  alerted_at: string | null;
}

export type JournalStatus = "pending" | "ok" | "failed";
export type JournalKind = "session" | "weekly";

/** Which service answered, as opposed to `model_used` (which model). */
export type AiBackendId = "openclaw" | "ollama";

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
  /** NULL on rows written before this was recorded, and on manual entries. */
  backend_used: AiBackendId | null;
}

export type DiaryEntryStatus = "draft" | "committed";

/**
 * A row in the standalone free-write Journal (Phase 16.5) — deliberately
 * named apart from `Journal`/`JournalStatus` above, which back the
 * unrelated AI-generated Reports feature. `content_json` is TipTap's
 * own `editor.getJSON()` doc, serialized — paragraphs carry their own
 * `createdAt` attribute, so this one field is both the formatted
 * content and the per-paragraph timestamp record.
 */
export interface DiaryEntry {
  id: string;
  status: DiaryEntryStatus;
  content_json: string;
  started_at: string;
  updated_at: string;
  committed_at: string | null;
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
  /** NULL on rows written before this was recorded. */
  backend_used: AiBackendId | null;
}

/**
 * A kept record of an AI-assist run (sub-tasks, scheduling suggestion,
 * tighten description, or a freeform question) against a project.
 * These used to be shown once and discarded — Jeremy's own testing
 * found that surprising ("all the ai stuff... vanished as soon as i
 * exit the card"), so they're real persisted content now, same
 * treatment as project_reports.
 */
export interface ProjectAssistNote {
  id: string;
  project_id: string;
  action: string;
  question: string | null;
  content: string;
  created_at: string;
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

/** Every distinct way XP gets awarded — see docs/reference/gamification-guide.md for what each one means. */
export type XpSource =
  | "clock_in"
  | "hourly"
  | "daily_4hr"
  | "daily_8hr"
  | "note"
  | "project_created"
  | "project_finished"
  | "todo_completed"
  | "daily_use"
  | "streak_7"
  | "streak_30"
  | "streak_100"
  | "streak_365"
  | "welcome_back"
  | "first_time"
  | "four_hour_day_first"
  | "count_milestone";

export interface XpEvent {
  id: string;
  occurred_at: string;
  source: XpSource;
  amount: number;
  /** Set only on the (small subset of) events that also grant a sticker — project-finished, streak milestones, welcome-back. */
  sticker_key: string | null;
}

export type AchievementKind = "badge" | "sticker";

/** One-time-only unlock records — level badges and the two streak-milestone stickers, which can each only ever fire once (badges because level only moves forward, streak milestones because streak_days never resets). Repeatable stickers (project-finished, welcome-back) are NOT recorded here — they're just logged as xp_events with a sticker_key, since they can happen any number of times. */
export interface UnlockedAchievement {
  id: string;
  achievement_key: string;
  kind: AchievementKind;
  unlocked_at: string;
}

/**
 * Singleton row (id is always "main"). `streak_days` is a cumulative
 * count of distinct calendar days with real activity, not a
 * consecutive-day streak — it only ever goes up, matching the
 * no-punishment rule ("pause, don't reset") exactly, since a streak
 * that never resets on a gap behaves identically to a plain count of
 * active days. `daily_seconds`/`daily_hours_date`/`daily_*_awarded`
 * track today's cumulative clocked time toward the 4hr/8hr bonuses,
 * reset whenever the date rolls over.
 */
export interface GamificationStats {
  id: string;
  total_xp: number;
  level: number;
  streak_days: number;
  last_active_date: string | null;
  daily_hours_date: string | null;
  daily_seconds: number;
  daily_4hr_awarded: boolean;
  daily_8hr_awarded: boolean;
  updated_at: string;
}
