import { create } from "zustand";
import type { Repositories, Todo } from "../data";

export interface TodosState {
  todos: Todo[];
  loading: boolean;
  loadTodos: () => Promise<void>;
  addTodo: (text: string, alertAt?: string | null) => Promise<void>;
  completeTodo: (id: string) => Promise<void>;
  snoozeTodo: (id: string) => Promise<void>;
}

export function createTodosStore(repos: Repositories) {
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
    },

    async snoozeTodo(id) {
      await repos.todos.snooze(id);
      await get().loadTodos();
    },
  }));
}

export type TodosStore = ReturnType<typeof createTodosStore>;
