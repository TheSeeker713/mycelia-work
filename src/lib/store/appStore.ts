import { create } from "zustand";
import type { SqlExecutor } from "../db/executor";
import * as repo from "../db/repository";
import type { Task } from "../db/types";

export interface AppState {
  tasks: Task[];
  selectedTaskId: number | null;
  loading: boolean;
  error: string | null;
  loadTasks: () => Promise<void>;
  createTask: (input: {
    title: string;
    tag?: string | null;
    billable?: boolean;
  }) => Promise<void>;
  archiveTask: (id: number) => Promise<void>;
  selectTask: (id: number | null) => void;
}

export function createAppStore(db: SqlExecutor) {
  return create<AppState>((set, get) => ({
    tasks: [],
    selectedTaskId: null,
    loading: false,
    error: null,

    async loadTasks() {
      set({ loading: true, error: null });
      try {
        const tasks = await repo.listTasks(db);
        set({ tasks, loading: false });
      } catch (err) {
        set({ error: (err as Error).message, loading: false });
      }
    },

    async createTask(input) {
      const title = input.title.trim();
      if (!title) return;
      await repo.createTask(db, { ...input, title });
      await get().loadTasks();
    },

    async archiveTask(id) {
      await repo.archiveTask(db, id);
      if (get().selectedTaskId === id) {
        set({ selectedTaskId: null });
      }
      await get().loadTasks();
    },

    selectTask(id) {
      set({ selectedTaskId: id });
    },
  }));
}

export type AppStore = ReturnType<typeof createAppStore>;
