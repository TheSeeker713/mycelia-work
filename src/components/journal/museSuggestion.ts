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
      clearMuseSuggestion: () => ReturnType;
      acceptMuseSuggestion: () => ReturnType;
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
export const MuseSuggestion = Extension.create({
  name: "museSuggestion",

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
              const widget = Decoration.widget(
                pos,
                () => {
                  const span = document.createElement("span");
                  span.textContent = meta as string;
                  span.style.color = "var(--ink-faint)";
                  span.setAttribute("contenteditable", "false");
                  return span;
                },
                { side: 1 },
              );
              return { suggestion: meta as string, decorations: DecorationSet.create(tr.doc, [widget]) };
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
          }
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
