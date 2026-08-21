import { useEffect, useRef, type ChangeEvent, type KeyboardEvent } from "react";
import { useNotesStore } from "../store/StoreProvider";
import { useGhostText } from "../hooks/useGhostText";
import { MicButton } from "./MicButton";

/** Shared so the ghost-text mirror div lines up pixel-for-pixel with the real textarea underneath it. */
const EDITOR_TEXT_STYLE =
  "whitespace-pre-wrap break-words border border-transparent p-8 text-[1.15rem] leading-relaxed";

/**
 * The full-screen, distraction-free writing view for Notes (Phase 8) —
 * the real window is already resized to OS fullscreen by the time this
 * mounts (Dashboard.enterZenMode), so this component is just the
 * writing surface itself: no MenuBar, no compartment tabs, one obvious
 * way out. Reads/writes the same `draft` the compact Notes panel uses
 * (notesStore), so text carries over cleanly in both directions.
 *
 * Ghost-text suggestions (Phase 8.2) only fire when the cursor sits at
 * the very end of the draft — writing forward is the whole use case
 * here, and restricting to "end of text" avoids needing a full
 * caret-position-tracking implementation for mid-document edits, which
 * this feature was never meant to cover.
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

  // Same ghost-text lifecycle every other field in the app uses — this
  // editor keeps its own markup (it's a full-bleed writing surface, not
  // a form field) but no longer its own copy of the debounce/pressure/
  // staleness logic.
  const { suggestion, pending, scheduleFor, clear: clearSuggestion, warmUp } = useGhostText();
  const mirrorRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    warmUp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleChange(e: ChangeEvent<HTMLTextAreaElement>) {
    const nextText = e.target.value;
    setDraft(nextText);
    scheduleFor(nextText, e.target.selectionStart === nextText.length);
  }

  function acceptSuggestion() {
    if (!suggestion) return;
    setDraft(draft + suggestion);
    clearSuggestion();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") {
      onExit();
      return;
    }
    if (e.key === "Tab" && suggestion) {
      e.preventDefault();
      acceptSuggestion();
      return;
    }
    // Per Phase 8's design: continuing to type or any other key dismisses
    // whatever's showing — Tab is the one and only accept path.
    if (suggestion) clearSuggestion();
  }

  function handleDictated(text: string) {
    setDraft(draft.trim() ? `${draft.trim()} ${text}` : text);
  }

  function handleScroll() {
    if (mirrorRef.current && textareaRef.current) {
      mirrorRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }

  async function handleSave() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    await addNote(sessionId, trimmed);
    setDraft("");
    clearSuggestion();
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

      {/*
        The background lives on this container, NOT on the textarea. Both
        the mirror and the textarea are positioned in the same stacking
        context with no z-index, so the textarea (later in DOM order)
        always paints on top — an opaque background on it hid the mirror's
        ghost text completely, which is exactly why suggestions were
        invisible even with a healthy backend returning real text.
      */}
      <div className="relative flex-1 rounded-2xl bg-[var(--paper)]">
        <div
          ref={mirrorRef}
          aria-hidden="true"
          className={`absolute inset-0 overflow-hidden rounded-2xl ${EDITOR_TEXT_STYLE}`}
        >
          <span style={{ color: "transparent" }}>{draft}</span>
          {pending && !suggestion && (
            <span style={{ color: "var(--ink-faint)" }} aria-busy="true">
              …
            </span>
          )}
          {suggestion && <span style={{ color: "var(--ink-faint)" }}>{suggestion}</span>}
        </div>
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onScroll={handleScroll}
          autoFocus
          placeholder={`Write for ${taskTitle}...`}
          className={`relative h-full w-full resize-none rounded-2xl bg-transparent text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)] ${EDITOR_TEXT_STYLE}`}
          style={{ borderColor: "var(--line)", caretColor: "var(--ink)" }}
        />
      </div>

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
