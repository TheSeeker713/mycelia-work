import { useEffect, useRef } from "react";

/**
 * Shared click-outside-to-close behavior for the Journal's context menu
 * and keyboard-shortcuts overlay — one small hook instead of a
 * duplicated `mousedown` listener per overlay component.
 */
export function useDismissableOverlay<T extends HTMLElement>(active: boolean, onClose: () => void) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (!active) return;
    function handleMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [active, onClose]);

  return ref;
}
