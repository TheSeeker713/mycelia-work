import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/** CLAUDE.md: "a few minutes" of no input while a task is running. */
export const IDLE_THRESHOLD_SECONDS = 180;
const POLL_INTERVAL_MS = 20_000;

/**
 * Polls system-wide idle time (via the Rust `system_idle_seconds`
 * command, which wraps GetLastInputInfo) — not scoped to this app's own
 * window, so working in another app still counts as active. Only
 * relevant while at least one session is genuinely `running` (not
 * on_break, which is already an acknowledged pause).
 */
export function useIdleWatcher(hasRunningSession: boolean) {
  const [idleSeconds, setIdleSeconds] = useState(0);
  const [showToast, setShowToast] = useState(false);
  const alreadySurfacedRef = useRef(false);

  useEffect(() => {
    if (!hasRunningSession) return;
    const id = setInterval(async () => {
      try {
        const seconds = await invoke<number>("system_idle_seconds");
        setIdleSeconds(seconds);
        if (seconds >= IDLE_THRESHOLD_SECONDS && !alreadySurfacedRef.current) {
          alreadySurfacedRef.current = true;
          setShowToast(true);
        } else if (seconds < IDLE_THRESHOLD_SECONDS) {
          // Real activity resumed — arm for the next idle period.
          alreadySurfacedRef.current = false;
        }
      } catch {
        // no Tauri bridge available; nothing to poll
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [hasRunningSession]);

  function dismiss() {
    setShowToast(false);
  }

  return { showToast, idleSeconds, dismiss };
}
