// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { applyMigrations } from "../schema";
import { createProjectsRepository } from "../repositories/projectsRepository";
import { createTasksRepository } from "../repositories/tasksRepository";
import type { SqlExecutor } from "../sqlExecutor";
import { createTestExecutor } from "./testExecutor";

let executor: SqlExecutor;
let tasks: ReturnType<typeof createTasksRepository>;
let projects: ReturnType<typeof createProjectsRepository>;

beforeEach(async () => {
  executor = createTestExecutor();
  await applyMigrations(executor);
  tasks = createTasksRepository(executor);
  projects = createProjectsRepository(executor);
});

describe("tasksRepository", () => {
  it("creates a standalone task with no project link", async () => {
    const task = await tasks.create({ title: "Write the devlog entry" });
    expect(task.project_id).toBeNull();
    expect(task.billable).toBe(false);
    expect(task.completed_at).toBeNull();
  });

  it("links a task to a project and lists it back", async () => {
    const project = await projects.create({
      title: "Redesign onboarding flow",
      targetMonth: "2026-09",
      priority: "high",
    });
    await tasks.create({ title: "Sketch the welcome screen", projectId: project.id });
    await tasks.create({ title: "Unrelated task" });

    const linked = await tasks.listByProject(project.id);
    expect(linked.length).toBe(1);
    expect(linked[0].title).toBe("Sketch the welcome screen");
  });

  it("marks a task complete via completed_at, not a separate flag", async () => {
    const task = await tasks.create({ title: "Wire up the sample task" });
    await tasks.complete(task.id);

    const found = await tasks.getById(task.id);
    expect(found?.completed_at).not.toBeNull();
  });

  it("archives a task out of the default list", async () => {
    const task = await tasks.create({ title: "Old task" });
    await tasks.archive(task.id);

    const active = await tasks.list();
    expect(active.find((t) => t.id === task.id)).toBeUndefined();

    const all = await tasks.list({ includeArchived: true });
    expect(all.find((t) => t.id === task.id)).toBeDefined();
  });

  it("listArchived returns only archived tasks, newest archived first", async () => {
    const active = await tasks.create({ title: "Still active" });
    const archivedOne = await tasks.create({ title: "Archived first" });
    await tasks.archive(archivedOne.id);
    const archivedTwo = await tasks.create({ title: "Archived second" });
    await tasks.archive(archivedTwo.id);

    const archived = await tasks.listArchived();
    expect(archived.map((t) => t.id)).not.toContain(active.id);
    expect(archived.map((t) => t.title)).toEqual([
      "Archived second",
      "Archived first",
    ]);
  });

  it("archiving is reversible via unarchive — a soft delete, not a real one", async () => {
    const task = await tasks.create({ title: "Old task" });
    await tasks.archive(task.id);
    await tasks.unarchive(task.id);

    const found = await tasks.getById(task.id);
    expect(found?.archived_at).toBeNull();

    const active = await tasks.list();
    expect(active.find((t) => t.id === task.id)).toBeDefined();
  });
});
