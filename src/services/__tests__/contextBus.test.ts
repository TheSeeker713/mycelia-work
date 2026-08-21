// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { initDatabase, type Repositories } from "../../data";
import { createTestExecutor } from "../../data/__tests__/testExecutor";
import { formatContextForPrompt, loadWorkContext } from "../contextBus";
import { buildSessionJournalPrompt } from "../journalGeneration";

let repos: Repositories;

beforeEach(async () => {
  repos = await initDatabase(createTestExecutor());
});

describe("loadWorkContext", () => {
  it("includes an accepted activity summary and the open task when present", async () => {
    const task = await repos.tasks.create({ title: "Ship the timeline" });
    await repos.taskSessions.clockIn(task.id);
    const span = await repos.activitySessions.create({
      started_at: new Date().toISOString(),
      ended_at: new Date().toISOString(),
      app: "Code.exe",
      idle: false,
    });
    await repos.activitySessions.attach(span.id, { taskId: task.id });

    const ctx = await loadWorkContext(repos);
    expect(ctx.activeTaskTitle).toBe("Ship the timeline");
    expect(ctx.recentActivitySummary).toContain("Code.exe");
    expect(formatContextForPrompt(ctx)).toMatch(/Open task: Ship the timeline/);
    expect(formatContextForPrompt(ctx)).toMatch(/Recent activity:/);
  });
});

describe("buildSessionJournalPrompt context", () => {
  it("folds a context block into the journal prompt when one is passed", () => {
    const prompt = buildSessionJournalPrompt(
      {
        task: {
          id: "t",
          title: "Task",
          tag: null,
          project_id: null,
          billable: false,
          completed_at: null,
          created_at: "2026-08-21T00:00:00.000Z",
          archived_at: null,
        },
        session: {
          id: "s",
          task_id: "t",
          clocked_in_at: "2026-08-21T10:00:00.000Z",
          clocked_out_at: "2026-08-21T11:00:00.000Z",
          status: "stopped",
          is_estimated: false,
        },
        events: [],
        notes: [],
      },
      undefined,
      "Current context:\nRecent activity: Code.exe",
    );
    expect(prompt).toContain("Recent activity: Code.exe");
  });
});
