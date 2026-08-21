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

  it("createManual starts ok with empty content and no model, ready to write into", async () => {
    const journal = await journals.createManual({ taskId, kind: "session" });
    expect(journal.status).toBe("ok");
    expect(journal.content).toBe("");
    expect(journal.model_used).toBeNull();
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

  it("markPending puts a failed row back on pending without wiping the id", async () => {
    const journal = await journals.createPending({ taskId, kind: "session" });
    await journals.markResult(journal.id, "failed", { failureReason: "Gateway unreachable" });

    const pending = await journals.markPending(journal.id);
    expect(pending?.status).toBe("pending");
    expect(pending?.failure_reason).toBeNull();
    expect(pending?.id).toBe(journal.id);
  });

  it("markResult records a failure reason when given one", async () => {
    const journal = await journals.createPending({ taskId, kind: "session" });
    await journals.markResult(journal.id, "failed", { failureReason: "Gateway unreachable" });

    const found = await journals.getById(journal.id);
    expect(found?.failure_reason).toBe("Gateway unreachable");
  });

  it("markStalePendingAsFailed only touches pending rows older than the cutoff", async () => {
    const stale = await journals.createPending({ taskId, kind: "session" });
    const fresh = await journals.createPending({ taskId, kind: "session" });
    const alreadyOk = await journals.createPending({ taskId, kind: "session" });
    await journals.markResult(alreadyOk.id, "ok", { content: "done" });

    // createPending always stamps "now" — backdate the stale one directly,
    // same approach used elsewhere in this repo's tests for this exact need.
    await executor.execute("UPDATE journals SET generated_at = ? WHERE id = ?", [
      new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      stale.id,
    ]);

    const touched = await journals.markStalePendingAsFailed(
      new Date(Date.now() - 3 * 60 * 1000).toISOString(),
      "Generation didn't finish — the app was likely closed or reloaded mid-run.",
    );

    expect(touched).toBe(1);
    expect((await journals.getById(stale.id))?.status).toBe("failed");
    expect((await journals.getById(stale.id))?.failure_reason).toContain("didn't finish");
    expect((await journals.getById(fresh.id))?.status).toBe("pending");
    expect((await journals.getById(alreadyOk.id))?.status).toBe("ok");
  });

  it("listByTask returns every journal for that task", async () => {
    await journals.createPending({ taskId, kind: "session" });
    await journals.createPending({ taskId, kind: "session" });

    const all = await journals.listByTask(taskId);
    expect(all.length).toBe(2);
  });

  it("listRecent returns newest-first across every task, capped at the limit", async () => {
    await journals.createPending({ taskId, kind: "session" });
    await journals.createPending({ kind: "weekly" });
    const third = await journals.createPending({ taskId, kind: "session" });

    const recent = await journals.listRecent(2);
    expect(recent.length).toBe(2);
    expect(recent[0].id).toBe(third.id);
  });
});
