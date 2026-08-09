import type { Editor } from "@tiptap/react";
import { useDismissableOverlay } from "./useDismissableOverlay";

const FONTS = ["Default", "Georgia", "Courier New", "Comic Sans MS"];
const SIZES: { label: string; value: string }[] = [
  { label: "Small", value: "0.85rem" },
  { label: "Normal", value: "" },
  { label: "Large", value: "1.3rem" },
];

/** Right-click RTF popup — basic formatting plus undo/redo, closes on outside click (useDismissableOverlay) or Esc (handled by the parent editor's overlay-stack keydown). */
export function JournalContextMenu({
  editor,
  x,
  y,
  onClose,
}: {
  editor: Editor;
  x: number;
  y: number;
  onClose: () => void;
}) {
  const ref = useDismissableOverlay<HTMLDivElement>(true, onClose);

  function item(label: string, onClick: () => void, active = false, disabled = false) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          onClick();
          onClose();
        }}
        className="w-full rounded px-2 py-1 text-left text-[0.8rem] disabled:opacity-40"
        style={{
          background: active ? "var(--moss-pale)" : "transparent",
          color: "var(--ink)",
        }}
      >
        {label}
      </button>
    );
  }

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Formatting"
      className="absolute z-20 w-44 rounded-lg border p-1.5 shadow-lg"
      style={{ left: x, top: y, background: "var(--paper-card)", borderColor: "var(--line)" }}
    >
      {item("Undo", () => editor.chain().focus().undo().run(), false, !editor.can().undo())}
      {item("Redo", () => editor.chain().focus().redo().run(), false, !editor.can().redo())}
      <div className="my-1 border-t" style={{ borderColor: "var(--line)" }} />
      {item("Bold", () => editor.chain().focus().toggleBold().run(), editor.isActive("bold"))}
      {item("Italic", () => editor.chain().focus().toggleItalic().run(), editor.isActive("italic"))}
      {item("Underline", () => editor.chain().focus().toggleUnderline().run(), editor.isActive("underline"))}
      <div className="my-1 border-t" style={{ borderColor: "var(--line)" }} />
      <div className="px-2 py-1 text-[0.65rem] tracking-wide text-[var(--ink-faint)] uppercase">Font</div>
      {FONTS.map((font) =>
        item(
          font,
          () =>
            font === "Default"
              ? editor.chain().focus().unsetFontFamily().run()
              : editor.chain().focus().setFontFamily(font).run(),
          editor.isActive("textStyle", { fontFamily: font }),
        ),
      )}
      <div className="px-2 py-1 text-[0.65rem] tracking-wide text-[var(--ink-faint)] uppercase">Size</div>
      {SIZES.map((size) =>
        item(
          size.label,
          () =>
            size.value ? editor.chain().focus().setFontSize(size.value).run() : editor.chain().focus().unsetFontSize().run(),
          editor.isActive("textStyle", { fontSize: size.value || null }),
        ),
      )}
    </div>
  );
}
