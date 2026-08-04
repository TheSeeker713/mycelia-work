// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { initDatabase, type Repositories, type Task } from "../../data";
import { createTestExecutor } from "../../data/__tests__/testExecutor";
import {
  computeElapsedSeconds,
  createSessionsStore,
  DANGLING_HOURS_THRESHOLD,
  isDangling,
  MAX_CONCURRENT_SESSIONS,
  type SessionsStore,
} from "../sessionsStore";

describe("computeElapsedSeconds", () => {
  it("counts plain wall-clock time with no break events", () => {
    const start = new Date("2026-08-04T09:00:00Z");
    const now = new Date("2026-08-04T09:10:00Z");
    expect(computeElapsedSeconds(start.toISOString(), [], now)).toBe(600);
  });

  it("subtracts a completed break segment", () => {
    const start = new Date("2026-08-04T09:00:00Z");
    const now = new Date("2026-08-04T09:20:00Z");
    const events = [
      { type: "break_start" as const, occurred_at: "2026-08-04T09:05:00Z" },
      { type: "break_resume" as const, occurred_at: "2026-08-04T09:10:00Z" },
    ];
    // 20 min total, minus a 5 min break = 15 min = 900s
    expect(computeElapsedSeconds(start.toISOString(), events, now)).toBe(900);
  });

  it("counts an in-progress break up to `now`, not past it", () => {
    const start = new Date("2026-08-04T09:00:00Z");
    const now = new Date("2026-08-04T09:15:00Z");
    const events = [{ type: "break_start" as const, occurred_at: "2026-08-04T09:10:00Z" }];
    // 15 min elapsed, currently 5 min into an unfinished break = 10 min active = 600s
    expect(computeElapsedSeconds(start.toISOString(), events, now)).toBe(600);
  });

  it("handles multiple break/resume cycles", () => {
    const start = new Date("2026-08-04T09:00:00Z");
    const now = new Date("2026-08-04T10:00:00Z");
    const events = [
      { type: "break_start" as const, occurred_at: "2026-08-04T09:10:00Z" },
      { type: "break_resume" as const, occurred_at: "2026-08-04T09:15:00Z" },
      { type: "break_start" as const, occurred_at: "2026-08-04T09:30:00Z" },
      { type: "break_resume" as const, occurred_at: "2026-08-04T09:40:00Z" },
    ];
    // 60 min total, minus two breaks (5 + 10 = 15 min) = 45 min = 2700s
    expect(computeElapsedSeconds(start.toISOString(), events, now)).toBe(2700);
  });
});

let repos: Repositories;
let useSessionsStore: SessionsStore;
let tasks: Task[];

beforeEach(async () => {
  repos = await initDatabase(createTestExecutor());
  useSessionsStore = createSessionsStore(repos);
  tasks = [];
  for (const title of ["Task A", "Task B", "Task C", "Task D"]) {
    tasks.push(await repos.tasks.create({ title }));
  }
});

describe("sessionsStore", () => {
  it("clockIn starts a session and adds it to activeSessions", async () => {
    const result = await useSessionsStore.getState().clockIn(tasks[0]);
    expect(result).toEqual({ ok: true });

    const active = useSessionsStore.getState().activeSessions;
    expect(active.length).toBe(1);
    expect(active[0].task.id).toBe(tasks[0].id);
    expect(active[0].session.status).toBe("running");
  });

  it("refuses to clock in the same task twice", async () => {
    await useSessionsStore.getState().clockIn(tasks[0]);
    const result = await useSessionsStore.getState().clockIn(tasks[0]);
    expect(result).toEqual({ ok: false, reason: "already_running" });
    expect(useSessionsStore.getState().activeSessions.length).toBe(1);
  });

  it(`enforces the ${MAX_CONCURRENT_SESSIONS}-task concurrent limit`, async () => {
    await useSessionsStore.getState().clockIn(tasks[0]);
    await useSessionsStore.getState().clockIn(tasks[1]);
    await useSessionsStore.getState().clockIn(tasks[2]);

    const result = await useSessionsStore.getState().clockIn(tasks[3]);
    expect(result).toEqual({ ok: false, reason: "limit_reached" });
    expect(useSessionsStore.getState().activeSessions.length).toBe(MAX_CONCURRENT_SESSIONS);
  });

  it("startBreak moves a session to on_break without removing it from active list", async () => {
    await useSessionsStore.getState().clockIn(tasks[0]);
    const sessionId = useSessionsStore.getState().activeSessions[0].session.id;

    await useSessionsStore.getState().startBreak(sessionId);

    const active = useSessionsStore.getState().activeSessions;
    expect(active.length).toBe(1);
    expect(active[0].session.status).toBe("on_break");
  });

  it("resumeFromBreak moves a session back to running", async () => {
    await useSessionsStore.getState().clockIn(tasks[0]);
    const sessionId = useSessionsStore.getState().activeSessions[0].session.id;
    await useSessionsStore.getState().startBreak(sessionId);

    await useSessionsStore.getState().resumeFromBreak(sessionId);

    expect(useSessionsStore.getState().activeSessions[0].session.status).toBe("running");
  });

  it("clockOut removes the session from the active list, freeing a concurrency slot", async () => {
    await useSessionsStore.getState().clockIn(tasks[0]);
    await useSessionsStore.getState().clockIn(tasks[1]);
    await useSessionsStore.getState().clockIn(tasks[2]);
    const sessionId = useSessionsStore.getState().activeSessions[0].session.id;

    await useSessionsStore.getState().clockOut(sessionId);
    expect(useSessionsStore.getState().activeSessions.length).toBe(2);

    const result = await useSessionsStore.getState().clockIn(tasks[3]);
    expect(result).toEqual({ ok: true });
    expect(useSessionsStore.getState().activeSessions.length).toBe(3);
  });

  it("loadActiveSessions restores running/on_break sessions with their tasks", async () => {
    await useSessionsStore.getState().clockIn(tasks[0]);
    const sessionId = useSessionsStore.getState().activeSessions[0].session.id;
    await useSessionsStore.getState().startBreak(sessionId);

    const fresh = createSessionsStore(repos);
    await fresh.getState().loadActiveSessions();

    expect(fresh.getState().activeSessions.length).toBe(1);
    expect(fresh.getState().activeSessions[0].task.title).toBe("Task A");
    expect(fresh.getState().activeSessions[0].session.status).toBe("on_break");
  });

  it("resolveDanglingSession closes the session as estimated at the given time", async () => {
    await useSessionsStore.getState().clockIn(tasks[0]);
    const sessionId = useSessionsStore.getState().activeSessions[0].session.id;
    const resolvedAt = new Date().toISOString();

    await useSessionsStore.getState().resolveDanglingSession(sessionId, resolvedAt);

    expect(useSessionsStore.getState().activeSessions).toEqual([]);
    const found = await repos.taskSessions.getById(sessionId);
    expect(found?.status).toBe("stopped");
    expect(found?.is_estimated).toBe(true);
    expect(found?.clocked_out_at).toBe(resolvedAt);
  });
});

describe("isDangling", () => {
  it("is not dangling just under the threshold", () => {
    const clockedInAt = new Date(
      Date.now() - (DANGLING_HOURS_THRESHOLD * 60 * 60 * 1000 - 60_000),
    ).toISOString();
    expect(isDangling(clockedInAt)).toBe(false);
  });

  it("is dangling at or past the threshold", () => {
    const clockedInAt = new Date(
      Date.now() - DANGLING_HOURS_THRESHOLD * 60 * 60 * 1000,
    ).toISOString();
    expect(isDangling(clockedInAt)).toBe(true);
  });
});
