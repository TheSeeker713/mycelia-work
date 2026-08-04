import { create } from "zustand";
import type { Repositories, SessionEvent, Task, TaskSession } from "../data";

/** Hard cap from the approved design: at most 3 simultaneous running tasks, to keep the UI and resource use simple. */
export const MAX_CONCURRENT_SESSIONS = 3;

export interface ActiveSession {
  session: TaskSession;
  task: Task;
  events: SessionEvent[];
}

export type ClockInResult =
  | { ok: true }
  | { ok: false; reason: "limit_reached" | "already_running" };

export interface SessionsState {
  activeSessions: ActiveSession[];
  loading: boolean;
  loadActiveSessions: () => Promise<void>;
  clockIn: (task: Task) => Promise<ClockInResult>;
  startBreak: (sessionId: string) => Promise<void>;
  resumeFromBreak: (sessionId: string) => Promise<void>;
  clockOut: (sessionId: string) => Promise<void>;
  /** The forgot-to-clock-out check-in's resolution — always is_estimated, never a live clock-out. */
  resolveDanglingSession: (sessionId: string, clockedOutAt: string) => Promise<void>;
}

export function createSessionsStore(repos: Repositories) {
  return create<SessionsState>((set, get) => ({
    activeSessions: [],
    loading: false,

    async loadActiveSessions() {
      set({ loading: true });
      const dangling = await repos.taskSessions.listDangling();
      const withTasks: ActiveSession[] = [];
      for (const session of dangling) {
        const task = await repos.tasks.getById(session.task_id);
        if (!task) continue;
        const events = await repos.sessionEvents.listBySession(session.id);
        withTasks.push({ session, task, events });
      }
      set({ activeSessions: withTasks, loading: false });
    },

    async clockIn(task) {
      const { activeSessions } = get();
      if (activeSessions.some((a) => a.task.id === task.id)) {
        return { ok: false, reason: "already_running" };
      }
      if (activeSessions.length >= MAX_CONCURRENT_SESSIONS) {
        return { ok: false, reason: "limit_reached" };
      }
      const session = await repos.taskSessions.clockIn(task.id);
      const events = await repos.sessionEvents.listBySession(session.id);
      set({ activeSessions: [...activeSessions, { session, task, events }] });
      return { ok: true };
    },

    async startBreak(sessionId) {
      await repos.taskSessions.setStatus(sessionId, "on_break", "break_start");
      const events = await repos.sessionEvents.listBySession(sessionId);
      set({
        activeSessions: get().activeSessions.map((a) =>
          a.session.id === sessionId
            ? { ...a, session: { ...a.session, status: "on_break" }, events }
            : a,
        ),
      });
    },

    async resumeFromBreak(sessionId) {
      await repos.taskSessions.setStatus(sessionId, "running", "break_resume");
      const events = await repos.sessionEvents.listBySession(sessionId);
      set({
        activeSessions: get().activeSessions.map((a) =>
          a.session.id === sessionId
            ? { ...a, session: { ...a.session, status: "running" }, events }
            : a,
        ),
      });
    },

    async clockOut(sessionId) {
      await repos.taskSessions.clockOut(sessionId);
      set({
        activeSessions: get().activeSessions.filter((a) => a.session.id !== sessionId),
      });
    },

    async resolveDanglingSession(sessionId, clockedOutAt) {
      await repos.taskSessions.clockOut(sessionId, { isEstimated: true, clockedOutAt });
      set({
        activeSessions: get().activeSessions.filter((a) => a.session.id !== sessionId),
      });
    },
  }));
}

export type SessionsStore = ReturnType<typeof createSessionsStore>;

/** CLAUDE.md: a session still running 8+ (especially 16+) hours later is a clear forgot-to-clock-out signal, not just a long day. */
export const DANGLING_HOURS_THRESHOLD = 8;

export function isDangling(clockedInAt: string, now: Date = new Date()): boolean {
  const hours = (now.getTime() - new Date(clockedInAt).getTime()) / (1000 * 60 * 60);
  return hours >= DANGLING_HOURS_THRESHOLD;
}

/**
 * Elapsed *active* seconds since clock-in — wall-clock time minus every
 * completed break segment, plus (if still on break right now) the
 * ongoing one. Computed from the durable event log rather than
 * in-memory-only state, so a reconstructed/reopened session still shows
 * the right number instead of resetting.
 */
export function computeElapsedSeconds(
  clockedInAt: string,
  events: Pick<SessionEvent, "type" | "occurred_at">[],
  now: Date = new Date(),
): number {
  const start = new Date(clockedInAt).getTime();
  const nowMs = now.getTime();
  let pausedMs = 0;
  let currentBreakStart: number | null = null;

  for (const event of events) {
    const t = new Date(event.occurred_at).getTime();
    if (event.type === "break_start") {
      currentBreakStart = t;
    } else if (event.type === "break_resume" && currentBreakStart !== null) {
      pausedMs += t - currentBreakStart;
      currentBreakStart = null;
    }
  }
  if (currentBreakStart !== null) {
    pausedMs += nowMs - currentBreakStart;
  }
  return Math.max(0, Math.floor((nowMs - start - pausedMs) / 1000));
}
