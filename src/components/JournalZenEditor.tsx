import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextStyle from "@tiptap/extension-text-style";
import FontFamily from "@tiptap/extension-font-family";
import { useJournalEntriesStore, useSettingsStore } from "../store/StoreProvider";
import { TimestampedParagraph } from "./journal/timestampedParagraph";
import { FontSize } from "./journal/fontSize";
import { MuseSuggestion, type MuseSuggestionStorage } from "./journal/museSuggestion";
import { useMuseSuggestions } from "./journal/useMuseSuggestions";
import { JournalContextMenu } from "./journal/JournalContextMenu";
import { JournalShortcutsOverlay } from "./journal/JournalShortcutsOverlay";
import type { DiaryEntry } from "../data";

const AUTOSAVE_DEBOUNCE_MS = 900;
type Overlay = "contextMenu" | "shortcuts" | null;

/**
 * The standalone free-write Journal's editor — always full-screen (no
 * compact view). Keyed by `draft.id` in the parent so committing (the
 * Save button) swaps in a fresh, fully-remounted editor instance for
 * the next blank draft, rather than trying to imperatively reset a
 * live TipTap instance's content/history mid-session.
 */
function JournalEditorInner({ draft, onExit }: { draft: DiaryEntry; onExit: () => void }) {
  const autosave = useJournalEntriesStore((s) => s.autosave);
  const commit = useJournalEntriesStore((s) => s.commit);
  const museEnabled = useSettingsStore((s) => s.museEnabled);
  const setMuseEnabled = useSettingsStore((s) => s.setMuseEnabled);

  const [overlay, setOverlay] = useState<Overlay>(null);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const autosaveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ paragraph: false }),
      TimestampedParagraph,
      Underline,
      TextStyle,
      FontFamily,
      FontSize,
      MuseSuggestion,
    ],
    content: JSON.parse(draft.content_json),
    autofocus: "end",
    onUpdate({ editor: e }) {
      if (autosaveDebounceRef.current) clearTimeout(autosaveDebounceRef.current);
      autosaveDebounceRef.current = setTimeout(() => {
        void autosave(JSON.stringify(e.getJSON()));
      }, AUTOSAVE_DEBOUNCE_MS);
    },
  });

  useMuseSuggestions(editor, museEnabled);

  useEffect(
    () => () => {
      if (autosaveDebounceRef.current) clearTimeout(autosaveDebounceRef.current);
    },
    [],
  );

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (overlay) {
        setOverlay(null);
        return;
      }
      onExit();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [overlay, onExit]);

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    setMenuPos({ x: e.clientX, y: e.clientY });
    setOverlay("contextMenu");
  }

  async function handleSave() {
    if (autosaveDebounceRef.current) clearTimeout(autosaveDebounceRef.current);
    if (editor) await autosave(JSON.stringify(editor.getJSON()));
    // Muse's own record of what it wrote, kept in extension storage —
    // see museSuggestion.ts for why it can't be reconstructed later.
    const museStorage = editor?.extensionStorage.museSuggestion as MuseSuggestionStorage | undefined;
    const accepted = [...(museStorage?.accepted ?? [])];
    await commit(editor?.getText() ?? "", accepted.join(" "));
    editor?.commands.resetMuseAcceptedRecord();
  }

  return (
    <div className="relative flex h-full flex-col p-10">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-[0.7rem] tracking-wide text-[var(--ink-faint)] uppercase">Journal</div>
          <div className="text-[1rem] font-semibold text-[var(--ink)]">Free write</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-pressed={museEnabled}
            onClick={() => void setMuseEnabled(!museEnabled)}
            className="rounded-full border px-3 py-1.5 text-[0.78rem]"
            style={
              museEnabled
                ? { borderColor: "var(--moss)", background: "var(--moss-pale)", color: "var(--moss-deep)" }
                : { borderColor: "var(--line)", color: "var(--ink-soft)" }
            }
            title="Muse suggests continuations while you write"
          >
            Muse {museEnabled ? "on" : "off"}
          </button>
          <button
            type="button"
            aria-label="Keyboard shortcuts"
            onClick={() => setOverlay("shortcuts")}
            className="rounded-full border border-[var(--line)] px-2.5 py-1.5 text-[0.85rem] text-[var(--ink-soft)]"
          >
            ⌨
          </button>
          <button
            type="button"
            onClick={onExit}
            className="rounded-full border border-[var(--line)] px-3 py-1.5 text-[0.8rem] text-[var(--ink-soft)]"
          >
            Exit
          </button>
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto rounded-2xl border p-6"
        style={{ borderColor: "var(--line)", background: "var(--paper)" }}
        onContextMenu={handleContextMenu}
      >
        <EditorContent editor={editor} className="prose-journal h-full text-[1.05rem] leading-relaxed text-[var(--ink)]" />
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={() => void handleSave()}
          className="rounded-lg bg-[var(--moss)] px-4 py-2 text-[0.85rem] text-white"
        >
          Save
        </button>
      </div>

      {overlay === "contextMenu" && editor && (
        <JournalContextMenu editor={editor} x={menuPos.x} y={menuPos.y} onClose={() => setOverlay(null)} />
      )}
      {overlay === "shortcuts" && <JournalShortcutsOverlay onClose={() => setOverlay(null)} />}
    </div>
  );
}

export function JournalZenEditor({ onExit }: { onExit: () => void }) {
  const draft = useJournalEntriesStore((s) => s.draft);
  const loadDraft = useJournalEntriesStore((s) => s.loadDraft);

  useEffect(() => {
    loadDraft();
  }, [loadDraft]);

  if (!draft) {
    return (
      <div className="flex h-full items-center justify-center p-10 text-[0.85rem] text-[var(--ink-faint)]">
        Opening your journal…
      </div>
    );
  }

  return <JournalEditorInner key={draft.id} draft={draft} onExit={onExit} />;
}
