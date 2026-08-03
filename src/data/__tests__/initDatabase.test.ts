// @vitest-environment node
import { describe, expect, it } from "vitest";
import { initDatabase } from "../index";
import { createTestExecutor } from "./testExecutor";

describe("initDatabase", () => {
  it("wires migrations and every repository together for a realistic flow", async () => {
    const repos = await initDatabase(createTestExecutor());

    const project = await repos.projects.create({
      title: "Redesign onboarding flow",
      targetMonth: "2026-09",
      priority: "high",
    });
    const task = await repos.tasks.create({
      title: "Sketch the welcome screen",
      projectId: project.id,
    });
    const session = await repos.taskSessions.clockIn(task.id);
    await repos.notes.create(session.id, "Started sketching the first-run screen.");
    await repos.taskSessions.clockOut(session.id);
    await repos.tasks.complete(task.id);

    const linkedTasks = await repos.tasks.listByProject(project.id);
    expect(linkedTasks[0].completed_at).not.toBeNull();

    const closedSession = await repos.taskSessions.getById(session.id);
    expect(closedSession?.status).toBe("stopped");

    const log = await repos.notes.listBySession(session.id);
    expect(log.length).toBe(1);
  });
});
