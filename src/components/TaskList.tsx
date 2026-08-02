import { useState } from "react";
import { useAppStore } from "../lib/store/AppStoreProvider";

export function TaskList() {
  const tasks = useAppStore((s) => s.tasks);
  const selectedTaskId = useAppStore((s) => s.selectedTaskId);
  const createTask = useAppStore((s) => s.createTask);
  const archiveTask = useAppStore((s) => s.archiveTask);
  const selectTask = useAppStore((s) => s.selectTask);

  const [title, setTitle] = useState("");
  const [tag, setTag] = useState("");
  const [billable, setBillable] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await createTask({ title, tag: tag.trim() || null, billable });
    setTitle("");
    setTag("");
    setBillable(false);
  }

  return (
    <div className="flex h-full w-72 flex-col border-r border-neutral-800 bg-neutral-950">
      <form onSubmit={handleSubmit} className="space-y-2 border-b border-neutral-800 p-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What are you working on?"
          aria-label="New task title"
          className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-600 focus:outline-none"
        />
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="tag (optional)"
            aria-label="Task tag"
            className="w-24 rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-neutral-300 placeholder:text-neutral-600 focus:border-neutral-600 focus:outline-none"
          />
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={billable}
              onChange={(e) => setBillable(e.target.checked)}
              aria-label="Billable"
            />
            billable
          </label>
          <button
            type="submit"
            className="ml-auto rounded bg-neutral-800 px-2 py-1 text-neutral-200 hover:bg-neutral-700"
          >
            Add
          </button>
        </div>
      </form>

      <ul className="flex-1 overflow-y-auto">
        {tasks.length === 0 && (
          <li className="p-4 text-sm text-neutral-500">
            No tasks yet. Add one above to get started.
          </li>
        )}
        {tasks.map((task) => (
          <li key={task.id}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => selectTask(task.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter") selectTask(task.id);
              }}
              className={`flex items-center justify-between gap-2 border-b border-neutral-900 px-3 py-2 text-sm ${
                selectedTaskId === task.id
                  ? "bg-neutral-800 text-neutral-50"
                  : "text-neutral-300 hover:bg-neutral-900"
              }`}
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="truncate">{task.title}</span>
                {task.tag && (
                  <span className="shrink-0 rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400">
                    {task.tag}
                  </span>
                )}
                {task.billable && (
                  <span className="shrink-0 text-[10px] text-emerald-500">$</span>
                )}
              </div>
              <button
                type="button"
                aria-label={`Archive ${task.title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  void archiveTask(task.id);
                }}
                className="shrink-0 rounded px-1 text-neutral-600 hover:bg-neutral-700 hover:text-neutral-200"
              >
                &times;
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
