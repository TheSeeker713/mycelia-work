// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { applyMigrations } from "../schema";
import { createTasksRepository } from "../repositories/tasksRepository";
import { createJournalsRepository } from "../repositories/journalsRepository";
import type { SqlExecutor } from "../sqlExecutor";
import { createTestExecutor } from "./testExecutor";

let executor: SqlExecutor;
let journals: ReturnType<typeof createJournalsRepository>;
let taskId: string;

beforeEach(async () => {
  executor = createTestExecutor();
  await applyMigrations(executor);
  const tasks = createTasksRepository(executor);
  journals = createJournalsRepository(executor);
  taskId = (await tasks.create({ title: "Sample task" })).id;
});

describe("journalsRepository", () => {
  it("starts pending, with no content or model recorded yet", async () => {
    const journal = await journals.createPending({ taskId, kind: "session" });
    expect(journal.status).toBe("pending");
    expect(journal.content).toBeNull();
  });

  it("markResult records a successful generation", async () => {
    const journal = await journals.createPending({ taskId, kind: "session" });
    await journals.markResult(journal.id, "ok", {
      modelUsed: "xai/grok-4.5",
      content: "Worked on the onboarding flow today.",
      exportedPath: "docs/workjournal/2026-08-03_1200_onboarding.md",
    });

    const found = await journals.getById(journal.id);
    expect(found?.status).toBe("ok");
    expect(found?.content).toContain("onboarding flow");
    expect(found?.model_used).toBe("xai/grok-4.5");
  });

  it("markResult records a failure without discarding the pending row", async () => {
    const journal = await journals.createPending({ taskId, kind: "session" });
    await journals.markResult(journal.id, "failed");

    const found = await journals.getById(journal.id);
    expect(found?.status).toBe("failed");
    expect(found?.content).toBeNull();
  });

  it("listByTask returns every journal for that task", async () => {
    await journals.createPending({ taskId, kind: "session" });
    await journals.createPending({ taskId, kind: "session" });

    const all = await journals.listByTask(taskId);
    expect(all.length).toBe(2);
  });
});
