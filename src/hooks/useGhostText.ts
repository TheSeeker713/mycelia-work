import { useCallback, useEffect, useRef, useState } from "react";
import {
  useOllamaClient,
  useResourceStore,
  useResourceWatchdogClient,
  useSettingsStore,
} from "../store/StoreProvider";
import { runAiJob } from "../services/aiQueue";

export const SUGGESTION_DEBOUNCE_MS = 600;

/**
 * Below this many characters a continuation is guesswork rather than a
 * real completion — firing on "b" produces noise and burns a model call
 * on every first keystroke in every field in the app. Zen mode used to
 * fire on any non-empty text, which was tolerable when one editor did
 * it and is not once every input does.
 */
export const MIN_CHARS_FOR_SUGGESTION = 12;

/**
 * The shared ghost-text lifecycle: debounce, resource-pressure check,
 * request, and staleness guard. Both the plain-input/textarea path
 * (`GhostTextField`) and Notes' zen-mode editor use this, so there's one
 * place where "how ghost text behaves" is defined rather than a copy per
 * call site. The Journal's TipTap editor keeps its own rendering (a
 * ProseMirror decoration — a mirror div can't work inside a rich-text
 * doc) but follows the same rules.
 *
 * Rendering is deliberately NOT this hook's job. It returns the current
 * suggestion and the callbacks to drive it; the caller decides how to
 * paint it.
 */
export function useGhostText() {
  const enabled = useSettingsStore((s) => s.aiSuggestionsEnabled);
  const ollamaClient = useOllamaClient();
  const resourceWatchdogClient = useResourceWatchdogClient();
  const logResourceEvent = useResourceStore((s) => s.logEvent);

  const [suggestion, setSuggestion] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      requestIdRef.current += 1; // invalidate anything still in flight
    },
    [],
  );

  /** Drops any pending request and hides whatever's showing. */
  const clear = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    requestIdRef.current += 1;
    setSuggestion(null);
  }, []);

  /**
   * Call on every edit. Clears the current suggestion (typing always
   * dismisses) and schedules a fresh request if this text is worth
   * completing and the caret is at the end.
   */
  const scheduleFor = useCallback(
    (text: string, cursorAtEnd: boolean) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setSuggestion(null);
      const myId = ++requestIdRef.current;

      if (!enabled || !cursorAtEnd) return;
      if (text.trim().length < MIN_CHARS_FOR_SUGGESTION) return;

      debounceRef.current = setTimeout(async () => {
        // A late suggestion for text the user already moved past is
        // worse than none, so a pressured round is dropped rather than
        // deferred — there's no sensible "run it once things calm down"
        // for something that's only useful in the next second or two.
        const pressure = await resourceWatchdogClient.checkPressure();
        if (requestIdRef.current !== myId) return;
        if (pressure.underPressure) {
          logResourceEvent(
            "throttled",
            `ghost-text suggestion skipped (cpu ${pressure.cpuPercent.toFixed(0)}%, mem ${pressure.memPercent.toFixed(0)}%)`,
          );
          return;
        }

        // Through the app-wide AI lock like everything else, but with a
        // relevance check: if a journal generation is hogging the slot
        // and the person has typed on since, this drops rather than
        // arriving late with a completion for text they've moved past.
        // `requestIdRef` is the same staleness signal used everywhere
        // else in this hook, reused rather than invented twice.
        const result = await runAiJob(
          {
            kind: "ghost_text",
            label: "Suggesting a continuation",
            isStillRelevant: () => requestIdRef.current === myId,
          },
          () => ollamaClient.suggestContinuation(text),
        ).catch(() => null); // cancelled or dropped is a normal outcome here

        if (requestIdRef.current !== myId || !result) return;
        setSuggestion(result);
      }, SUGGESTION_DEBOUNCE_MS);
    },
    [enabled, ollamaClient, resourceWatchdogClient, logResourceEvent],
  );

  /** Warms the model so the first real pause isn't a cold load. Safe to call on mount. */
  const warmUp = useCallback(() => {
    if (enabled) ollamaClient.warmUpGhostText();
  }, [enabled, ollamaClient]);

  return { suggestion, scheduleFor, clear, warmUp, enabled };
}
