// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { applyMigrations } from "../schema";
import { createTasksRepository } from "../repositories/tasksRepository";
import { createTaskSessionsRepository } from "../repositories/taskSessionsRepository";
import { createSessionEventsRepository } from "../repositories/sessionEventsRepository";
import type { SqlExecutor } from "../sqlExecutor";
import { createTestExecutor } from "./testExecutor";

let executor: SqlExecutor;
let tasks: ReturnType<typeof createTasksRepository>;
let sessions: ReturnType<typeof createTaskSessionsRepository>;
let events: ReturnType<typeof createSessionEventsRepository>;
let taskId: string;

beforeEach(async () => {
  executor = createTestExecutor();
  await applyMigrations(executor);
  tasks = createTasksRepository(executor);
  sessions = createTaskSessionsRepository(executor);
  events = createSessionEventsRepository(executor);
  taskId = (await tasks.create({ title: "Sample task" })).id;
});

describe("taskSessionsRepository", () => {
  it("clockIn starts a running session and logs a clock_in event", async () => {
    const session = await sessions.clockIn(taskId);
    expect(session.status).toBe("running");
    expect(session.clocked_out_at).toBeNull();

    const log = await events.listBySession(session.id);
    expect(log.map((e) => e.type)).toEqual(["clock_in"]);
  });

  it("setStatus moves through break_start/break_resume and logs both", async () => {
    const session = await sessions.clockIn(taskId);
    await sessions.setStatus(session.id, "on_break", "break_start");
    await sessions.setStatus(session.id, "running", "break_resume");

    const found = await sessions.getById(session.id);
    expect(found?.status).toBe("running");

    const log = await events.listBySession(session.id);
    expect(log.map((e) => e.type)).toEqual([
      "clock_in",
      "break_start",
      "break_resume",
    ]);
  });

  it("clockOut closes a session normally (not estimated)", async () => {
    const session = await sessions.clockIn(taskId);
    await sessions.clockOut(session.id);

    const found = await sessions.getById(session.id);
    expect(found?.status).toBe("stopped");
    expect(found?.clocked_out_at).not.toBeNull();
    expect(found?.is_estimated).toBe(false);

    const log = await events.listBySession(session.id);
    expect(log.at(-1)?.type).toBe("clock_out");
  });

  it("clockOut with isEstimated marks the session reconstructed, not a live clock-out", async () => {
    const session = await sessions.clockIn(taskId);
    await sessions.clockOut(session.id, { isEstimated: true });

    const found = await sessions.getById(session.id);
    expect(found?.is_estimated).toBe(true);

    const log = await events.listBySession(session.id);
    expect(log.at(-1)?.type).toBe("reconstructed");
  });

  it("listDangling finds only running/on_break sessions, not stopped ones", async () => {
    const running = await sessions.clockIn(taskId);
    const onBreak = await sessions.clockIn(taskId);
    await sessions.setStatus(onBreak.id, "on_break", "break_start");
    const stopped = await sessions.clockIn(taskId);
    await sessions.clockOut(stopped.id);

    const dangling = await sessions.listDangling();
    const danglingIds = dangling.map((s) => s.id);
    expect(danglingIds).toContain(running.id);
    expect(danglingIds).toContain(onBreak.id);
    expect(danglingIds).not.toContain(stopped.id);
  });
});
