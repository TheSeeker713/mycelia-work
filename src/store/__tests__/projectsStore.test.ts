// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { initDatabase, type Repositories } from "../../data";
import { createTestExecutor } from "../../data/__tests__/testExecutor";
import { createProjectsStore, type ProjectsStore } from "../projectsStore";

let repos: Repositories;
let useProjectsStore: ProjectsStore;

beforeEach(async () => {
  repos = await initDatabase(createTestExecutor());
  useProjectsStore = createProjectsStore(repos);
});

describe("projectsStore", () => {
  it("loads projects from the repository", async () => {
    await repos.projects.create({
      title: "Redesign onboarding flow",
      targetMonth: "2026-09",
      priority: "high",
    });

    await useProjectsStore.getState().loadProjects();

    expect(useProjectsStore.getState().projects.map((p) => p.title)).toEqual([
      "Redesign onboarding flow",
    ]);
  });

  it("addProject creates the project and refreshes the list", async () => {
    await useProjectsStore.getState().addProject({
      title: "Client portal revamp",
      targetMonth: "2026-09",
      priority: "low",
    });

    expect(useProjectsStore.getState().projects.length).toBe(1);
    expect(useProjectsStore.getState().projects[0].status).toBe("planned");
  });
});
