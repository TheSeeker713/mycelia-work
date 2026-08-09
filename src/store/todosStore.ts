import { create } from "zustand";
import type { Repositories, Todo } from "../data";
import type { GamificationStore } from "./gamificationStore";

export interface TodosState {
  todos: Todo[];
  loading: boolean;
  loadTodos: () => Promise<void>;
  addTodo: (text: string, alertAt?: string | null) => Promise<void>;
  completeTodo: (id: string) => Promise<void>;
  snoozeTodo: (id: string) => Promise<void>;
  /** Marks a due reminder as having actually fired — used by useTodoReminders right after it notifies, so the same todo never alerts twice. */
  markAlerted: (id: string) => Promise<void>;
}

export function createTodosStore(repos: Repositories, gamification: GamificationStore) {
  return create<TodosState>((set, get) => ({
    todos: [],
    loading: false,

    async loadTodos() {
      set({ loading: true });
      const todos = await repos.todos.list();
      set({ todos, loading: false });
    },

    async addTodo(text, alertAt = null) {
      await repos.todos.create(text, alertAt);
      await get().loadTodos();
    },

    async completeTodo(id) {
      await repos.todos.complete(id);
      await get().loadTodos();
      await gamification.getState().recordTodoCompleted();
    },

    async snoozeTodo(id) {
      await repos.todos.snooze(id);
      await get().loadTodos();
    },

    async markAlerted(id) {
      await repos.todos.markAlerted(id);
      await get().loadTodos();
    },
  }));
}

export type TodosStore = ReturnType<typeof createTodosStore>;
