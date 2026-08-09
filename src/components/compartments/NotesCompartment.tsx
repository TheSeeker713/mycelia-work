import { useEffect, useState } from "react";
import { useNotesStore, useSessionsStore } from "../../store/StoreProvider";
import { MicButton } from "../MicButton";

/** Notes attach to a running task_session — needs at least one active session to write into. */
export function NotesCompartment({
  onEnterZenMode,
}: {
  /** Opens the full-screen zen-mode editor for the given session/task (Phase 8). Omitted in contexts (like tests) that don't wire zen mode. */
  onEnterZenMode?: (sessionId: string, taskTitle: string) => void;
}) {
  const activeSessions = useSessionsStore((s) => s.activeSessions);
  const notesBySession = useNotesStore((s) => s.notesBySession);
  const loadNotesForSession = useNotesStore((s) => s.loadNotesForSession);
  const addNote = useNotesStore((s) => s.addNote);
  const draft = useNotesStore((s) => s.draft);
  const setDraft = useNotesStore((s) => s.setDraft);

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const selected =
    activeSessions.find((a) => a.session.id === selectedSessionId) ?? activeSessions[0] ?? null;

  useEffect(() => {
    if (selected) loadNotesForSession(selected.session.id);
  }, [selected, loadNotesForSession]);

  if (!selected) {
    return (
      <div className="flex h-full flex-col">
        <div className="mb-3 text-[0.78rem] font-semibold text-[var(--ink)]">Notes</div>
        <p className="text-[0.82rem] leading-relaxed text-[var(--ink-faint)]">
          Clock into a task to start writing — notes attach to that
          session's log.
        </p>
      </div>
    );
  }

  const notes = notesBySession[selected.session.id] ?? [];

  function handleAdd() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    addNote(selected!.session.id, trimmed);
    setDraft("");
  }

  function handleDictated(text: string) {
    setDraft(draft.trim() ? `${draft.trim()} ${text}` : text);
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="mb-3 text-[0.78rem] font-semibold text-[var(--ink)]">Notes</div>

      {activeSessions.length > 1 && (
        <div className="mb-2 flex gap-1.5">
          {activeSessions.map((a) => (
            <button
              key={a.session.id}
              type="button"
              onClick={() => setSelectedSessionId(a.session.id)}
              className="rounded-full px-2.5 py-1 text-[0.7rem]"
              style={{
                background:
                  a.session.id === selected.session.id ? "var(--moss-pale)" : "transparent",
                color:
                  a.session.id === selected.session.id ? "var(--moss-deep)" : "var(--ink-faint)",
              }}
            >
              {a.task.title}
            </button>
          ))}
        </div>
      )}

      {notes.length === 0 ? (
        <p className="py-2 text-[0.8rem] text-[var(--ink-faint)]">
          Nothing written yet for {selected.task.title}.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {notes.map((note) => (
            <li key={note.id} className="text-[0.82rem] leading-relaxed text-[var(--ink)]">
              <span className="mr-1.5 text-[0.68rem] text-[var(--ink-faint)] tabular-nums">
                {new Date(note.created_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              {note.body}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-col gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Write a note for ${selected.task.title}...`}
          rows={3}
          className="resize-none rounded-lg border border-[var(--line)] bg-[var(--paper)] px-2.5 py-2 text-[0.82rem] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
        />
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <MicButton onTranscribed={handleDictated} />
            {onEnterZenMode && (
              <button
                type="button"
                onClick={() => onEnterZenMode(selected.session.id, selected.task.title)}
                title="Expand to full-screen zen mode"
                aria-label="Expand to full-screen zen mode"
                className="flex-shrink-0 rounded-full border border-[var(--line)] px-2 py-1.5 text-[0.85rem] text-[var(--ink-soft)]"
              >
                ⤢
              </button>
            )}
          </div>
          {draft.trim() && (
            <button
              type="button"
              onClick={handleAdd}
              className="rounded-lg bg-[var(--moss)] px-3 py-1.5 text-[0.78rem] text-white"
            >
              Add
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
