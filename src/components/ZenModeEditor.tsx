import type { KeyboardEvent } from "react";
import { useNotesStore } from "../store/StoreProvider";
import { MicButton } from "./MicButton";

/**
 * The full-screen, distraction-free writing view for Notes (Phase 8) —
 * the real window is already resized to OS fullscreen by the time this
 * mounts (Dashboard.enterZenMode), so this component is just the
 * writing surface itself: no MenuBar, no compartment tabs, one obvious
 * way out. Reads/writes the same `draft` the compact Notes panel uses
 * (notesStore), so text carries over cleanly in both directions.
 */
export function ZenModeEditor({
  sessionId,
  taskTitle,
  onExit,
}: {
  sessionId: string;
  taskTitle: string;
  onExit: () => void;
}) {
  const draft = useNotesStore((s) => s.draft);
  const setDraft = useNotesStore((s) => s.setDraft);
  const addNote = useNotesStore((s) => s.addNote);

  function handleDictated(text: string) {
    setDraft(draft.trim() ? `${draft.trim()} ${text}` : text);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") onExit();
  }

  async function handleSave() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    await addNote(sessionId, trimmed);
    setDraft("");
  }

  return (
    <div className="flex h-full flex-col p-10">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-[0.7rem] tracking-wide text-[var(--ink-faint)] uppercase">
            Zen mode
          </div>
          <div className="text-[1rem] font-semibold text-[var(--ink)]">{taskTitle}</div>
        </div>
        <button
          type="button"
          onClick={onExit}
          className="rounded-full border border-[var(--line)] px-3 py-1.5 text-[0.8rem] text-[var(--ink-soft)]"
        >
          Exit zen mode
        </button>
      </div>

      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        autoFocus
        placeholder={`Write for ${taskTitle}...`}
        className="flex-1 resize-none rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-8 text-[1.15rem] leading-relaxed text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
      />

      <div className="mt-4 flex items-center justify-between gap-2">
        <MicButton onTranscribed={handleDictated} />
        {draft.trim() && (
          <button
            type="button"
            onClick={handleSave}
            className="rounded-lg bg-[var(--moss)] px-4 py-2 text-[0.85rem] text-white"
          >
            Save note
          </button>
        )}
      </div>
    </div>
  );
}
