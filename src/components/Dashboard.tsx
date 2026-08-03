import { useEffect, useState } from "react";
import { useTasksStore } from "../store/StoreProvider";
import { useWindowControls } from "../hooks/useWindowControls";
import { PocketShell } from "./PocketShell";
import { FullscreenShell } from "./FullscreenShell";
import { DeviceBar } from "./DeviceBar";
import { MenuBar } from "./MenuBar";
import { CompartmentTabs, type CompartmentName } from "./CompartmentTabs";
import { TaskCapture } from "./TaskCapture";
import { TaskList } from "./TaskList";
import { TaskWorkspace } from "./TaskWorkspace";
import { TodosCompartment } from "./compartments/TodosCompartment";
import { ProjectsCompartment } from "./compartments/ProjectsCompartment";
import { NotesCompartment } from "./compartments/NotesCompartment";
import { LibraryCompartment } from "./compartments/LibraryCompartment";
import { OnboardingCoachMark } from "./OnboardingCoachMark";

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

function CompartmentContent({ active }: { active: CompartmentName }) {
  return (
    <>
      {active === "tasks" && <TasksCompartment />}
      {active === "notes" && <NotesCompartment />}
      {active === "todos" && <TodosCompartment />}
      {active === "projects" && <ProjectsCompartment />}
      {active === "library" && <LibraryCompartment />}
    </>
  );
}

/** The pull-tab compartment shell — must run inside a StoreProvider. */
export function Dashboard() {
  const [active, setActive] = useState<CompartmentName>("tasks");
  const [showOnboarding, setShowOnboarding] = useState(true);
  const controls = useWindowControls();

  function replayOnboarding() {
    if (controls.fullscreen) controls.exitFullscreen();
    setShowOnboarding(true);
  }

  useEffect(() => {
    if (!controls.fullscreen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") controls.exitFullscreen();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controls.fullscreen]);

  if (controls.fullscreen) {
    return (
      <FullscreenShell>
        <MenuBar
          pinned={controls.pinned}
          onTogglePin={controls.togglePin}
          onExit={controls.emergencyExit}
          onBackToPocket={controls.exitFullscreen}
          onSelectCompartment={setActive}
          onReplayOnboarding={replayOnboarding}
        />
        <div className="relative flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-hidden p-6 pr-12">
            <CompartmentContent active={active} />
          </div>
          <CompartmentTabs active={active} onSelect={setActive} />
        </div>
      </FullscreenShell>
    );
  }

  return (
    <PocketShell>
      <DeviceBar
        pinned={controls.pinned}
        onTogglePin={controls.togglePin}
        onMinimize={controls.minimizeToTray}
        onExpandFullscreen={controls.enterFullscreen}
        onExit={controls.emergencyExit}
      />
      <div className="relative flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-hidden p-5 pr-9">
          <CompartmentContent active={active} />
        </div>
        <CompartmentTabs active={active} onSelect={setActive} />
        {showOnboarding && (
          <OnboardingCoachMark onDismiss={() => setShowOnboarding(false)} />
        )}
      </div>
    </PocketShell>
  );
}
