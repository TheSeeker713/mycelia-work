import type { Task } from "../data";

export function TaskList({
  tasks,
  focusedTaskId,
  onFocus,
}: {
  tasks: Task[];
  focusedTaskId: string | null;
  onFocus: (id: string) => void;
}) {
  if (tasks.length === 0) {
    return (
      <p className="py-4 text-center text-[0.82rem] text-[var(--ink-faint)]">
        No tasks yet — add one above.
      </p>
    );
  }

  return (
    <ul className="flex flex-1 flex-col gap-1 overflow-y-auto">
      {tasks.map((task) => {
        const focused = task.id === focusedTaskId;
        return (
          <li key={task.id}>
            <button
              type="button"
              onClick={() => onFocus(task.id)}
              aria-pressed={focused}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[0.88rem]"
              style={{ background: focused ? "var(--moss-pale)" : "transparent" }}
            >
              <span
                className="h-[7px] w-[7px] flex-shrink-0 rounded-full"
                style={{
                  background: task.completed_at ? "var(--ink-faint)" : "var(--moss)",
                }}
              />
              <span
                className="flex-1 truncate"
                style={{
                  color: task.completed_at ? "var(--ink-faint)" : "var(--ink)",
                  textDecoration: task.completed_at ? "line-through" : "none",
                }}
              >
                {task.title}
              </span>
              {task.tag && (
                <span className="flex-shrink-0 rounded-full bg-[var(--amber-pale)] px-2 py-0.5 text-[0.66rem] text-[var(--amber)]">
                  {task.tag}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
