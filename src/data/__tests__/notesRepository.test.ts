// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { applyMigrations } from "../schema";
import { createTasksRepository } from "../repositories/tasksRepository";
import { createTaskSessionsRepository } from "../repositories/taskSessionsRepository";
import { createNotesRepository } from "../repositories/notesRepository";
import type { SqlExecutor } from "../sqlExecutor";
import { createTestExecutor } from "./testExecutor";

let executor: SqlExecutor;
let notes: ReturnType<typeof createNotesRepository>;
let sessionId: string;

beforeEach(async () => {
  executor = createTestExecutor();
  await applyMigrations(executor);
  const tasks = createTasksRepository(executor);
  const sessions = createTaskSessionsRepository(executor);
  notes = createNotesRepository(executor);
  const taskId = (await tasks.create({ title: "Sample task" })).id;
  sessionId = (await sessions.clockIn(taskId)).id;
});

describe("notesRepository", () => {
  it("appends notes into a session log, in order", async () => {
    await notes.create(sessionId, "First paragraph.");
    await notes.create(sessionId, "Second paragraph, a bit later.");

    const log = await notes.listBySession(sessionId);
    expect(log.map((n) => n.body)).toEqual([
      "First paragraph.",
      "Second paragraph, a bit later.",
    ]);
  });
});
