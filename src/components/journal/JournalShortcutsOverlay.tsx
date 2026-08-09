import { useDismissableOverlay } from "./useDismissableOverlay";

const SHORTCUTS: { keys: string; does: string }[] = [
  { keys: "Ctrl/Cmd + B", does: "Bold" },
  { keys: "Ctrl/Cmd + I", does: "Italic" },
  { keys: "Ctrl/Cmd + U", does: "Underline" },
  { keys: "Ctrl/Cmd + Z", does: "Undo" },
  { keys: "Ctrl/Cmd + Shift + Z", does: "Redo" },
  { keys: "Tab", does: "Accept a Muse suggestion" },
  { keys: "Right-click", does: "Open the formatting menu" },
  { keys: "Esc", does: "Close a menu, or exit the Journal" },
];

/** The header shortcuts icon's "card layer" — closes on outside click (useDismissableOverlay) or Esc (parent's overlay-stack keydown). */
export function JournalShortcutsOverlay({ onClose }: { onClose: () => void }) {
  const ref = useDismissableOverlay<HTMLDivElement>(true, onClose);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Keyboard shortcuts"
      className="absolute top-14 right-6 z-20 w-64 rounded-[14px] border p-4 shadow-lg"
      style={{ background: "var(--paper-card)", borderColor: "var(--line)" }}
    >
      <div className="mb-2 text-[0.72rem] tracking-wide text-[var(--ink-faint)] uppercase">
        Keyboard shortcuts
      </div>
      <ul className="flex flex-col gap-1.5">
        {SHORTCUTS.map((s) => (
          <li key={s.keys} className="flex items-center justify-between gap-3 text-[0.78rem]">
            <span className="text-[var(--ink-soft)]">{s.does}</span>
            <span
              className="rounded px-1.5 py-0.5 text-[0.68rem]"
              style={{ background: "var(--line-soft)", color: "var(--ink)" }}
            >
              {s.keys}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
