import { useEffect, useState } from "react";
import { useTasksStore } from "../store/StoreProvider";
import { PocketShell } from "./PocketShell";
import { DeviceBar } from "./DeviceBar";
import { CompartmentTabs, type CompartmentName } from "./CompartmentTabs";
import { TaskCapture } from "./TaskCapture";
import { TaskList } from "./TaskList";
import { TaskWorkspace } from "./TaskWorkspace";
import { TodosCompartment } from "./compartments/TodosCompartment";
import { ProjectsCompartment } from "./compartments/ProjectsCompartment";
import { NotesCompartment } from "./compartments/NotesCompartment";
import { LibraryCompartment } from "./compartments/LibraryCompartment";

function TasksCompartment() {
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
    <div className="flex h-full flex-col">
      <TaskCapture onAdd={addTask} />
      <TaskList tasks={tasks} focusedTaskId={focusedTaskId} onFocus={focusTask} />
      <TaskWorkspace task={focusedTask} onArchive={archiveTask} />
    </div>
  );
}

/** The pull-tab compartment shell — must run inside a StoreProvider. */
export function Dashboard() {
  const [active, setActive] = useState<CompartmentName>("tasks");

  return (
    <PocketShell>
      <DeviceBar />
      <div className="relative flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-hidden p-5 pr-9">
          {active === "tasks" && <TasksCompartment />}
          {active === "notes" && <NotesCompartment />}
          {active === "todos" && <TodosCompartment />}
          {active === "projects" && <ProjectsCompartment />}
          {active === "library" && <LibraryCompartment />}
        </div>
        <CompartmentTabs active={active} onSelect={setActive} />
      </div>
    </PocketShell>
  );
}
