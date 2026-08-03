import { create } from "zustand";
import type { CreateProjectInput } from "../data/repositories/projectsRepository";
import type { Project, Repositories } from "../data";

export interface ProjectsState {
  projects: Project[];
  loading: boolean;
  loadProjects: () => Promise<void>;
  addProject: (input: CreateProjectInput) => Promise<void>;
}

export function createProjectsStore(repos: Repositories) {
  return create<ProjectsState>((set, get) => ({
    projects: [],
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
  }));
}

export type ProjectsStore = ReturnType<typeof createProjectsStore>;
