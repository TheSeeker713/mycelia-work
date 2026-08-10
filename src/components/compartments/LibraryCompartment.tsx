import { useEffect, useRef, useState } from "react";
import { useJournalsStore, useTasksStore } from "../../store/StoreProvider";
import { useSelfVoicing } from "../../hooks/useSelfVoicing";
import { GhostTextField } from "../GhostTextField";
import { ModelBadge } from "../ModelBadge";
import type { Journal } from "../../data";
import { exportWorkJournalFile, libraryExportFilename } from "../../services/journalGeneration";

const STATUS_LABEL: Record<Journal["status"], string> = {
  pending: "Generating…",
  ok: "Ready",
  failed: "Failed",
};

/**
 * A manually-authored report (the clock-out popup's "I'll write it"
 * path) never has a model recorded — `model_used` stays null forever,
 * even after saving real content, which is also how this tells a
 * manual report apart from an AI-generated one (always editable, vs.
 * read-only once generated).
 */
function isManual(journal: Journal): boolean {
  return journal.status === "ok" && journal.model_used === null;
}

function JournalEntry({
  journal,
  onRetry,
  onSaveManual,
  autoFocus,
  onFocused,
}: {
  journal: Journal;
  onRetry: (id: string) => void;
  onSaveManual: (id: string, content: string) => void;
  autoFocus: boolean;
  onFocused: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [exportedTo, setExportedTo] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [draft, setDraft] = useState(journal.content ?? "");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const selfVoicing = useSelfVoicing();
  const label = journal.kind === "weekly" ? "Weekly roll-up" : "Session journal";
  const when = new Date(journal.generated_at).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
      onFocused();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus]);

  async function handleExport() {
    if (!journal.content) return;
    setExporting(true);
    setExportedTo(null);
    const path = await exportWorkJournalFile(libraryExportFilename(journal), journal.content).catch(() => null);
    setExporting(false);
    setExportedTo(path);
  }

  const manual = isManual(journal);

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
          {manual ? "Your report" : STATUS_LABEL[journal.status]}
        </span>
      </div>
      <div className="mt-0.5 flex items-center gap-1.5">
        <span className="text-[0.7rem] text-[var(--ink-faint)]">{when}</span>
        <ModelBadge modelUsed={journal.model_used} backendUsed={journal.backend_used} />
      </div>

      {journal.status === "pending" && (
        <div className="progress-indeterminate mt-1.5" aria-hidden="true" />
      )}

      {manual && (
        <div className="mt-1.5">
          <div
            className="rounded-lg border"
            style={{ borderColor: "var(--line)", background: "var(--paper)" }}
            onBlur={() => {
              if (draft !== journal.content) onSaveManual(journal.id, draft);
            }}
          >
            <GhostTextField
              ref={textareaRef}
              value={draft}
              onValueChange={setDraft}
              multiline
              rows={4}
              placeholder="Write what happened…"
              className="resize-none px-2 py-1.5 text-[0.78rem] text-[var(--ink)] outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => onSaveManual(journal.id, draft)}
            className="mt-1 rounded-full border border-[var(--line)] px-2.5 py-1 text-[0.7rem] text-[var(--ink-soft)]"
          >
            Save
          </button>
        </div>
      )}

      {!manual && journal.status === "ok" && journal.content && (
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
            <button
              type="button"
              onClick={() => void handleExport()}
              disabled={exporting}
              className="text-[0.7rem] text-[var(--ink-faint)] underline disabled:opacity-50"
            >
              {exporting ? "Exporting…" : "Export"}
            </button>
          </div>
          {exportedTo && (
            <p className="mt-1 text-[0.68rem] text-[var(--moss-deep)]">Saved to {exportedTo}</p>
          )}
        </div>
      )}

      {journal.status === "failed" && (
        <div className="mt-1.5">
          {journal.failure_reason && (
            <p className="mb-1 text-[0.72rem] text-[var(--ink-faint)]">{journal.failure_reason}</p>
          )}
          <button
            type="button"
            onClick={() => onRetry(journal.id)}
            className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[0.7rem] text-[var(--ink-soft)]"
          >
            Retry
          </button>
        </div>
      )}
    </li>
  );
}

type LibrarySection = "archived" | "workJournal" | "journal" | "books";

/** A collapsed section reads as one row: label, a count badge if there's anything behind it, click to expand. */
function SectionButton({
  label,
  badge,
  onClick,
}: {
  label: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-between rounded-lg border border-[var(--line)] px-2.5 py-2 text-left text-[0.78rem] font-medium text-[var(--ink)]"
    >
      <span>{label}</span>
      {badge && <span className="text-[0.7rem] text-[var(--ink-faint)]">{badge}</span>}
    </button>
  );
}

/**
 * Archived tasks live here, not in a separate archive concept — Library
 * is already "the one place put-away things go" (books/notes land here
 * too once Phase 5's session-tied notes exist). Archiving is a soft
 * delete, so every entry can come back. Reports (formerly "Work
 * journal" — AI-generated and manually-written both) live here too,
 * since Library is already "past/completed things," which a closed-out
 * session is. Internal naming (the `journals` table, `journalsStore`,
 * `workJournal` section id below) stays as-is — this is a user-facing
 * rename only.
 *
 * One section expanded at a time (Jeremy, after the first version tried
 * to show everything at once and it read as cluttered): the other two
 * collapse into a single button row each. Reports starts expanded
 * since it's the section actually worth glancing at day to day.
 */
export function LibraryCompartment({
  focusJournalId = null,
  onJournalFocused = () => {},
  onEnterJournalZenMode = () => {},
}: {
  focusJournalId?: string | null;
  onJournalFocused?: () => void;
  /** Opens the standalone free-write Journal — zen-mode-only, no compact view here. */
  onEnterJournalZenMode?: () => void;
} = {}) {
  const [chosenSection, setExpandedSection] = useState<LibrarySection>("workJournal");

  const archivedTasks = useTasksStore((s) => s.archivedTasks);
  const loadArchivedTasks = useTasksStore((s) => s.loadArchivedTasks);
  const unarchiveTask = useTasksStore((s) => s.unarchiveTask);

  const journals = useJournalsStore((s) => s.journals);
  const loadRecentJournals = useJournalsStore((s) => s.loadRecent);
  const retryJournal = useJournalsStore((s) => s.retryJournal);
  const generateWeeklyRollup = useJournalsStore((s) => s.generateWeeklyRollup);
  const saveManualReport = useJournalsStore((s) => s.saveManualReport);

  useEffect(() => {
    loadArchivedTasks();
    loadRecentJournals();
  }, [loadArchivedTasks, loadRecentJournals]);

  // A report waiting to be focused (just created from the clock-out
  // popup) always lives in the Reports section, so it has to be the
  // open one for the autofocus in JournalEntry to land on anything.
  // Derived rather than pushed through setState in an effect, which
  // would mean an extra render pass and a frame showing the wrong
  // section.
  const expandedSection: LibrarySection = focusJournalId ? "workJournal" : chosenSection;

  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto">
      <div className="mb-1 text-[0.78rem] font-semibold text-[var(--ink)]">Library</div>

      {expandedSection === "archived" ? (
        <div className="flex flex-col">
          <div className="mb-2 text-[0.7rem] tracking-wide text-[var(--ink-faint)] uppercase">
            Archived tasks
          </div>
          {archivedTasks.length === 0 ? (
            <p className="text-[0.82rem] text-[var(--ink-faint)]">Nothing archived yet.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {archivedTasks.map((task) => (
                <li
                  key={task.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-[var(--line)] px-2.5 py-2"
                >
                  <span className="text-[0.85rem] text-[var(--ink-soft)]">{task.title}</span>
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
        </div>
      ) : (
        <SectionButton
          label="Archived tasks"
          badge={archivedTasks.length > 0 ? String(archivedTasks.length) : undefined}
          onClick={() => setExpandedSection("archived")}
        />
      )}

      {expandedSection === "workJournal" ? (
        <div className="flex flex-col">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[0.7rem] tracking-wide text-[var(--ink-faint)] uppercase">
              Reports
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
            <p className="text-[0.82rem] text-[var(--ink-faint)]">
              Nothing here yet — clock out of a task to get a report started.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {journals.map((journal) => (
                <JournalEntry
                  key={journal.id}
                  journal={journal}
                  onRetry={retryJournal}
                  onSaveManual={saveManualReport}
                  autoFocus={journal.id === focusJournalId}
                  onFocused={onJournalFocused}
                />
              ))}
            </ul>
          )}
        </div>
      ) : (
        <SectionButton
          label="Reports"
          badge={journals.length > 0 ? String(journals.length) : undefined}
          onClick={() => setExpandedSection("workJournal")}
        />
      )}

      {expandedSection === "journal" ? (
        <div className="flex flex-col">
          <div className="mb-2 text-[0.7rem] tracking-wide text-[var(--ink-faint)] uppercase">
            Journal
          </div>
          <p className="mb-2 text-[0.82rem] text-[var(--ink-faint)]">
            A free-write space, separate from Reports — rich text, auto-timestamped
            paragraphs, opens full screen.
          </p>
          <button
            type="button"
            onClick={onEnterJournalZenMode}
            className="self-start rounded-lg bg-[var(--moss)] px-3 py-1.5 text-[0.8rem] text-white"
          >
            Open Journal
          </button>
        </div>
      ) : (
        <SectionButton label="Journal" onClick={() => setExpandedSection("journal")} />
      )}

      {expandedSection === "books" ? (
        <div className="flex flex-col">
          <div className="mb-2 text-[0.7rem] tracking-wide text-[var(--ink-faint)] uppercase">
            Books
          </div>
          <p className="text-[0.82rem] text-[var(--ink-faint)]">Not built yet.</p>
        </div>
      ) : (
        <SectionButton label="Books" onClick={() => setExpandedSection("books")} />
      )}
    </div>
  );
}
