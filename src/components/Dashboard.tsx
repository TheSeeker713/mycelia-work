import { useEffect } from "react";
import { useTasksStore } from "../store/StoreProvider";
import { PocketShell } from "./PocketShell";
import { DeviceBar } from "./DeviceBar";
import { TaskCapture } from "./TaskCapture";
import { TaskList } from "./TaskList";
import { TaskWorkspace } from "./TaskWorkspace";

/** The task management workspace — capture, list, click-to-focus, archive. Must run inside a StoreProvider. */
export function Dashboard() {
  const tasks = useTasksStore((s) => s.tasks);
  const loadTasks = useTasksStore((s) => s.loadTasks);
  const addTask = useTasksStore((s) => s.addTask);
  const archiveTask = useTasksStore((s) => s.archiveTask);
  const focusedTaskId = useTasksStore((s) => s.focusedTaskId);
  const focusTask = useTasksStore((s) => s.focusTask);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const focusedTask = tasks.find((t) => t.id === focusedTaskId) ?? null;

  return (
    <PocketShell>
      <DeviceBar />
      <div className="flex flex-1 flex-col overflow-hidden p-5">
        <TaskCapture onAdd={addTask} />
        <TaskList tasks={tasks} focusedTaskId={focusedTaskId} onFocus={focusTask} />
        <TaskWorkspace task={focusedTask} onArchive={archiveTask} />
      </div>
    </PocketShell>
  );
}
