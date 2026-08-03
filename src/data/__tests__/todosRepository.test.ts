// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { applyMigrations } from "../schema";
import { createTodosRepository } from "../repositories/todosRepository";
import type { SqlExecutor } from "../sqlExecutor";
import { createTestExecutor } from "./testExecutor";

let executor: SqlExecutor;
let todos: ReturnType<typeof createTodosRepository>;

beforeEach(async () => {
  executor = createTestExecutor();
  await applyMigrations(executor);
  todos = createTodosRepository(executor);
});

describe("todosRepository", () => {
  it("creates a todo, not done, zero snoozes", async () => {
    const todo = await todos.create("Ship the Kanban module");
    expect(todo.done).toBe(false);
    expect(todo.snooze_count).toBe(0);
  });

  it("list excludes done todos by default", async () => {
    const a = await todos.create("A");
    await todos.create("B");
    await todos.complete(a.id);

    const active = await todos.list();
    expect(active.map((t) => t.text)).toEqual(["B"]);

    const all = await todos.list({ includeDone: true });
    expect(all.length).toBe(2);
  });

  it("snooze increments the counter without changing done state", async () => {
    const todo = await todos.create("Alert-driven todo", new Date().toISOString());
    await todos.snooze(todo.id);
    await todos.snooze(todo.id);

    const all = await todos.list({ includeDone: true });
    const found = all.find((t) => t.id === todo.id);
    expect(found?.snooze_count).toBe(2);
    expect(found?.done).toBe(false);
  });
});
