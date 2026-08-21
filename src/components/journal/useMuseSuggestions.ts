import { useEffect } from "react";
import type { Editor } from "@tiptap/react";
import { Selection, Transaction } from "@tiptap/pm/state";
import { useGhostText } from "../../hooks/useGhostText";
import { museSuggestionPluginKey } from "./museSuggestion";

/**
 * Journal Muse: same debounce / min-chars / queue / pressure path as
 * every other ghost-text field. Only the paint is different
 * (ProseMirror decoration vs mirror div).
 */
export function useMuseSuggestions(editor: Editor | null, enabled: boolean) {
  const { suggestion, pending, scheduleFor, clear, warmUp } = useGhostText({ enabled });

  useEffect(() => {
    if (editor && enabled) warmUp();
  }, [editor, enabled, warmUp]);

  useEffect(() => {
    if (!editor) return;

    function handleUpdate({ transaction }: { transaction: Transaction }) {
      if (!enabled || !editor) {
        clear();
        return;
      }
      if (transaction.getMeta(museSuggestionPluginKey) !== undefined) return;
      const { state } = editor;
      const endOfDoc = Selection.atEnd(state.doc).from;
      const atEnd = state.selection.empty && state.selection.from === endOfDoc;
      const text = editor.getText();
      scheduleFor(text, atEnd);
    }

    editor.on("update", handleUpdate);
    return () => {
      editor.off("update", handleUpdate);
      clear();
    };
  }, [editor, enabled, scheduleFor, clear]);

  useEffect(() => {
    if (!editor) return;
    if (suggestion) {
      editor.commands.setMuseSuggestion(suggestion);
    } else if (pending) {
      editor.commands.setMusePending();
    } else {
      editor.commands.clearMuseSuggestion();
    }
  }, [editor, suggestion, pending]);
}
