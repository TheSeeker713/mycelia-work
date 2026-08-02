import { useAppStore } from "../lib/store/AppStoreProvider";

export function WorkspaceDashboard() {
  const selectedTaskId = useAppStore((s) => s.selectedTaskId);
  const task = useAppStore((s) =>
    s.tasks.find((t) => t.id === s.selectedTaskId),
  );

  if (!selectedTaskId || !task) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-neutral-500">
        Select a task, or add a new one, to open its workspace.
      </div>
    );
  }

  return (
    <div className="flex-1 p-6">
      <h2 className="text-lg font-semibold text-neutral-100">{task.title}</h2>
      <div className="mt-1 flex items-center gap-2 text-xs text-neutral-400">
        {task.tag && <span className="rounded bg-neutral-800 px-2 py-0.5">{task.tag}</span>}
        {task.billable && <span className="text-emerald-500">billable</span>}
      </div>
      <p className="mt-6 text-sm text-neutral-500">
        Timer controls, notes, and the live session log arrive in the next
        phase.
      </p>
    </div>
  );
}
