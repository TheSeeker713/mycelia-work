import { useState } from "react";
import type { CompartmentName } from "./CompartmentTabs";

type MenuName = "file" | "edit" | "settings" | "help";

export function MenuBar({
  pinned,
  onTogglePin,
  onExit,
  onBackToPocket,
  onSelectCompartment,
}: {
  pinned: boolean;
  onTogglePin: () => void;
  onExit: () => void;
  onBackToPocket: () => void;
  onSelectCompartment: (name: CompartmentName) => void;
}) {
  const [openMenu, setOpenMenu] = useState<MenuName | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function toggle(name: MenuName) {
    setOpenMenu((current) => (current === name ? null : name));
  }

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 2500);
  }

  function item(action: () => void) {
    return () => {
      setOpenMenu(null);
      action();
    };
  }

  return (
    <div className="relative flex flex-shrink-0 items-center gap-1 border-b border-[var(--line-soft)] px-3.5 py-2">
      <MenuTrigger
        name="file"
        label="File"
        open={openMenu === "file"}
        onToggle={toggle}
      >
        <MenuAction onClick={item(() => onSelectCompartment("tasks"))}>
          New task
        </MenuAction>
        <MenuAction danger onClick={item(onExit)}>
          Exit Mycelia Time
          <span className="text-[0.68rem] text-[var(--ink-faint)]">Ctrl+Shift+Q</span>
        </MenuAction>
      </MenuTrigger>

      <MenuTrigger
        name="edit"
        label="Edit"
        open={openMenu === "edit"}
        onToggle={toggle}
      >
        <MenuAction onClick={item(() => showToast("Nothing to undo yet."))}>
          Undo
        </MenuAction>
        <MenuAction onClick={item(() => showToast("Nothing to redo yet."))}>
          Redo
        </MenuAction>
      </MenuTrigger>

      <MenuTrigger
        name="settings"
        label="Settings"
        open={openMenu === "settings"}
        onToggle={toggle}
      >
        <MenuAction onClick={item(onTogglePin)}>
          {pinned ? "Turn off always on top" : "Always on top"}
        </MenuAction>
      </MenuTrigger>

      <MenuTrigger
        name="help"
        label="Help"
        open={openMenu === "help"}
        onToggle={toggle}
      >
        <MenuAction
          onClick={item(() =>
            showToast("Mycelia Time — built with Jeremy Robards and Claude Code."),
          )}
        >
          About Mycelia Time
        </MenuAction>
      </MenuTrigger>

      <button
        type="button"
        onClick={onBackToPocket}
        className="ml-auto rounded-lg border border-[var(--line)] px-3 py-1.5 text-[0.78rem] text-[var(--ink-soft)]"
      >
        ↙ Back to pocket view (Esc)
      </button>

      {toast && (
        <div
          className="absolute top-full left-3.5 mt-2 rounded-lg px-3 py-2 text-[0.78rem]"
          style={{ background: "var(--moss-pale)", color: "var(--moss-deep)" }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

function MenuTrigger({
  name,
  label,
  open,
  onToggle,
  children,
}: {
  name: MenuName;
  label: string;
  open: boolean;
  onToggle: (name: MenuName) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => onToggle(name)}
        className="rounded-md px-2.5 py-1.5 text-[0.82rem] text-[var(--ink-soft)]"
        style={{ background: open ? "var(--paper-deep)" : "transparent" }}
      >
        {label}
      </button>
      {open && (
        <div className="absolute top-full left-0 z-10 mt-1 flex min-w-[190px] flex-col gap-0.5 rounded-lg border border-[var(--line)] bg-[var(--paper-card)] p-1.5 shadow-[0_10px_24px_-12px_rgba(0,0,0,0.4)]">
          {children}
        </div>
      )}
    </div>
  );
}

function MenuAction({
  onClick,
  danger,
  children,
}: {
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left text-[0.82rem]"
      style={{ color: danger ? "var(--rust)" : "var(--ink)" }}
    >
      {children}
    </button>
  );
}
