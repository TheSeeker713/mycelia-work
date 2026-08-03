// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { applyMigrations } from "../schema";
import { createProjectsRepository } from "../repositories/projectsRepository";
import type { SqlExecutor } from "../sqlExecutor";
import { createTestExecutor } from "./testExecutor";

let executor: SqlExecutor;
let projects: ReturnType<typeof createProjectsRepository>;

beforeEach(async () => {
  executor = createTestExecutor();
  await applyMigrations(executor);
  projects = createProjectsRepository(executor);
});

describe("projectsRepository", () => {
  it("creates a project and reads it back", async () => {
    const created = await projects.create({
      title: "Redesign onboarding flow",
      targetMonth: "2026-09",
      priority: "high",
    });

    const found = await projects.getById(created.id);
    expect(found).not.toBeNull();
    expect(found?.title).toBe("Redesign onboarding flow");
    expect(found?.status).toBe("planned");
    expect(found?.priority).toBe("high");
    expect(found?.archived_at).toBeNull();
  });

  it("lists projects, excluding archived by default", async () => {
    const a = await projects.create({
      title: "A",
      targetMonth: "2026-09",
      priority: "high",
    });
    await projects.create({ title: "B", targetMonth: "2026-10", priority: "low" });
    await projects.archive(a.id);

    const active = await projects.list();
    expect(active.map((p) => p.title)).toEqual(["B"]);

    const all = await projects.list({ includeArchived: true });
    expect(all.length).toBe(2);
  });

  it("sorts same-month projects by urgency, not alphabetically", async () => {
    // alphabetical would give high, low, medium — wrong. Urgency order is
    // high, medium, low, which is what a Kanban timeline column expects.
    await projects.create({ title: "Low one", targetMonth: "2026-09", priority: "low" });
    await projects.create({
      title: "Medium one",
      targetMonth: "2026-09",
      priority: "medium",
    });
    await projects.create({
      title: "High one",
      targetMonth: "2026-09",
      priority: "high",
    });

    const all = await projects.list();
    expect(all.map((p) => p.title)).toEqual(["High one", "Medium one", "Low one"]);
  });

  it("updates fields selectively", async () => {
    const created = await projects.create({
      title: "Client portal revamp",
      targetMonth: "2026-09",
      priority: "low",
    });

    await projects.update(created.id, { status: "in_progress", priority: "high" });

    const updated = await projects.getById(created.id);
    expect(updated?.status).toBe("in_progress");
    expect(updated?.priority).toBe("high");
    expect(updated?.title).toBe("Client portal revamp");
  });
});
