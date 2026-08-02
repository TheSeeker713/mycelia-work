import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../test/nodeSqliteExecutor";
import type { SqlExecutor } from "./executor";
import * as repo from "./repository";

let db: SqlExecutor;
let close: () => void;

beforeEach(() => {
  const testDb = createTestDb();
  db = testDb.db;
  close = testDb.close;
});

afterEach(() => {
  close();
});

describe("tasks", () => {
  it("creates and lists tasks", async () => {
    await repo.createTask(db, { title: "Write devlog" });
    await repo.createTask(db, { title: "Ship phase 1", tag: "build", billable: true });

    const tasks = await repo.listTasks(db);
    expect(tasks).toHaveLength(2);
    expect(tasks.map((t) => t.title)).toContain("Write devlog");
    const billableTask = tasks.find((t) => t.title === "Ship phase 1");
    expect(billableTask?.billable).toBe(true);
    expect(billableTask?.tag).toBe("build");
  });

  it("excludes archived tasks by default, includes them on request", async () => {
    const task = await repo.createTask(db, { title: "Old task" });
    await repo.archiveTask(db, task.id);

    expect(await repo.listTasks(db)).toHaveLength(0);
    expect(await repo.listTasks(db, { includeArchived: true })).toHaveLength(1);
  });
});

describe("task sessions: clock in / break / clock out", () => {
  it("clocking in creates a running session and a clock_in event", async () => {
    const task = await repo.createTask(db, { title: "Focus block" });
    const session = await repo.clockIn(db, task.id, "2026-08-02T09:00:00.000Z");

    expect(session.status).toBe("running");
    const events = await repo.listSessionEvents(db, session.id);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("clock_in");
  });

  it("refuses to clock into a task that already has an active session", async () => {
    const task = await repo.createTask(db, { title: "Focus block" });
    await repo.clockIn(db, task.id);

    await expect(repo.clockIn(db, task.id)).rejects.toThrow(repo.RepositoryError);
  });

  it("supports independent concurrent sessions across different tasks", async () => {
    const taskA = await repo.createTask(db, { title: "Task A" });
    const taskB = await repo.createTask(db, { title: "Task B" });

    const sessionA = await repo.clockIn(db, taskA.id);
    const sessionB = await repo.clockIn(db, taskB.id);

    const running = await repo.listRunningSessions(db);
    expect(running.map((s) => s.id).sort()).toEqual(
      [sessionA.id, sessionB.id].sort(),
    );
  });

  it("pauses a running session into on_break and logs break_start", async () => {
    const task = await repo.createTask(db, { title: "Focus block" });
    const session = await repo.clockIn(db, task.id, "2026-08-02T09:00:00.000Z");

    await repo.pauseSession(db, session.id, "2026-08-02T09:30:00.000Z");

    const updated = await repo.getSession(db, session.id);
    expect(updated?.status).toBe("on_break");
    const events = await repo.listSessionEvents(db, session.id);
    expect(events.map((e) => e.type)).toEqual(["clock_in", "break_start"]);
  });

  it("refuses to pause a session that is not running", async () => {
    const task = await repo.createTask(db, { title: "Focus block" });
    const session = await repo.clockIn(db, task.id);
    await repo.pauseSession(db, session.id);

    await expect(repo.pauseSession(db, session.id)).rejects.toThrow(
      repo.RepositoryError,
    );
  });

  it("resumes an on_break session back to running and logs break_resume", async () => {
    const task = await repo.createTask(db, { title: "Focus block" });
    const session = await repo.clockIn(db, task.id, "2026-08-02T09:00:00.000Z");
    await repo.pauseSession(db, session.id, "2026-08-02T09:30:00.000Z");

    await repo.resumeSession(db, session.id, "2026-08-02T09:45:00.000Z");

    const updated = await repo.getSession(db, session.id);
    expect(updated?.status).toBe("running");
    const events = await repo.listSessionEvents(db, session.id);
    expect(events.map((e) => e.type)).toEqual([
      "clock_in",
      "break_start",
      "break_resume",
    ]);
  });

  it("refuses to resume a session that is not on break", async () => {
    const task = await repo.createTask(db, { title: "Focus block" });
    const session = await repo.clockIn(db, task.id);

    await expect(repo.resumeSession(db, session.id)).rejects.toThrow(
      repo.RepositoryError,
    );
  });

  it("clocks out a running session and marks it stopped", async () => {
    const task = await repo.createTask(db, { title: "Focus block" });
    const session = await repo.clockIn(db, task.id, "2026-08-02T09:00:00.000Z");

    await repo.clockOut(db, session.id, { occurredAt: "2026-08-02T12:00:00.000Z" });

    const updated = await repo.getSession(db, session.id);
    expect(updated?.status).toBe("stopped");
    expect(updated?.clockedOutAt).toBe("2026-08-02T12:00:00.000Z");
    expect(updated?.isEstimated).toBe(false);
    const events = await repo.listSessionEvents(db, session.id);
    expect(events.at(-1)?.type).toBe("clock_out");
  });

  it("cannot clock out a session that isn't running", async () => {
    const task = await repo.createTask(db, { title: "Focus block" });
    const session = await repo.clockIn(db, task.id);
    await repo.clockOut(db, session.id);

    await expect(repo.clockOut(db, session.id)).rejects.toThrow(
      repo.RepositoryError,
    );
  });

  it("logs a reconstructed event and estimated flag when closed via the check-in flow", async () => {
    const task = await repo.createTask(db, { title: "Outside all day" });
    const session = await repo.clockIn(db, task.id, "2026-08-01T18:04:00.000Z");

    await repo.clockOut(db, session.id, {
      occurredAt: "2026-08-01T18:04:00.000Z",
      isEstimated: true,
    });

    const updated = await repo.getSession(db, session.id);
    expect(updated?.isEstimated).toBe(true);
    const events = await repo.listSessionEvents(db, session.id);
    expect(events.at(-1)?.type).toBe("reconstructed");
  });

  it("allows clocking into the task again once the prior session is stopped", async () => {
    const task = await repo.createTask(db, { title: "Focus block" });
    const first = await repo.clockIn(db, task.id);
    await repo.clockOut(db, first.id);

    const second = await repo.clockIn(db, task.id);
    expect(second.id).not.toBe(first.id);
  });
});

describe("notes", () => {
  it("appends notes to a session in order", async () => {
    const task = await repo.createTask(db, { title: "Focus block" });
    const session = await repo.clockIn(db, task.id);

    await repo.addNote(db, session.id, "Started with the schema design");
    await repo.addNote(db, session.id, "Now wiring up the repository tests");

    const notes = await repo.listNotesForSession(db, session.id);
    expect(notes.map((n) => n.body)).toEqual([
      "Started with the schema design",
      "Now wiring up the repository tests",
    ]);
  });
});

describe("todos", () => {
  it("creates, lists, completes, snoozes, and deletes todos", async () => {
    const todo = await repo.createTodo(db, {
      text: "Renew xai auth",
      alertAt: "2026-08-02T15:00:00.000Z",
    });

    expect(await repo.listTodos(db)).toHaveLength(1);

    await repo.snoozeTodo(db, todo.id, "2026-08-02T16:00:00.000Z");
    const [snoozed] = await repo.listTodos(db);
    expect(snoozed.snoozeCount).toBe(1);
    expect(snoozed.alertAt).toBe("2026-08-02T16:00:00.000Z");

    await repo.completeTodo(db, todo.id);
    expect(await repo.listTodos(db)).toHaveLength(0);
    expect(await repo.listTodos(db, { includeDone: true })).toHaveLength(1);

    await repo.deleteTodo(db, todo.id);
    expect(await repo.listTodos(db, { includeDone: true })).toHaveLength(0);
  });
});

describe("journals", () => {
  it("moves from pending to ok with generated content", async () => {
    const journal = await repo.createPendingJournal(db, { kind: "session" });
    expect(journal.status).toBe("pending");

    await repo.markJournalOk(db, journal.id, {
      content: "Today I worked on the data layer.",
      modelUsed: "xai/grok-4.5",
      exportedPath: "docs/workjournal/2026-08-02_1200_focus-block.md",
    });

    const updated = await repo.getJournal(db, journal.id);
    expect(updated?.status).toBe("ok");
    expect(updated?.content).toContain("data layer");
  });

  it("moves from pending to failed without losing the row", async () => {
    const journal = await repo.createPendingJournal(db, { kind: "session" });
    await repo.markJournalFailed(db, journal.id);

    const updated = await repo.getJournal(db, journal.id);
    expect(updated?.status).toBe("failed");
  });
});

describe("resource events", () => {
  it("logs and lists resource events newest first", async () => {
    await repo.logResourceEvent(db, "deferred_job", "weekly rollup deferred");
    await repo.logResourceEvent(db, "throttled", "CPU above high watermark");

    const events = await repo.listResourceEvents(db);
    expect(events).toHaveLength(2);
    expect(events[0].kind).toBe("throttled");
  });
});
