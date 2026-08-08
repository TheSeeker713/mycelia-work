// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initDatabase, type Repositories } from "../../data";
import { createTestExecutor } from "../../data/__tests__/testExecutor";
import { createProjectsStore, type ProjectsStore } from "../projectsStore";
import { createGamificationStore } from "../gamificationStore";
import type { OpenClawClient } from "../../services/openclawClient";

let repos: Repositories;
let openClawClient: OpenClawClient;
let useProjectsStore: ProjectsStore;
let gamification: ReturnType<typeof createGamificationStore>;

beforeEach(async () => {
  repos = await initDatabase(createTestExecutor());
  openClawClient = {
    runOnce: vi.fn().mockResolvedValue({ text: "Real progress this week.", model: "test" }),
    ensureDaemon: vi.fn(),
    call: vi.fn(),
    releaseDaemon: vi.fn(),
  };
  gamification = createGamificationStore(repos);
  useProjectsStore = createProjectsStore(repos, openClawClient, gamification);
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

  it("addProject awards gamification XP", async () => {
    await gamification.getState().load();
    await useProjectsStore.getState().addProject({
      title: "Client portal revamp",
      targetMonth: "2026-09",
      priority: "low",
    });

    expect(
      gamification.getState().recentXpEvents.some((e) => e.source === "project_created"),
    ).toBe(true);
  });

  it("updateProject to done awards finish XP and a sticker, but only on that transition", async () => {
    await gamification.getState().load();
    await useProjectsStore.getState().addProject({
      title: "Client portal revamp",
      targetMonth: "2026-09",
      priority: "low",
    });
    const id = useProjectsStore.getState().projects[0].id;

    // Not yet "done" — no finish reward.
    await useProjectsStore.getState().updateProject(id, { status: "in_progress" });
    expect(
      gamification.getState().recentXpEvents.some((e) => e.source === "project_finished"),
    ).toBe(false);

    await useProjectsStore.getState().updateProject(id, { status: "done" });
    expect(
      gamification.getState().pendingToasts.some((t) => t.key === "sticker_project_finished"),
    ).toBe(true);

    // Already done — patching something else shouldn't re-award it.
    gamification.getState().dismissToast(gamification.getState().pendingToasts[0].id);
    await useProjectsStore.getState().updateProject(id, { priority: "high" });
    expect(
      gamification.getState().recentXpEvents.filter((e) => e.source === "project_finished"),
    ).toHaveLength(1);
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

  it("generateReport creates a pending report immediately, then resolves it to ok", async () => {
    await useProjectsStore.getState().addProject({
      title: "Client portal revamp",
      targetMonth: "2026-09",
      priority: "low",
    });
    const project = useProjectsStore.getState().projects[0];

    // Block the model call so the intermediate "pending" state is
    // deterministically observable, rather than racing microtask timing.
    let resolveRunOnce: (v: { text: string; model: string }) => void = () => {};
    openClawClient.runOnce = vi.fn(
      () => new Promise<{ text: string; model: string }>((resolve) => { resolveRunOnce = resolve; }),
    );

    const promise = useProjectsStore.getState().generateReport(project);
    await vi.waitFor(() =>
      expect(useProjectsStore.getState().reportsByProject[project.id]?.[0]?.status).toBe("pending"),
    );

    resolveRunOnce({ text: "Real progress this week.", model: "test" });
    await promise;

    expect(useProjectsStore.getState().reportsByProject[project.id]?.[0]).toMatchObject({
      status: "ok",
      content: "Real progress this week.",
    });
  });

  it("loadReports reads existing reports for a project", async () => {
    await useProjectsStore.getState().addProject({
      title: "Client portal revamp",
      targetMonth: "2026-09",
      priority: "low",
    });
    const project = useProjectsStore.getState().projects[0];
    await repos.projectReports.createPending(project.id);

    await useProjectsStore.getState().loadReports(project.id);

    expect(useProjectsStore.getState().reportsByProject[project.id]).toHaveLength(1);
  });
});
