import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

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

  return (
    <div
      data-tauri-drag-region
      className="flex flex-shrink-0 items-center justify-between border-b border-[var(--line-soft)] px-3.5 py-2.5"
    >
      <div
        data-tauri-drag-region
        className="flex items-center gap-1.5 text-[0.82rem] font-semibold text-[var(--ink)]"
      >
        <span
          data-tauri-drag-region
          className="h-[7px] w-[7px] rounded-full bg-[var(--moss)]"
        />
        <span data-tauri-drag-region>Mycelia Time</span>
      </div>
      <div className="flex gap-1">
        <button
          type="button"
          title="Always on top"
          aria-pressed={pinned}
          onClick={togglePin}
          className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] text-[0.85rem]"
          style={{
            background: pinned ? "var(--moss-pale)" : "transparent",
            color: pinned ? "var(--moss-deep)" : "var(--ink-soft)",
          }}
        >
          📌
        </button>
      </div>
    </div>
  );
}
