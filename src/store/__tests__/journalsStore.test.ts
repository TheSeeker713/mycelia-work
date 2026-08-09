import { beforeEach, describe, expect, it, vi } from "vitest";
import { initDatabase, type Repositories, type SqlExecutor } from "../../data";
import { createTestExecutor } from "../../data/__tests__/testExecutor";
import type { OpenClawClient } from "../../services/openclawClient";
import { createJournalsStore, type JournalsStore } from "../journalsStore";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";

let executor: SqlExecutor;
let repos: Repositories;
let fakeClient: OpenClawClient;
let useJournals: JournalsStore;
let taskId: string;
let sessionId: string;

beforeEach(async () => {
  executor = createTestExecutor();
  repos = await initDatabase(executor);
  vi.mocked(invoke).mockReset();
  vi.mocked(invoke).mockResolvedValue("docs/workjournal/fake-path.md");

  fakeClient = {
    runOnce: vi.fn().mockResolvedValue({ text: "Generated entry.", model: "xai/grok-4.5" }),
    ensureDaemon: vi.fn().mockResolvedValue(true),
    call: vi.fn().mockResolvedValue({ text: "turn", model: "xai/grok-4.5" }),
    releaseDaemon: vi.fn().mockResolvedValue(undefined),
    cancelActiveCall: vi.fn(),
  };

  const task = await repos.tasks.create({ title: "Write the devlog entry" });
  taskId = task.id;
  const session = await repos.taskSessions.clockIn(taskId);
  sessionId = session.id;
  await repos.taskSessions.clockOut(sessionId);

  useJournals = createJournalsStore(repos, fakeClient);
});

describe("journalsStore", () => {
  it("generateSessionJournal creates a pending row, then resolves it to ok in state", async () => {
    const task = await repos.tasks.getById(taskId);
    if (!task) throw new Error("test setup: task missing");

    await useJournals.getState().generateSessionJournal(task, sessionId);
    const journals = useJournals.getState().journals;
    expect(journals.length).toBe(1);
    expect(journals[0].status).toBe("ok");
    expect(journals[0].content).toBe("Generated entry.");
  });

  it("does nothing if the session id doesn't resolve to a real session", async () => {
    const task = await repos.tasks.getById(taskId);
    if (!task) throw new Error("test setup: task missing");

    await useJournals.getState().generateSessionJournal(task, "does-not-exist");
    expect(useJournals.getState().journals.length).toBe(0);
  });

  it("loadRecent pulls journals from the repository into state", async () => {
    await repos.journals.createPending({ taskId, taskSessionId: sessionId, kind: "session" });
    await useJournals.getState().loadRecent();
    expect(useJournals.getState().journals.length).toBe(1);
  });

  it("loadRecent sweeps orphaned pending journals to failed before listing", async () => {
    const stuck = await repos.journals.createPending({ taskId, taskSessionId: sessionId, kind: "session" });
    const staleAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await executor.execute("UPDATE journals SET generated_at = ? WHERE id = ?", [staleAt, stuck.id]);

    await useJournals.getState().loadRecent();

    const found = useJournals.getState().journals.find((j) => j.id === stuck.id);
    expect(found?.status).toBe("failed");
    expect(found?.failure_reason).toContain("didn't finish");
  });

  it("generateWeeklyRollup only folds in ok session journals from the last 7 days", async () => {
    const task = await repos.tasks.getById(taskId);
    if (!task) throw new Error("test setup: task missing");

    // A recent, successful session journal — should count.
    await useJournals.getState().generateSessionJournal(task, sessionId);

    // A second session, its journal backdated 10 days — out of window.
    const oldSession = await repos.taskSessions.clockIn(taskId);
    await repos.taskSessions.clockOut(oldSession.id);
    const oldJournal = await repos.journals.createPending({
      taskId,
      taskSessionId: oldSession.id,
      kind: "session",
    });
    await repos.journals.markResult(oldJournal.id, "ok", { content: "Old entry, out of window." });

    // createPending always stamps "now" — direct SQL is the only way to
    // backdate it, same approach Dashboard.test.tsx uses for clocked_in_at.
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    await executor.execute("UPDATE journals SET generated_at = ? WHERE id = ?", [
      tenDaysAgo,
      oldJournal.id,
    ]);

    await useJournals.getState().loadRecent();
    await useJournals.getState().generateWeeklyRollup();

    expect(fakeClient.runOnce).toHaveBeenLastCalledWith(
      expect.objectContaining({
        message: expect.not.stringContaining("Old entry, out of window."),
      }),
    );
  });

  it("retryJournal re-fetches fresh events/notes and re-runs generation for a session journal", async () => {
    const failing: OpenClawClient = {
      ...fakeClient,
      // generateSessionJournal now retries once automatically on failure
      // (runOnceWithRetry) — two rejections are needed to genuinely land
      // on "failed" before the explicit manual retryJournal below.
      runOnce: vi
        .fn()
        .mockRejectedValueOnce(new Error("down"))
        .mockRejectedValueOnce(new Error("still down"))
        .mockResolvedValueOnce({
          text: "Recovered on retry.",
          model: "xai/grok-4.5",
        }),
    };
    const store = createJournalsStore(repos, failing);
    const task = await repos.tasks.getById(taskId);
    if (!task) throw new Error("test setup: task missing");

    await store.getState().generateSessionJournal(task, sessionId);
    expect(store.getState().journals[0].status).toBe("failed");

    const journalId = store.getState().journals[0].id;
    await store.getState().retryJournal(journalId);

    expect(store.getState().journals.find((j) => j.id === journalId)?.status).toBe("ok");
    expect(store.getState().journals.find((j) => j.id === journalId)?.content).toBe(
      "Recovered on retry.",
    );
  });

  it("retryJournal re-runs a weekly roll-up using its own kind's path", async () => {
    const pending = await repos.journals.createPending({ kind: "weekly" });
    const store = createJournalsStore(repos, fakeClient);
    await store.getState().loadRecent();

    await store.getState().retryJournal(pending.id);

    expect(store.getState().journals.find((j) => j.id === pending.id)?.status).toBe("ok");
  });

  it("discardPending deletes the pending journal for real — a delete, not a status change", async () => {
    const pending = await repos.journals.createPending({ taskId, taskSessionId: sessionId, kind: "session" });
    await useJournals.getState().loadRecent();
    expect(useJournals.getState().journals.map((j) => j.id)).toContain(pending.id);

    await useJournals.getState().discardPending();

    expect(useJournals.getState().journals.map((j) => j.id)).not.toContain(pending.id);
    expect(await repos.journals.getById(pending.id)).toBeNull();
  });

  it("discardPending is a no-op when nothing is pending", async () => {
    const task = await repos.tasks.getById(taskId);
    if (!task) throw new Error("test setup: task missing");
    await useJournals.getState().generateSessionJournal(task, sessionId);
    const before = useJournals.getState().journals;

    await useJournals.getState().discardPending();

    expect(useJournals.getState().journals).toEqual(before);
  });
});
