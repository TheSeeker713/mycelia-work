import { Paragraph } from "@tiptap/extension-paragraph";
import { ReactNodeViewRenderer, NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";

/** "8-8-2026 10:40pm" — Jeremy's exact spec, not a locale-formatted date. */
export function formatParagraphStamp(iso: string): string {
  const d = new Date(iso);
  const date = `${d.getMonth() + 1}-${d.getDate()}-${d.getFullYear()}`;
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "pm" : "am";
  hours = hours % 12 || 12;
  return `${date} ${hours}:${minutes}${ampm}`;
}

function TimestampedParagraphView({ node }: NodeViewProps) {
  const createdAt = node.attrs.createdAt as string | null;
  return (
    <NodeViewWrapper as="p">
      {createdAt && (
        <span
          contentEditable={false}
          className="mr-1.5 select-none text-[0.68rem]"
          style={{ color: "var(--ink-faint)" }}
        >
          {formatParagraphStamp(createdAt)}:
        </span>
      )}
      <NodeViewContent as="span" />
    </NodeViewWrapper>
  );
}

/**
 * Extends TipTap's own Paragraph node with a `createdAt` attribute,
 * rendered as a non-editable, greyed inline label ahead of each
 * paragraph's text — "every paragraph auto populates a greyed out date
 * and time stamp," per spec, letting one long open draft (written
 * across multiple sittings before being committed) show exactly when
 * each paragraph was added. The attribute lives on the ProseMirror
 * node itself, so it survives undo/redo and JSON round-trips for free.
 *
 * Stamping happens via a ProseMirror plugin's `appendTransaction`
 * (assigns `createdAt` to any paragraph still missing it, right after
 * any doc-changing transaction) rather than intercepting the Enter key
 * specifically — this covers new paragraphs from Enter, paste, or a
 * freshly-loaded draft's very first paragraph uniformly, with no
 * separate "first paragraph" special case needed.
 */
export const TimestampedParagraph = Paragraph.extend({
  addAttributes() {
    return {
      createdAt: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-created-at"),
        renderHTML: (attributes) => (attributes.createdAt ? { "data-created-at": attributes.createdAt } : {}),
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(TimestampedParagraphView);
  },

  addProseMirrorPlugins() {
    const typeName = this.name;
    return [
      new Plugin({
        key: new PluginKey("timestampParagraphs"),
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          let tr = newState.tr;
          let modified = false;
          newState.doc.descendants((node, pos) => {
            if (node.type.name === typeName && !node.attrs.createdAt) {
              tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, createdAt: new Date().toISOString() });
              modified = true;
            }
          });
          return modified ? tr : null;
        },
      }),
    ];
  },
});
