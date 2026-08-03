import { useEffect } from "react";
import { useTasksStore } from "../../store/StoreProvider";

/**
 * Archived tasks live here, not in a separate archive concept — Library
 * is already "the one place put-away things go" (books/notes land here
 * too once Phase 5's session-tied notes exist). Archiving is a soft
 * delete, so every entry can come back.
 */
export function LibraryCompartment() {
  const archivedTasks = useTasksStore((s) => s.archivedTasks);
  const loadArchivedTasks = useTasksStore((s) => s.loadArchivedTasks);
  const unarchiveTask = useTasksStore((s) => s.unarchiveTask);

  useEffect(() => {
    loadArchivedTasks();
  }, [loadArchivedTasks]);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 text-[0.78rem] font-semibold text-[var(--ink)]">Library</div>
      <div className="mb-2 text-[0.7rem] tracking-wide text-[var(--ink-faint)] uppercase">
        Archived tasks
      </div>
      {archivedTasks.length === 0 ? (
        <p className="text-[0.82rem] text-[var(--ink-faint)]">
          Nothing archived yet.
        </p>
      ) : (
        <ul className="flex flex-1 flex-col gap-1.5 overflow-y-auto">
          {archivedTasks.map((task) => (
            <li
              key={task.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-[var(--line)] px-2.5 py-2"
            >
              <span className="text-[0.85rem] text-[var(--ink-soft)]">
                {task.title}
              </span>
              <button
                type="button"
                onClick={() => unarchiveTask(task.id)}
                className="flex-shrink-0 rounded-full border border-[var(--line)] px-2.5 py-1 text-[0.7rem] text-[var(--ink-soft)]"
              >
                Restore
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 border-t border-dashed border-[var(--line)] pt-3 text-[0.7rem] text-[var(--ink-faint)]">
        Books (notes archive) — coming with Phase 5.
      </div>
    </div>
  );
}
