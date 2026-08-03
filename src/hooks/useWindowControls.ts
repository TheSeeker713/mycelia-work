import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";

const POCKET_SIZE = new LogicalSize(380, 520);
const FULLSCREEN_SIZE = new LogicalSize(920, 640);

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
    try {
      await getCurrentWindow().setSize(FULLSCREEN_SIZE);
      setFullscreen(true);
    } catch {
      // no Tauri bridge available; still flip the view so it's testable
      setFullscreen(true);
    }
  }

  async function exitFullscreen() {
    try {
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
