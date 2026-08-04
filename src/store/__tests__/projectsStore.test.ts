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

  it("updateProject patches fields and refreshes the list", async () => {
    await useProjectsStore.getState().addProject({
      title: "Client portal revamp",
      targetMonth: "2026-09",
      priority: "low",
    });
    const id = useProjectsStore.getState().projects[0].id;

    await useProjectsStore.getState().updateProject(id, { status: "in_progress" });

    expect(useProjectsStore.getState().projects[0].status).toBe("in_progress");
  });

  it("archiveProject removes it from the default list", async () => {
    await useProjectsStore.getState().addProject({
      title: "Client portal revamp",
      targetMonth: "2026-09",
      priority: "low",
    });
    const id = useProjectsStore.getState().projects[0].id;

    await useProjectsStore.getState().archiveProject(id);

    expect(useProjectsStore.getState().projects).toEqual([]);
  });

  it("deleteProject removes it permanently", async () => {
    await useProjectsStore.getState().addProject({
      title: "Client portal revamp",
      targetMonth: "2026-09",
      priority: "low",
    });
    const id = useProjectsStore.getState().projects[0].id;

    await useProjectsStore.getState().deleteProject(id);

    expect(useProjectsStore.getState().projects).toEqual([]);
    expect(await repos.projects.getById(id)).toBeNull();
  });

  it("loadMilestones and completeMilestone track a project's milestones", async () => {
    await useProjectsStore.getState().addProject({
      title: "Client portal revamp",
      targetMonth: "2026-09",
      priority: "low",
    });
    const projectId = useProjectsStore.getState().projects[0].id;
    const milestone = await repos.milestones.create(projectId, "Kickoff");

    await useProjectsStore.getState().loadMilestones(projectId);
    expect(useProjectsStore.getState().milestonesByProject[projectId]).toHaveLength(1);

    await useProjectsStore.getState().completeMilestone(projectId, milestone.id);
    expect(useProjectsStore.getState().milestonesByProject[projectId][0].completed_at).not.toBeNull();
  });

  it("deleteMilestone removes it and refreshes the list", async () => {
    await useProjectsStore.getState().addProject({
      title: "Client portal revamp",
      targetMonth: "2026-09",
      priority: "low",
    });
    const projectId = useProjectsStore.getState().projects[0].id;
    const milestone = await repos.milestones.create(projectId, "Kickoff");
    await useProjectsStore.getState().loadMilestones(projectId);

    await useProjectsStore.getState().deleteMilestone(projectId, milestone.id);

    expect(useProjectsStore.getState().milestonesByProject[projectId]).toEqual([]);
  });
});
