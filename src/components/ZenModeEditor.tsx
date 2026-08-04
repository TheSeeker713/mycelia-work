import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import {
  useNotesStore,
  useOllamaClient,
  useResourceStore,
  useResourceWatchdogClient,
  useSettingsStore,
} from "../store/StoreProvider";
import { MicButton } from "./MicButton";

const SUGGESTION_DEBOUNCE_MS = 600;

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
  const aiSuggestionsEnabled = useSettingsStore((s) => s.aiSuggestionsEnabled);
  const ollamaClient = useOllamaClient();
  const resourceWatchdogClient = useResourceWatchdogClient();
  const logResourceEvent = useResourceStore((s) => s.logEvent);

  const [suggestion, setSuggestion] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      requestIdRef.current += 1; // invalidate any in-flight request
    },
    [],
  );

  function scheduleSuggestion(text: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const myId = ++requestIdRef.current;
    debounceRef.current = setTimeout(async () => {
      // A stale/late suggestion for text the user already moved past isn't
      // useful, so under pressure this round is just skipped rather than
      // deferred to run later — unlike a user-initiated action, there's no
      // sensible "queue it and run when things calm down" for ghost text.
      const pressure = await resourceWatchdogClient.checkPressure();
      if (requestIdRef.current !== myId) return;
      if (pressure.underPressure) {
        logResourceEvent(
          "throttled",
          `ghost-text suggestion skipped (cpu ${pressure.cpuPercent.toFixed(0)}%, mem ${pressure.memPercent.toFixed(0)}%)`,
        );
        return;
      }

      const result = await ollamaClient.suggestContinuation(text);
      if (requestIdRef.current !== myId || !result) return;
      setSuggestion(result);
    }, SUGGESTION_DEBOUNCE_MS);
  }

  function handleChange(e: ChangeEvent<HTMLTextAreaElement>) {
    const nextText = e.target.value;
    const cursorAtEnd = e.target.selectionStart === nextText.length;
    setDraft(nextText);
    setSuggestion(null);
    requestIdRef.current += 1; // any stale in-flight suggestion no longer applies

    if (aiSuggestionsEnabled && cursorAtEnd && nextText.trim()) {
      scheduleSuggestion(nextText);
    } else if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
  }

  function acceptSuggestion() {
    if (!suggestion) return;
    setDraft(draft + suggestion);
    setSuggestion(null);
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
    if (suggestion) setSuggestion(null);
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
    setSuggestion(null);
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

      <div className="relative flex-1">
        <div
          ref={mirrorRef}
          aria-hidden="true"
          className={`absolute inset-0 overflow-hidden rounded-2xl ${EDITOR_TEXT_STYLE}`}
        >
          <span style={{ color: "transparent" }}>{draft}</span>
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
          className={`relative h-full w-full resize-none rounded-2xl bg-[var(--paper)] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)] ${EDITOR_TEXT_STYLE}`}
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
