// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { initDatabase, type Repositories } from "../../data";
import { createTestExecutor } from "../../data/__tests__/testExecutor";
import { createTasksStore, type TasksStore } from "../tasksStore";

let repos: Repositories;
let useTasksStore: TasksStore;

beforeEach(async () => {
  repos = await initDatabase(createTestExecutor());
  useTasksStore = createTasksStore(repos);
});

describe("tasksStore", () => {
  it("starts empty and loads tasks from the repository", async () => {
    await repos.tasks.create({ title: "Write the devlog entry" });

    await useTasksStore.getState().loadTasks();

    expect(useTasksStore.getState().tasks.map((t) => t.title)).toEqual([
      "Write the devlog entry",
    ]);
  });

  it("addTask creates the task and refreshes the list", async () => {
    await useTasksStore.getState().addTask({ title: "Ship the Kanban module" });

    expect(useTasksStore.getState().tasks.length).toBe(1);
    expect(useTasksStore.getState().tasks[0].title).toBe("Ship the Kanban module");
  });

  it("addTask carries optional tag and billable through", async () => {
    await useTasksStore.getState().addTask({
      title: "Client call",
      tag: "client-work",
      billable: true,
    });

    const task = useTasksStore.getState().tasks[0];
    expect(task.tag).toBe("client-work");
    expect(task.billable).toBe(true);
  });

  it("focusTask sets and clears the focused task id", () => {
    useTasksStore.getState().focusTask("abc");
    expect(useTasksStore.getState().focusedTaskId).toBe("abc");

    useTasksStore.getState().focusTask(null);
    expect(useTasksStore.getState().focusedTaskId).toBeNull();
  });

  it("archiveTask removes it from the active list and clears focus if it was focused", async () => {
    await useTasksStore.getState().addTask({ title: "Old task" });
    const task = useTasksStore.getState().tasks[0];
    useTasksStore.getState().focusTask(task.id);

    await useTasksStore.getState().archiveTask(task.id);

    expect(useTasksStore.getState().tasks).toEqual([]);
    expect(useTasksStore.getState().focusedTaskId).toBeNull();
  });

  it("archiveTask leaves focus alone if a different task was focused", async () => {
    await useTasksStore.getState().addTask({ title: "Task A" });
    await useTasksStore.getState().addTask({ title: "Task B" });
    const [a, b] = useTasksStore.getState().tasks;
    useTasksStore.getState().focusTask(a.id);

    await useTasksStore.getState().archiveTask(b.id);

    expect(useTasksStore.getState().focusedTaskId).toBe(a.id);
  });

  it("loadArchivedTasks populates archivedTasks without touching the active list", async () => {
    await useTasksStore.getState().addTask({ title: "Old task" });
    const task = useTasksStore.getState().tasks[0];
    await useTasksStore.getState().archiveTask(task.id);

    await useTasksStore.getState().loadArchivedTasks();

    expect(useTasksStore.getState().archivedTasks.map((t) => t.title)).toEqual([
      "Old task",
    ]);
  });

  it("unarchiveTask restores a task to the active list", async () => {
    await useTasksStore.getState().addTask({ title: "Old task" });
    const task = useTasksStore.getState().tasks[0];
    await useTasksStore.getState().archiveTask(task.id);
    await useTasksStore.getState().loadArchivedTasks();

    await useTasksStore.getState().unarchiveTask(task.id);

    expect(useTasksStore.getState().archivedTasks).toEqual([]);
    expect(useTasksStore.getState().tasks.map((t) => t.title)).toEqual(["Old task"]);
  });
});
