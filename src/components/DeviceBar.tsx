import { useEffect, useState, type MouseEvent as ReactMouseEvent } from "react";
import { getCurrentWindow, type Window as TauriWindow } from "@tauri-apps/api/window";
import { PhysicalPosition } from "@tauri-apps/api/dpi";

/** The pocket-book's top bar — also the window's drag handle, since decorations are off. */
export function DeviceBar() {
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    // getCurrentWindow() throws synchronously (not a rejected promise)
    // outside a real Tauri webview — jsdom in tests has no
    // window.__TAURI_INTERNALS__ for it to read.
    try {
      getCurrentWindow()
        .isAlwaysOnTop()
        .then(setPinned)
        .catch(() => {});
    } catch {
      // no Tauri bridge available; pin stays at its default (off)
    }
  }, []);

  async function togglePin() {
    const next = !pinned;
    try {
      await getCurrentWindow().setAlwaysOnTop(next);
      setPinned(next);
    } catch {
      // no Tauri bridge available; nothing to toggle
    }
  }

  async function minimizeToTray() {
    try {
      await getCurrentWindow().hide();
    } catch {
      // no Tauri bridge available; nothing to hide
    }
  }

  async function emergencyExit() {
    try {
      // destroy() skips the close-requested event entirely (which the
      // Rust side intercepts to hide-to-tray instead of quitting) — this
      // is the one path that actually ends the process.
      await getCurrentWindow().destroy();
    } catch {
      // no Tauri bridge available; nothing to close
    }
  }

  // Manual drag instead of `data-tauri-drag-region` / startDragging():
  // Windows' native interactive-move loop doesn't repaint a transparent
  // layered window mid-drag, so the card went invisible while dragging.
  // Repositioning the window ourselves on every mousemove keeps it
  // rendering the whole time.
  async function handleBarMouseDown(e: ReactMouseEvent) {
    if (e.button !== 0) return;
    let win: TauriWindow;
    let startPos: PhysicalPosition;
    try {
      win = getCurrentWindow();
      startPos = await win.outerPosition();
    } catch {
      return;
    }
    const startCursorX = e.screenX;
    const startCursorY = e.screenY;

    function onMove(moveEvent: globalThis.MouseEvent) {
      const dx = moveEvent.screenX - startCursorX;
      const dy = moveEvent.screenY - startCursorY;
      win
        .setPosition(new PhysicalPosition(startPos.x + dx, startPos.y + dy))
        .catch(() => {});
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return (
    <div
      data-testid="device-bar"
      onMouseDown={handleBarMouseDown}
      className="flex flex-shrink-0 items-center justify-between border-b border-[var(--line-soft)] px-3.5 py-2.5"
      style={{ cursor: "move" }}
    >
      <div className="flex items-center gap-1.5 text-[0.82rem] font-semibold text-[var(--ink)]">
        <span className="h-[7px] w-[7px] rounded-full bg-[var(--moss)]" />
        <span>Mycelia Time</span>
      </div>
      <div className="flex gap-1">
        <button
          type="button"
          title="Always on top"
          aria-pressed={pinned}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={togglePin}
          className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] text-[0.85rem]"
          style={{
            background: pinned ? "var(--moss-pale)" : "transparent",
            color: pinned ? "var(--moss-deep)" : "var(--ink-soft)",
          }}
        >
          📌
        </button>
        <button
          type="button"
          title="Minimize to tray"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={minimizeToTray}
          className="ml-1 flex h-[26px] w-[26px] items-center justify-center rounded-[7px] text-[0.85rem] text-[var(--ink-soft)]"
        >
          ▁
        </button>
        <button
          type="button"
          title="Emergency exit — fully closes the app"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={emergencyExit}
          className="ml-1.5 flex h-[26px] w-[26px] items-center justify-center rounded-[7px] text-[0.85rem]"
          style={{ color: "var(--rust)" }}
        >
          ⏻
        </button>
      </div>
    </div>
  );
}
