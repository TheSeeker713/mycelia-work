import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export const museSuggestionPluginKey = new PluginKey<{ suggestion: string | null; decorations: DecorationSet }>(
  "museSuggestion",
);

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    museSuggestion: {
      setMuseSuggestion: (text: string) => ReturnType;
      setMusePending: () => ReturnType;
      clearMuseSuggestion: () => ReturnType;
      acceptMuseSuggestion: () => ReturnType;
      /** Clears the accepted-suggestion record, once its words have been counted for XP. */
      resetMuseAcceptedRecord: () => ReturnType;
    };
  }
}

/**
 * Renders the current Muse suggestion as a non-editable inline
 * decoration at the cursor — the plain-textarea mirror-div trick
 * `ZenModeEditor.tsx` uses doesn't translate to a ProseMirror doc
 * (there's no single scrollable text layer to mirror). Any real
 * doc change or selection move without an explicit
 * `setMuseSuggestion`/`clearMuseSuggestion` meta clears the ghost —
 * this is what makes "continuing to type or any other key dismisses"
 * work for free, without a separate keydown handler.
 */
export interface MuseSuggestionStorage {
  /**
   * Every suggestion accepted with Tab, in order. Journal XP counts
   * manually-typed words only, and once accepted text is merged into
   * the document there's no way to tell it apart, so it's recorded as
   * it happens. Lives in extension storage rather than a React ref
   * because it belongs to the editor's lifetime, not the component's
   * render cycle.
   */
  accepted: string[];
}

export const MuseSuggestion = Extension.create<Record<string, never>, MuseSuggestionStorage>({
  name: "museSuggestion",

  addStorage() {
    return { accepted: [] };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: museSuggestionPluginKey,
        state: {
          init(): { suggestion: string | null; decorations: DecorationSet } {
            return { suggestion: null, decorations: DecorationSet.empty };
          },
          apply(tr, prev) {
            const meta = tr.getMeta(museSuggestionPluginKey);
            if (meta !== undefined) {
              if (!meta) return { suggestion: null, decorations: DecorationSet.empty };
              const pos = tr.selection.from;
              const pending = typeof meta === "object" && meta !== null && "pending" in meta;
              const text = pending ? "…" : (meta as string);
              const widget = Decoration.widget(
                pos,
                () => {
                  const span = document.createElement("span");
                  span.textContent = text;
                  span.style.color = "var(--ink-faint)";
                  span.setAttribute("contenteditable", "false");
                  if (pending) span.setAttribute("data-muse-pending", "true");
                  span.setAttribute("aria-busy", pending ? "true" : "false");
                  return span;
                },
                { side: 1 },
              );
              return {
                suggestion: pending ? null : (meta as string),
                decorations: DecorationSet.create(tr.doc, [widget]),
              };
            }
            if ((tr.docChanged || tr.selectionSet) && prev.suggestion) {
              return { suggestion: null, decorations: DecorationSet.empty };
            }
            return { suggestion: prev.suggestion, decorations: prev.decorations.map(tr.mapping, tr.doc) };
          },
        },
        props: {
          decorations(state) {
            return museSuggestionPluginKey.getState(state)?.decorations;
          },
        },
      }),
    ];
  },

  addCommands() {
    return {
      setMuseSuggestion:
        (text: string) =>
        ({ tr, dispatch }) => {
          if (dispatch) tr.setMeta(museSuggestionPluginKey, text);
          return true;
        },
      setMusePending:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) tr.setMeta(museSuggestionPluginKey, { pending: true });
          return true;
        },
      clearMuseSuggestion:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) tr.setMeta(museSuggestionPluginKey, null);
          return true;
        },
      acceptMuseSuggestion:
        () =>
        ({ state, tr, dispatch }) => {
          const pluginState = museSuggestionPluginKey.getState(state);
          if (!pluginState?.suggestion) return false;
          if (dispatch) {
            tr.insertText(pluginState.suggestion, tr.selection.from);
            tr.setMeta(museSuggestionPluginKey, null);
            // Reported as it happens rather than reconstructed later:
            // once accepted text is merged into the document there's no
            // reliable way to tell it apart from typing, and journal XP
            // depends on exactly that distinction.
            this.storage.accepted.push(pluginState.suggestion);
          }
          return true;
        },
      resetMuseAcceptedRecord:
        () =>
        ({ editor }) => {
          (editor.extensionStorage.museSuggestion as MuseSuggestionStorage).accepted = [];
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => this.editor.commands.acceptMuseSuggestion(),
    };
  },
});
