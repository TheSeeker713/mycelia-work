import { create } from "zustand";
import type { CreateProjectInput, UpdateProjectInput } from "../data/repositories/projectsRepository";
import type { Milestone, Project, ProjectAssistNote, ProjectReport, Repositories } from "../data";
import type { OpenClawClient } from "../services/openclawClient";
import type { OllamaClient } from "../services/ollamaClient";
import { runProjectReportGeneration } from "../services/projectAssist";
import type { GamificationStore } from "./gamificationStore";

export interface ProjectsState {
  projects: Project[];
  milestonesByProject: Record<string, Milestone[]>;
  reportsByProject: Record<string, ProjectReport[]>;
  assistNotesByProject: Record<string, ProjectAssistNote[]>;
  loading: boolean;
  loadProjects: () => Promise<void>;
  addProject: (input: CreateProjectInput) => Promise<void>;
  updateProject: (id: string, patch: UpdateProjectInput) => Promise<void>;
  archiveProject: (id: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  loadMilestones: (projectId: string) => Promise<void>;
  completeMilestone: (projectId: string, milestoneId: string) => Promise<void>;
  deleteMilestone: (projectId: string, milestoneId: string) => Promise<void>;
  loadReports: (projectId: string) => Promise<void>;
  generateReport: (project: Project) => Promise<void>;
  loadAssistNotes: (projectId: string) => Promise<void>;
  saveAssistNote: (projectId: string, action: string, content: string, question?: string | null) => Promise<void>;
  /** For the exit flow's "quit now" path — deletes whichever report is still `pending`, a real discard rather than leaving it to fail. No-op if nothing's pending. */
  discardPendingReport: () => Promise<void>;
}

export function createProjectsStore(
  repos: Repositories,
  client: OpenClawClient,
  gamification: GamificationStore,
  ollama: OllamaClient,
) {
  return create<ProjectsState>((set, get) => ({
    projects: [],
    milestonesByProject: {},
    reportsByProject: {},
    assistNotesByProject: {},
    loading: false,

    async loadProjects() {
      set({ loading: true });
      const projects = await repos.projects.list();
      set({ projects, loading: false });
    },

    async addProject(input) {
      await repos.projects.create(input);
      await get().loadProjects();
      await gamification.getState().recordProjectCreated();
    },

    async updateProject(id, patch) {
      const before = await repos.projects.getById(id);
      await repos.projects.update(id, patch);
      await get().loadProjects();
      if (patch.status === "done" && before && before.status !== "done") {
        await gamification.getState().recordProjectFinished();
      }
    },

    async archiveProject(id) {
      await repos.projects.archive(id);
      await get().loadProjects();
    },

    async deleteProject(id) {
      await repos.projects.delete(id);
      await get().loadProjects();
    },

    async loadMilestones(projectId) {
      const milestones = await repos.milestones.listByProject(projectId);
      set({ milestonesByProject: { ...get().milestonesByProject, [projectId]: milestones } });
    },

    async completeMilestone(projectId, milestoneId) {
      await repos.milestones.complete(milestoneId);
      await get().loadMilestones(projectId);
    },

    async deleteMilestone(projectId, milestoneId) {
      await repos.milestones.delete(milestoneId);
      await get().loadMilestones(projectId);
    },

    async loadReports(projectId) {
      const reports = await repos.projectReports.listByProject(projectId);
      set({ reportsByProject: { ...get().reportsByProject, [projectId]: reports } });
    },

    async generateReport(project) {
      const pending = await repos.projectReports.createPending(project.id);
      set({
        reportsByProject: {
          ...get().reportsByProject,
          [project.id]: [pending, ...(get().reportsByProject[project.id] ?? [])],
        },
      });
      await runProjectReportGeneration({ repos, client, ollama, reportId: pending.id, project });
      await get().loadReports(project.id);
    },

    async loadAssistNotes(projectId) {
      const notes = await repos.projectAssistNotes.listByProject(projectId);
      set({ assistNotesByProject: { ...get().assistNotesByProject, [projectId]: notes } });
    },

    async saveAssistNote(projectId, action, content, question = null) {
      await repos.projectAssistNotes.create(projectId, action, content, question);
      await get().loadAssistNotes(projectId);
    },

    async discardPendingReport() {
      const entry = Object.entries(get().reportsByProject)
        .flatMap(([projectId, reports]) => reports.map((r) => ({ projectId, report: r })))
        .find(({ report }) => report.status === "pending");
      if (!entry) return;
      await repos.projectReports.delete(entry.report.id);
      set({
        reportsByProject: {
          ...get().reportsByProject,
          [entry.projectId]: get().reportsByProject[entry.projectId].filter((r) => r.id !== entry.report.id),
        },
      });
    },
  }));
}

export type ProjectsStore = ReturnType<typeof createProjectsStore>;
