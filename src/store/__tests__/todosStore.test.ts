// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { initDatabase, type Repositories } from "../../data";
import { createTestExecutor } from "../../data/__tests__/testExecutor";
import { createTodosStore, type TodosStore } from "../todosStore";
import { createGamificationStore } from "../gamificationStore";

let repos: Repositories;
let useTodosStore: TodosStore;
let gamification: ReturnType<typeof createGamificationStore>;

beforeEach(async () => {
  repos = await initDatabase(createTestExecutor());
  gamification = createGamificationStore(repos);
  useTodosStore = createTodosStore(repos, gamification);
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

  it("completeTodo awards gamification XP, but creating a todo does not", async () => {
    await gamification.getState().load();
    await useTodosStore.getState().addTodo("Old todo");
    expect(gamification.getState().recentXpEvents.some((e) => e.source === "todo_completed")).toBe(
      false,
    );

    const id = useTodosStore.getState().todos[0].id;
    await useTodosStore.getState().completeTodo(id);
    expect(gamification.getState().recentXpEvents.some((e) => e.source === "todo_completed")).toBe(
      true,
    );
  });

  it("snoozeTodo increments the snooze count without completing it", async () => {
    await useTodosStore.getState().addTodo("Alert todo", new Date().toISOString());
    const id = useTodosStore.getState().todos[0].id;
    await useTodosStore.getState().snoozeTodo(id);
    expect(useTodosStore.getState().todos[0].snooze_count).toBe(1);
    expect(useTodosStore.getState().todos[0].done).toBe(false);
  });
});
