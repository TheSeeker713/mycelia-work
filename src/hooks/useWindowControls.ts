import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";

// Must match tauri.conf.json's initial window size — 70px of invisible
// margin around the 340x480 card, enough for the shadow's blur to fully
// fade before hitting the window edge (see PocketShell.tsx).
const POCKET_SIZE = new LogicalSize(480, 620);

/** Centralizes the window-level actions shared by DeviceBar (pocket mode) and MenuBar (full-screen mode). */
export function useWindowControls() {
  const [pinned, setPinned] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

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

  async function enterFullscreen() {
    // A real OS-level fullscreen, not just a bigger floating window —
    // resizing to a larger size (the original approach) left a
    // transparent, undersized window still floating over the desktop,
    // with other windows visibly showing through around it.
    // setFullscreen actually takes over the whole display.
    try {
      await getCurrentWindow().setFullscreen(true);
    } catch {
      // no Tauri bridge available; still flip the view so it's testable
    }
    setFullscreen(true);
  }

  async function exitFullscreen() {
    try {
      await getCurrentWindow().setFullscreen(false);
      // Safety net: explicitly restore the pocket size rather than
      // trusting the OS's "remembered" pre-fullscreen size to match.
      await getCurrentWindow().setSize(POCKET_SIZE);
    } catch {
      // no Tauri bridge available; nothing to resize
    }
    setFullscreen(false);
  }

  return {
    pinned,
    togglePin,
    minimizeToTray,
    emergencyExit,
    fullscreen,
    enterFullscreen,
    exitFullscreen,
  };
}

export type WindowControls = ReturnType<typeof useWindowControls>;
