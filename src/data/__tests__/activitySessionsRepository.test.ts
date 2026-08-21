// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { applyMigrations } from "../schema";
import { createActivitySessionsRepository } from "../repositories/activitySessionsRepository";
import { createTasksRepository } from "../repositories/tasksRepository";
import type { SqlExecutor } from "../sqlExecutor";
import { createTestExecutor } from "./testExecutor";

let executor: SqlExecutor;

beforeEach(async () => {
  executor = createTestExecutor();
  await applyMigrations(executor);
});

describe("activitySessionsRepository", () => {
  it("attaches a candidate span to a task and marks it accepted", async () => {
    const sessions = createActivitySessionsRepository(executor);
    const tasks = createTasksRepository(executor);
    const task = await tasks.create({ title: "Write the report" });
    const span = await sessions.create({
      started_at: "2026-08-21T10:00:00.000Z",
      ended_at: "2026-08-21T10:20:00.000Z",
      app: "Code.exe",
      idle: false,
    });

    await sessions.attach(span.id, { taskId: task.id });
    const day = await sessions.listForDay("2026-08-21");
    expect(day[0].status).toBe("accepted");
    expect(day[0].task_id).toBe(task.id);
  });
});
