import type { Task } from "../data";

export function TaskWorkspace({
  task,
  onArchive,
}: {
  task: Task | null;
  onArchive: (id: string) => void;
}) {
  if (!task) {
    return (
      <div className="mt-auto border-t border-dashed border-[var(--line)] pt-3 text-[0.8rem] text-[var(--ink-faint)]">
        Click a task to focus the workspace on it.
      </div>
    );
  }

  return (
    <div className="mt-auto border-t border-dashed border-[var(--line)] pt-3">
      <div className="text-[1.05rem] leading-tight font-semibold text-[var(--ink)]">
        {task.title}
      </div>
      <div className="mt-1 flex items-center gap-2 text-[0.76rem] text-[var(--ink-soft)]">
        {task.tag && <span>{task.tag}</span>}
        {task.billable && <span className="text-[var(--moss-deep)]">billable</span>}
      </div>
      <button
        type="button"
        onClick={() => onArchive(task.id)}
        className="mt-3 rounded-lg border border-[var(--line)] px-3 py-1.5 text-[0.78rem] text-[var(--ink-soft)]"
      >
        Archive
      </button>
    </div>
  );
}
