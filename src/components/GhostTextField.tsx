import { useEffect, useRef, type KeyboardEvent, type RefObject } from "react";
import { useGhostText } from "../hooks/useGhostText";

/**
 * A text field with inline AI ghost-text completion, for every ordinary
 * input in the app (todos, project title/description, the compact Notes
 * panel, the clock-out brief, manual report editing). Drop-in for a
 * plain `<input>`/`<textarea>`.
 *
 * The technique is the one Notes' zen mode already used, generalized: a
 * mirror `<div>` sits behind the real field rendering the typed text in
 * transparent ink plus the suggestion in muted ink, so the suggestion
 * appears to continue the line. Both elements get the SAME `className`
 * so their metrics match exactly — any font/padding difference between
 * them shows up immediately as misaligned ghost text.
 *
 * The one hard rule this component enforces (learned the hard way, see
 * the 2026-08-09 devlog): the field itself must stay transparent, with
 * the background on the wrapper. An opaque field paints over the mirror
 * and the suggestion becomes invisible while looking perfectly fine in
 * tests.
 */
export function GhostTextField({
  value,
  onValueChange,
  className = "",
  multiline = false,
  rows,
  placeholder,
  onKeyDown,
  disabled,
  ref,
  ...rest
}: {
  value: string;
  onValueChange: (next: string) => void;
  className?: string;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  disabled?: boolean;
  /** Forwarded to the real field, so callers can focus it (React 19 passes `ref` as an ordinary prop). */
  ref?: RefObject<HTMLTextAreaElement | null> | RefObject<HTMLInputElement | null>;
  "aria-label"?: string;
  id?: string;
}) {
  const { suggestion, pending, scheduleFor, clear, warmUp } = useGhostText();
  const mirrorRef = useRef<HTMLDivElement>(null);
  const ownFieldRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const fieldRef = (ref ?? ownFieldRef) as RefObject<HTMLInputElement | HTMLTextAreaElement | null>;

  useEffect(() => {
    warmUp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleChange(next: string, selectionStart: number | null) {
    onValueChange(next);
    scheduleFor(next, selectionStart === next.length);
  }

  function acceptSuggestion() {
    if (!suggestion) return;
    onValueChange(value + suggestion);
    clear();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (e.key === "Tab" && suggestion) {
      e.preventDefault();
      acceptSuggestion();
      return;
    }
    // Escape dismisses without touching the caller's own handling of it.
    if (e.key === "Escape" && suggestion) {
      clear();
      return;
    }
    // Anything else dismisses, then falls through so the caller's own
    // key handling (Enter to submit a todo, say) still runs normally.
    if (suggestion) clear();
    onKeyDown?.(e);
  }

  /** Keeps the mirror lined up with the field once its text scrolls. */
  function handleScroll() {
    if (!mirrorRef.current || !fieldRef.current) return;
    mirrorRef.current.scrollTop = fieldRef.current.scrollTop;
    mirrorRef.current.scrollLeft = fieldRef.current.scrollLeft;
  }

  const wrapClass = multiline ? "whitespace-pre-wrap break-words" : "whitespace-pre";

  return (
    <div className="relative">
      <div
        ref={mirrorRef}
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 overflow-hidden ${wrapClass} ${className}`}
      >
        <span style={{ color: "transparent" }}>{value}</span>
        {pending && !suggestion && (
          <span style={{ color: "var(--ink-faint)" }} aria-busy="true">
            …
          </span>
        )}
        {suggestion && <span style={{ color: "var(--ink-faint)" }}>{suggestion}</span>}
      </div>
      {multiline ? (
        <textarea
          ref={fieldRef as RefObject<HTMLTextAreaElement | null>}
          value={value}
          rows={rows}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => handleChange(e.target.value, e.target.selectionStart)}
          onKeyDown={handleKeyDown}
          onScroll={handleScroll}
          className={`relative w-full bg-transparent ${wrapClass} ${className}`}
          {...rest}
        />
      ) : (
        <input
          ref={fieldRef as RefObject<HTMLInputElement | null>}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => handleChange(e.target.value, e.target.selectionStart)}
          onKeyDown={handleKeyDown}
          onScroll={handleScroll}
          className={`relative w-full bg-transparent ${className}`}
          {...rest}
        />
      )}
    </div>
  );
}
