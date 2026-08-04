import type { ActiveSession } from "../store/sessionsStore";
import { TimerDisplay } from "./TimerDisplay";

export function SessionCard({
  activeSession,
  onStartBreak,
  onResume,
  onClockOut,
}: {
  activeSession: ActiveSession;
  onStartBreak: (sessionId: string) => void;
  onResume: (sessionId: string) => void;
  onClockOut: (sessionId: string) => void;
}) {
  const { task, session } = activeSession;
  const onBreak = session.status === "on_break";

  return (
    <div className="flex w-[280px] flex-shrink-0 flex-col rounded-[14px] border border-[var(--line)] bg-[var(--paper)] p-3.5">
      <div className="truncate text-[0.85rem] font-semibold text-[var(--ink)]">
        {task.title}
      </div>
      <div className="mt-2">
        <TimerDisplay clockedInAt={session.clocked_in_at} events={activeSession.events} />
      </div>
      <div
        className="mt-1.5 mb-3 inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.68rem]"
        style={{
          background: onBreak ? "var(--amber-pale)" : "var(--moss-pale)",
          color: onBreak ? "var(--amber)" : "var(--moss-deep)",
        }}
      >
        <span
          className="h-[6px] w-[6px] rounded-full"
          style={{ background: onBreak ? "var(--amber)" : "var(--moss)" }}
        />
        {onBreak ? "On break" : "Running"}
      </div>
      <div className="mt-auto flex gap-1.5">
        {onBreak ? (
          <button
            type="button"
            onClick={() => onResume(session.id)}
            className="flex-1 rounded-lg bg-[var(--moss)] px-3 py-1.5 text-[0.76rem] text-white"
          >
            Resume
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onStartBreak(session.id)}
            className="flex-1 rounded-lg border border-[var(--line)] px-3 py-1.5 text-[0.76rem] text-[var(--ink-soft)]"
          >
            Take a break
          </button>
        )}
        <button
          type="button"
          onClick={() => onClockOut(session.id)}
          className="flex-1 rounded-lg border border-[var(--rust)] px-3 py-1.5 text-[0.76rem] text-[var(--rust)]"
        >
          Clock out
        </button>
      </div>
    </div>
  );
}
