import { useEffect, useRef } from "react";
import type { Editor } from "@tiptap/react";
import { Selection } from "@tiptap/pm/state";
import { useOllamaClient, useResourceWatchdogClient } from "../../store/StoreProvider";

const SUGGESTION_DEBOUNCE_MS = 600;

/**
 * The Journal's "Muse" ghost-text — conceptually the same debounce +
 * resource-pressure-check + `ollamaClient.suggestContinuation` flow as
 * `ZenModeEditor.tsx`'s ghost text, but the accept/render mechanics
 * differ (a ProseMirror `Decoration.widget` via the `museSuggestion`
 * extension, not a mirror-div-behind-a-transparent-textarea trick),
 * so this isn't a literal shared import, just the same shape of logic.
 */
export function useMuseSuggestions(editor: Editor | null, enabled: boolean) {
  const ollamaClient = useOllamaClient();
  const resourceWatchdogClient = useResourceWatchdogClient();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (editor && enabled) ollamaClient.warmUpGhostText();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  useEffect(() => {
    if (!editor) return;

    function handleUpdate() {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      requestIdRef.current += 1;
      if (!enabled || !editor) return;

      const { state } = editor;
      // `doc.content.size` is NOT a valid cursor position — a paragraph's
      // closing token occupies the last slot, so the furthest the caret
      // can actually sit is one less than that. Comparing against it
      // directly meant this guard never passed and Muse never fired at
      // all. `Selection.atEnd` resolves the real end-of-document caret
      // position instead of hand-computing the offset.
      const endOfDoc = Selection.atEnd(state.doc).from;
      const atEnd = state.selection.empty && state.selection.from === endOfDoc;
      const text = editor.getText().trim();
      if (!atEnd || !text) return;

      const myId = requestIdRef.current;
      debounceRef.current = setTimeout(async () => {
        const pressure = await resourceWatchdogClient.checkPressure();
        if (requestIdRef.current !== myId) return;
        if (pressure.underPressure) return;

        const result = await ollamaClient.suggestContinuation(text);
        if (requestIdRef.current !== myId || !result) return;
        editor.commands.setMuseSuggestion(result);
      }, SUGGESTION_DEBOUNCE_MS);
    }

    editor.on("update", handleUpdate);
    return () => {
      editor.off("update", handleUpdate);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [editor, enabled, ollamaClient, resourceWatchdogClient]);
}
