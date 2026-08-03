import { create } from "zustand";
import type { Repositories, Task } from "../data";

export interface NewTaskInput {
  title: string;
  tag?: string;
  billable?: boolean;
  projectId?: string;
}

export interface TasksState {
  tasks: Task[];
  archivedTasks: Task[];
  loading: boolean;
  focusedTaskId: string | null;
  loadTasks: () => Promise<void>;
  loadArchivedTasks: () => Promise<void>;
  addTask: (input: NewTaskInput) => Promise<void>;
  archiveTask: (id: string) => Promise<void>;
  unarchiveTask: (id: string) => Promise<void>;
  focusTask: (id: string | null) => void;
}

/**
 * Factory instead of a single module-level store, so tests (and any
 * future multi-window scenario) each get an isolated instance wired to
 * their own repositories rather than sharing global state.
 */
export function createTasksStore(repos: Repositories) {
  return create<TasksState>((set, get) => ({
    tasks: [],
    archivedTasks: [],
    loading: false,
    focusedTaskId: null,

    async loadTasks() {
      set({ loading: true });
      const tasks = await repos.tasks.list();
      set({ tasks, loading: false });
    },

    async loadArchivedTasks() {
      const archivedTasks = await repos.tasks.listArchived();
      set({ archivedTasks });
    },

    async addTask(input) {
      await repos.tasks.create({
        title: input.title,
        tag: input.tag ?? null,
        billable: input.billable ?? false,
        projectId: input.projectId ?? null,
      });
      await get().loadTasks();
    },

    async archiveTask(id) {
      await repos.tasks.archive(id);
      await get().loadTasks();
      if (get().focusedTaskId === id) set({ focusedTaskId: null });
    },

    async unarchiveTask(id) {
      await repos.tasks.unarchive(id);
      await get().loadArchivedTasks();
      await get().loadTasks();
    },

    focusTask(id) {
      set({ focusedTaskId: id });
    },
  }));
}

export type TasksStore = ReturnType<typeof createTasksStore>;
