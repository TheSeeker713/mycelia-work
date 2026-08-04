// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { applyMigrations } from "../schema";
import { createProjectsRepository } from "../repositories/projectsRepository";
import { createMilestonesRepository } from "../repositories/milestonesRepository";
import type { SqlExecutor } from "../sqlExecutor";
import { createTestExecutor } from "./testExecutor";

let executor: SqlExecutor;
let milestones: ReturnType<typeof createMilestonesRepository>;
let projectId: string;

beforeEach(async () => {
  executor = createTestExecutor();
  await applyMigrations(executor);
  const projects = createProjectsRepository(executor);
  milestones = createMilestonesRepository(executor);
  projectId = (
    await projects.create({ title: "Redesign onboarding flow", targetMonth: "2026-09", priority: "high" })
  ).id;
});

describe("milestonesRepository", () => {
  it("creates a milestone attached to a project, not completed", async () => {
    const milestone = await milestones.create(projectId, "First draft reviewed", "2026-09-15");
    expect(milestone.project_id).toBe(projectId);
    expect(milestone.name).toBe("First draft reviewed");
    expect(milestone.target_date).toBe("2026-09-15");
    expect(milestone.completed_at).toBeNull();
  });

  it("target_date defaults to null when not given", async () => {
    const milestone = await milestones.create(projectId, "Kickoff");
    expect(milestone.target_date).toBeNull();
  });

  it("lists milestones for a project, dated ones first and sorted, undated ones last", async () => {
    await milestones.create(projectId, "Undated one");
    await milestones.create(projectId, "Later date", "2026-10-01");
    await milestones.create(projectId, "Earlier date", "2026-09-01");

    const list = await milestones.listByProject(projectId);
    expect(list.map((m) => m.name)).toEqual(["Earlier date", "Later date", "Undated one"]);
  });

  it("complete sets completed_at", async () => {
    const milestone = await milestones.create(projectId, "Ship v1");
    await milestones.complete(milestone.id);

    const list = await milestones.listByProject(projectId);
    expect(list[0].completed_at).not.toBeNull();
  });

  it("delete removes just the one milestone", async () => {
    await milestones.create(projectId, "Keep this one");
    const toRemove = await milestones.create(projectId, "Remove this one");

    await milestones.delete(toRemove.id);

    const list = await milestones.listByProject(projectId);
    expect(list.map((m) => m.name)).toEqual(["Keep this one"]);
  });
});
