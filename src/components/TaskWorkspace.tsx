import type { Task } from "../data";

export function TaskWorkspace({
  task,
  hasActiveSession,
  onArchive,
  onClockIn,
  clockInDisabled,
}: {
  task: Task | null;
  hasActiveSession: boolean;
  onArchive: (id: string) => void;
  onClockIn: (task: Task) => void;
  clockInDisabled: boolean;
}) {
  if (!task) {
    return (
      <div className="mt-3 border-t border-dashed border-[var(--line)] pt-3 text-[0.8rem] text-[var(--ink-faint)]">
        Click a task to focus the workspace on it.
      </div>
    );
  }

  return (
    <div className="mt-3 border-t border-dashed border-[var(--line)] pt-3">
      <div className="text-[1.05rem] leading-tight font-semibold text-[var(--ink)]">
        {task.title}
      </div>
      <div className="mt-1 flex items-center gap-2 text-[0.76rem] text-[var(--ink-soft)]">
        {task.tag && <span>{task.tag}</span>}
        {task.billable && <span className="text-[var(--moss-deep)]">billable</span>}
      </div>
      <div className="mt-3 flex gap-2">
        {!hasActiveSession && (
          <button
            type="button"
            onClick={() => onClockIn(task)}
            disabled={clockInDisabled}
            title={
              clockInDisabled
                ? "3 tasks are already running — clock one out first"
                : undefined
            }
            className="rounded-lg bg-[var(--moss)] px-3 py-1.5 text-[0.78rem] text-white disabled:opacity-40"
          >
            Clock in
          </button>
        )}
        <button
          type="button"
          onClick={() => onArchive(task.id)}
          className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-[0.78rem] text-[var(--ink-soft)]"
        >
          Archive
        </button>
      </div>
    </div>
  );
}
