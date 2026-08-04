import { useEffect, useState } from "react";
import type { Task } from "../data";
import {
  useJournalsStore,
  useNotesStore,
  useOpenClawClient,
  useSessionsStore,
  useTasksStore,
} from "../store/StoreProvider";
import { useWindowControls } from "../hooks/useWindowControls";
import { useMultiCardWidth } from "../hooks/useMultiCardWidth";
import { useIdleWatcher } from "../hooks/useIdleWatcher";
import { useVoiceCues } from "../hooks/useVoiceCues";
import { PocketShell } from "./PocketShell";
import { FullscreenShell } from "./FullscreenShell";
import { DeviceBar } from "./DeviceBar";
import { MenuBar } from "./MenuBar";
import { CompartmentTabs, type CompartmentName } from "./CompartmentTabs";
import { TaskCapture } from "./TaskCapture";
import { TaskList } from "./TaskList";
import { TaskWorkspace } from "./TaskWorkspace";
import { ActiveSessionsRow } from "./ActiveSessionsRow";
import { ShortIdleToast } from "./ShortIdleToast";
import { CheckInFlow } from "./CheckInFlow";
import { MAX_CONCURRENT_SESSIONS, isDangling } from "../store/sessionsStore";
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

  const activeSessions = useSessionsStore((s) => s.activeSessions);
  const clockIn = useSessionsStore((s) => s.clockIn);
  const startBreak = useSessionsStore((s) => s.startBreak);
  const resumeFromBreak = useSessionsStore((s) => s.resumeFromBreak);
  const clockOut = useSessionsStore((s) => s.clockOut);
  const generateSessionJournal = useJournalsStore((s) => s.generateSessionJournal);
  const voiceCues = useVoiceCues();

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const focusedTask = tasks.find((t) => t.id === focusedTaskId) ?? null;
  const focusedHasSession = activeSessions.some((a) => a.task.id === focusedTaskId);

  async function handleClockIn(task: Task) {
    const result = await clockIn(task);
    if (result.ok) voiceCues.play("clock_in");
    return result;
  }

  async function handleStartBreak(sessionId: string) {
    await startBreak(sessionId);
    voiceCues.play("break_start");
  }

  async function handleResume(sessionId: string) {
    await resumeFromBreak(sessionId);
    voiceCues.play("break_resume");
  }

  async function handleClockOut(sessionId: string) {
    const active = activeSessions.find((a) => a.session.id === sessionId);
    await clockOut(sessionId);
    voiceCues.play("clock_out");
    if (active) await generateSessionJournal(active.task, sessionId);
  }

  return (
    <div className="flex h-full flex-col">
      <TaskCapture onAdd={addTask} />
      <TaskList tasks={tasks} focusedTaskId={focusedTaskId} onFocus={focusTask} />
      <ActiveSessionsRow
        activeSessions={activeSessions}
        onStartBreak={handleStartBreak}
        onResume={handleResume}
        onClockOut={handleClockOut}
      />
      <TaskWorkspace
        task={focusedTask}
        hasActiveSession={focusedHasSession}
        onArchive={archiveTask}
        onClockIn={handleClockIn}
        clockInDisabled={activeSessions.length >= MAX_CONCURRENT_SESSIONS}
      />
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
  const activeSessions = useSessionsStore((s) => s.activeSessions);
  const loadActiveSessions = useSessionsStore((s) => s.loadActiveSessions);
  const startBreak = useSessionsStore((s) => s.startBreak);
  const resolveDanglingSession = useSessionsStore((s) => s.resolveDanglingSession);
  const addNote = useNotesStore((s) => s.addNote);
  const generateSessionJournal = useJournalsStore((s) => s.generateSessionJournal);
  const openClawClient = useOpenClawClient();
  const cardWidth = useMultiCardWidth(activeSessions.length, controls.fullscreen);

  const runningSessions = activeSessions.filter((a) => a.session.status === "running");
  const idle = useIdleWatcher(runningSessions.length > 0);

  function logIdleAsBreak() {
    for (const a of runningSessions) startBreak(a.session.id);
    idle.dismiss();
  }

  // Forgot-to-clock-out: a session still running 8+ hours later takes
  // priority over everything else — resolved one at a time if more than
  // one has gone dangling.
  const danglingSession = activeSessions.find((a) => isDangling(a.session.clocked_in_at));

  async function resolveCheckIn(clockedOutAt: string, note: string) {
    if (!danglingSession) return;
    const { task, session } = danglingSession;
    await resolveDanglingSession(session.id, clockedOutAt);
    if (note) await addNote(session.id, note);
    await generateSessionJournal(task, session.id);
  }

  useEffect(() => {
    loadActiveSessions();
  }, [loadActiveSessions]);

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
          {danglingSession ? (
            <CheckInFlow
              activeSession={danglingSession}
              onResolve={resolveCheckIn}
              client={openClawClient}
            />
          ) : (
            idle.showToast && (
              <ShortIdleToast
                idleSeconds={idle.idleSeconds}
                onKeepAsWork={idle.dismiss}
                onLogAsBreak={logIdleAsBreak}
              />
            )
          )}
        </div>
      </FullscreenShell>
    );
  }

  return (
    <PocketShell width={cardWidth}>
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
        {danglingSession ? (
          <CheckInFlow
            activeSession={danglingSession}
            onResolve={resolveCheckIn}
            client={openClawClient}
          />
        ) : idle.showToast ? (
          <ShortIdleToast
            idleSeconds={idle.idleSeconds}
            onKeepAsWork={idle.dismiss}
            onLogAsBreak={logIdleAsBreak}
          />
        ) : (
          showOnboarding && (
            <OnboardingCoachMark onDismiss={() => setShowOnboarding(false)} />
          )
        )}
      </div>
    </PocketShell>
  );
}
