import { create } from "zustand";
import type { CreateProjectInput, UpdateProjectInput } from "../data/repositories/projectsRepository";
import type { Milestone, Project, Repositories } from "../data";

export interface ProjectsState {
  projects: Project[];
  milestonesByProject: Record<string, Milestone[]>;
  loading: boolean;
  loadProjects: () => Promise<void>;
  addProject: (input: CreateProjectInput) => Promise<void>;
  updateProject: (id: string, patch: UpdateProjectInput) => Promise<void>;
  archiveProject: (id: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  loadMilestones: (projectId: string) => Promise<void>;
  completeMilestone: (projectId: string, milestoneId: string) => Promise<void>;
  deleteMilestone: (projectId: string, milestoneId: string) => Promise<void>;
}

export function createProjectsStore(repos: Repositories) {
  return create<ProjectsState>((set, get) => ({
    projects: [],
    milestonesByProject: {},
    loading: false,

    async loadProjects() {
      set({ loading: true });
      const projects = await repos.projects.list();
      set({ projects, loading: false });
    },

    async addProject(input) {
      await repos.projects.create(input);
      await get().loadProjects();
    },

    async updateProject(id, patch) {
      await repos.projects.update(id, patch);
      await get().loadProjects();
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
  }));
}

export type ProjectsStore = ReturnType<typeof createProjectsStore>;
