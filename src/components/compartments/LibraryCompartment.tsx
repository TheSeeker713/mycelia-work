import { useEffect, useState } from "react";
import { useJournalsStore, useTasksStore } from "../../store/StoreProvider";
import { useSelfVoicing } from "../../hooks/useSelfVoicing";
import type { Journal } from "../../data";

const STATUS_LABEL: Record<Journal["status"], string> = {
  pending: "Generating…",
  ok: "Ready",
  failed: "Failed",
};

function JournalEntry({
  journal,
  onRetry,
}: {
  journal: Journal;
  onRetry: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const selfVoicing = useSelfVoicing();
  const label = journal.kind === "weekly" ? "Weekly roll-up" : "Session journal";
  const when = new Date(journal.generated_at).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <li className="rounded-lg border border-[var(--line)] px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[0.78rem] font-medium text-[var(--ink)]">{label}</span>
        <span
          className={
            "rounded-full px-2 py-0.5 text-[0.65rem] " +
            (journal.status === "ok"
              ? "bg-[var(--moss)]/15 text-[var(--moss)]"
              : journal.status === "failed"
                ? "bg-red-500/10 text-red-600"
                : "bg-[var(--line)] text-[var(--ink-faint)]")
          }
        >
          {STATUS_LABEL[journal.status]}
        </span>
      </div>
      <div className="mt-0.5 text-[0.7rem] text-[var(--ink-faint)]">{when}</div>

      {journal.status === "ok" && journal.content && (
        <div className="mt-1.5">
          <p
            className={
              "whitespace-pre-wrap text-[0.78rem] text-[var(--ink-soft)] " +
              (expanded ? "" : "line-clamp-3")
            }
          >
            {journal.content}
          </p>
          <div className="mt-1 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="text-[0.7rem] text-[var(--ink-faint)] underline"
            >
              {expanded ? "Show less" : "Read more"}
            </button>
            <button
              type="button"
              onClick={() =>
                selfVoicing.speaking ? selfVoicing.stop() : selfVoicing.speak(journal.content ?? "")
              }
              className="text-[0.7rem] text-[var(--ink-faint)] underline"
            >
              {selfVoicing.speaking ? "Stop reading" : "🔊 Read aloud"}
            </button>
          </div>
        </div>
      )}

      {journal.status === "failed" && (
        <button
          type="button"
          onClick={() => onRetry(journal.id)}
          className="mt-1.5 rounded-full border border-[var(--line)] px-2.5 py-1 text-[0.7rem] text-[var(--ink-soft)]"
        >
          Retry
        </button>
      )}
    </li>
  );
}

/**
 * Archived tasks live here, not in a separate archive concept — Library
 * is already "the one place put-away things go" (books/notes land here
 * too once Phase 5's session-tied notes exist). Archiving is a soft
 * delete, so every entry can come back. The AI-generated work journal
 * — real kept content, per CLAUDE.md — lives here too, since Library is
 * already "past/completed things," which a closed-out session is.
 */
export function LibraryCompartment() {
  const archivedTasks = useTasksStore((s) => s.archivedTasks);
  const loadArchivedTasks = useTasksStore((s) => s.loadArchivedTasks);
  const unarchiveTask = useTasksStore((s) => s.unarchiveTask);

  const journals = useJournalsStore((s) => s.journals);
  const loadRecentJournals = useJournalsStore((s) => s.loadRecent);
  const retryJournal = useJournalsStore((s) => s.retryJournal);
  const generateWeeklyRollup = useJournalsStore((s) => s.generateWeeklyRollup);

  useEffect(() => {
    loadArchivedTasks();
    loadRecentJournals();
  }, [loadArchivedTasks, loadRecentJournals]);

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
      <div className="mt-4 flex items-center justify-between border-t border-dashed border-[var(--line)] pt-3">
        <div className="text-[0.7rem] tracking-wide text-[var(--ink-faint)] uppercase">
          Work journal
        </div>
        <button
          type="button"
          onClick={() => generateWeeklyRollup()}
          className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[0.7rem] text-[var(--ink-soft)]"
        >
          Weekly roll-up
        </button>
      </div>
      {journals.length === 0 ? (
        <p className="mt-2 text-[0.82rem] text-[var(--ink-faint)]">
          Nothing generated yet — clock out of a task to get one started.
        </p>
      ) : (
        <ul className="mt-2 flex max-h-40 flex-col gap-1.5 overflow-y-auto">
          {journals.map((journal) => (
            <JournalEntry key={journal.id} journal={journal} onRetry={retryJournal} />
          ))}
        </ul>
      )}

      <div className="mt-4 border-t border-dashed border-[var(--line)] pt-3 text-[0.7rem] text-[var(--ink-faint)]">
        Books (notes archive) — not built yet.
      </div>
    </div>
  );
}
