// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { initDatabase, type Repositories } from "../../data";
import { createTestExecutor } from "../../data/__tests__/testExecutor";
import { createTodosStore, type TodosStore } from "../todosStore";

let repos: Repositories;
let useTodosStore: TodosStore;

beforeEach(async () => {
  repos = await initDatabase(createTestExecutor());
  useTodosStore = createTodosStore(repos);
});

describe("todosStore", () => {
  it("loads todos from the repository", async () => {
    await repos.todos.create("Ship the Kanban module");
    await useTodosStore.getState().loadTodos();
    expect(useTodosStore.getState().todos.map((t) => t.text)).toEqual([
      "Ship the Kanban module",
    ]);
  });

  it("addTodo creates and refreshes the list", async () => {
    await useTodosStore.getState().addTodo("Write the devlog entry");
    expect(useTodosStore.getState().todos.length).toBe(1);
    expect(useTodosStore.getState().todos[0].done).toBe(false);
  });

  it("completeTodo marks done and it drops out of the default list", async () => {
    await useTodosStore.getState().addTodo("Old todo");
    const id = useTodosStore.getState().todos[0].id;
    await useTodosStore.getState().completeTodo(id);
    expect(useTodosStore.getState().todos).toEqual([]);
  });

  it("snoozeTodo increments the snooze count without completing it", async () => {
    await useTodosStore.getState().addTodo("Alert todo", new Date().toISOString());
    const id = useTodosStore.getState().todos[0].id;
    await useTodosStore.getState().snoozeTodo(id);
    expect(useTodosStore.getState().todos[0].snooze_count).toBe(1);
    expect(useTodosStore.getState().todos[0].done).toBe(false);
  });
});
