import { useEffect, useRef, useState } from "react";
import type { Task } from "../data";
import {
  useGamificationStore,
  useJournalsStore,
  useNotesStore,
  useOpenClawClient,
  useSessionsStore,
  useSettingsStore,
  useTasksStore,
} from "../store/StoreProvider";
import { useWindowControls } from "../hooks/useWindowControls";
import { useMultiCardWidth } from "../hooks/useMultiCardWidth";
import { useIdleWatcher } from "../hooks/useIdleWatcher";
import { useSelfVoicing } from "../hooks/useSelfVoicing";
import { ZenModeEditor } from "./ZenModeEditor";
import { CaptureDrawer } from "./CaptureDrawer";
import { Shell } from "./Shell";
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
import { SettingsCompartment } from "./compartments/SettingsCompartment";
import { OnboardingCoachMark } from "./OnboardingCoachMark";
import { AccessibilityOnboarding } from "./AccessibilityOnboarding";
import { AchievementToastStack } from "./AchievementToast";
import { ProgressCompartment } from "./compartments/ProgressCompartment";
import { ExitConfirmDialog } from "./ExitConfirmDialog";
import { SystemStartup } from "./SystemStartup";

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
  const selfVoicing = useSelfVoicing();

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const focusedTask = tasks.find((t) => t.id === focusedTaskId) ?? null;
  const focusedHasSession = activeSessions.some((a) => a.task.id === focusedTaskId);

  async function handleClockIn(task: Task) {
    const result = await clockIn(task);
    if (result.ok) selfVoicing.speak("Clocked in.");
    return result;
  }

  async function handleStartBreak(sessionId: string) {
    await startBreak(sessionId);
    selfVoicing.speak("Taking a break.");
  }

  async function handleResume(sessionId: string) {
    await resumeFromBreak(sessionId);
    selfVoicing.speak("Back to work.");
  }

  async function handleClockOut(sessionId: string) {
    const active = activeSessions.find((a) => a.session.id === sessionId);
    await clockOut(sessionId);
    selfVoicing.speak("Clocked out.");
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

function CompartmentContent({
  active,
  onEnterZenMode,
}: {
  active: CompartmentName;
  onEnterZenMode: (sessionId: string, taskTitle: string) => void;
}) {
  return (
    <>
      {active === "tasks" && <TasksCompartment />}
      {active === "notes" && <NotesCompartment onEnterZenMode={onEnterZenMode} />}
      {active === "todos" && <TodosCompartment />}
      {active === "projects" && <ProjectsCompartment />}
      {active === "progress" && <ProgressCompartment />}
      {active === "library" && <LibraryCompartment />}
      {active === "settings" && <SettingsCompartment />}
    </>
  );
}

/** The pull-tab compartment shell — must run inside a StoreProvider. */
export function Dashboard() {
  const [systemReady, setSystemReady] = useState(false);
  const [active, setActive] = useState<CompartmentName>("tasks");
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [zenMode, setZenMode] = useState<{ sessionId: string; taskTitle: string } | null>(null);
  const wasFullscreenBeforeZenRef = useRef(false);
  const controls = useWindowControls();
  const selfVoicing = useSelfVoicing();
  const activeSessions = useSessionsStore((s) => s.activeSessions);
  const loadActiveSessions = useSessionsStore((s) => s.loadActiveSessions);
  const startBreak = useSessionsStore((s) => s.startBreak);
  const resolveDanglingSession = useSessionsStore((s) => s.resolveDanglingSession);
  const addNote = useNotesStore((s) => s.addNote);
  const generateSessionJournal = useJournalsStore((s) => s.generateSessionJournal);
  const openClawClient = useOpenClawClient();
  const cardWidth = useMultiCardWidth(activeSessions.length, controls.fullscreen);

  const settingsLoaded = useSettingsStore((s) => s.loaded);
  const accessibilityOnboardingSeen = useSettingsStore((s) => s.accessibilityOnboardingSeen);
  const loadSettings = useSettingsStore((s) => s.load);
  const loadGamification = useGamificationStore((s) => s.load);

  useEffect(() => {
    loadSettings();
    loadGamification();
  }, [loadSettings, loadGamification]);

  // AOL-style "Welcome" on every launch, not just the first ever — waits
  // for the system-check screen to clear (so Piper's actually up by
  // then, not racing its own startup) and the real persisted
  // self-voicing preference (settingsLoaded), so a user who's turned
  // voicing off doesn't hear it once before the load resolves.
  // welcomeSpokenRef guards against firing again if this effect re-runs
  // for any other reason once both are already true.
  const welcomeSpokenRef = useRef(false);
  useEffect(() => {
    if (systemReady && settingsLoaded && !welcomeSpokenRef.current) {
      welcomeSpokenRef.current = true;
      selfVoicing.speak("Welcome.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systemReady, settingsLoaded]);

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
  // The capture drawer needs one session to attach notes to when
  // multiple are running at once — same "first/only" default
  // NotesCompartment already uses for its own session picker.
  const primarySessionId = activeSessions[0]?.session.id ?? null;

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

  // Zen mode always runs in real OS fullscreen (same "exit is obvious"
  // pattern as the rest of the app) regardless of which mode Jeremy was
  // in when he opened it — wasFullscreenBeforeZenRef remembers whether
  // to actually drop back out of fullscreen on exit, or just leave the
  // window as it already was.
  async function enterZenMode(sessionId: string, taskTitle: string) {
    wasFullscreenBeforeZenRef.current = controls.fullscreen;
    if (!controls.fullscreen) await controls.enterFullscreen();
    selfVoicing.speak("Entering zen mode.");
    setZenMode({ sessionId, taskTitle });
  }

  function exitZenMode() {
    selfVoicing.speak("Exiting zen mode.");
    setZenMode(null);
    if (!wasFullscreenBeforeZenRef.current) controls.exitFullscreen();
  }

  useEffect(() => {
    // Zen mode owns its own Escape handling (ZenModeEditor -> exitZenMode),
    // which respects wasFullscreenBeforeZenRef — this generic handler would
    // otherwise also fire on the same keypress and exit fullscreen
    // unconditionally, fighting that logic.
    if (!controls.fullscreen || zenMode) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") controls.exitFullscreen();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controls.fullscreen, zenMode]);

  if (!systemReady) {
    return <SystemStartup onDone={() => setSystemReady(true)} />;
  }

  if (zenMode) {
    return (
      <Shell mode="fullscreen">
        <ZenModeEditor
          sessionId={zenMode.sessionId}
          taskTitle={zenMode.taskTitle}
          onExit={exitZenMode}
        />
      </Shell>
    );
  }

  // Pocket and fullscreen share one return path (Shell varies only by
  // `mode`, not by wrapper depth) so CompartmentContent — and every
  // compartment's own local state underneath it — never unmounts on a
  // pocket↔fullscreen toggle. Zen mode stays a genuinely separate branch
  // above: its own content (the notes draft) already lives in
  // useNotesStore, not local state, so it has nothing to lose here, and
  // it renders a completely different component (ZenModeEditor) rather
  // than the compartment/chrome tree at all.
  return (
    <Shell mode={controls.fullscreen ? "fullscreen" : "pocket"} width={cardWidth}>
      {controls.fullscreen ? (
        <MenuBar
          pinned={controls.pinned}
          onTogglePin={controls.togglePin}
          onExit={() => setShowExitConfirm(true)}
          onBackToPocket={controls.exitFullscreen}
          onSelectCompartment={setActive}
          onReplayOnboarding={replayOnboarding}
        />
      ) : (
        <DeviceBar
          pinned={controls.pinned}
          onTogglePin={controls.togglePin}
          onMinimize={controls.minimizeToTray}
          onExpandFullscreen={controls.enterFullscreen}
          onExit={() => setShowExitConfirm(true)}
        />
      )}
      <div
        className={
          controls.fullscreen
            ? "relative flex flex-1 overflow-hidden"
            : "relative flex flex-1 flex-col overflow-hidden"
        }
      >
        {/*
          Full-screen mode reuses the same compact compartment components
          the pocket view uses, which left everything reading just as
          small on a full monitor as it does in the tiny pocket card —
          the opposite of what "expand to full screen" should feel like.
          `zoom` (not `transform: scale`) reflows the whole subtree,
          including its own padding, at 2x rather than just visually
          stretching it, so this stays one line instead of hand-doubling
          every size/padding value in every compartment.
        */}
        <div
          className={controls.fullscreen ? "flex-1 overflow-hidden p-6 pr-12" : "flex-1 overflow-hidden p-5 pr-9"}
          style={controls.fullscreen ? { zoom: 2 } : undefined}
        >
          <CompartmentContent active={active} onEnterZenMode={enterZenMode} />
        </div>
        <CompartmentTabs active={active} onSelect={setActive} />
        <AchievementToastStack />
        {showExitConfirm ? (
          <ExitConfirmDialog controls={controls} onCancel={() => setShowExitConfirm(false)} />
        ) : danglingSession ? (
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
        ) : !controls.fullscreen && settingsLoaded && !accessibilityOnboardingSeen ? (
          // Onboarding never shows in full-screen mode — unchanged from
          // before this restructure. AccessibilityOnboarding already
          // persists "seen" itself before calling this — once
          // accessibilityOnboardingSeen flips true, this branch stops
          // matching and the overlay unmounts on its own, so there's
          // nothing extra to do here.
          <AccessibilityOnboarding onDone={() => {}} />
        ) : (
          !controls.fullscreen &&
          showOnboarding && (
            <OnboardingCoachMark onDismiss={() => setShowOnboarding(false)} />
          )
        )}
        {!danglingSession && <CaptureDrawer activeSessionId={primarySessionId} />}
      </div>
    </Shell>
  );
}
