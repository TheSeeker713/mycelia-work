import { useCallback, useEffect, useRef, useState } from "react";
import {
  useOllamaClient,
  useResourceStore,
  useResourceWatchdogClient,
  useSettingsStore,
  useTasksStore,
} from "../store/StoreProvider";
import { runAiJob } from "../services/aiQueue";

export const SUGGESTION_DEBOUNCE_MS = 600;

/**
 * Below this many characters a continuation is guesswork rather than a
 * real completion — firing on "b" produces noise and burns a model call
 * on every first keystroke in every field in the app.
 */
export const MIN_CHARS_FOR_SUGGESTION = 12;

/**
 * The shared ghost-text lifecycle: debounce, min-char guard, resource
 * pressure, aiQueue, and staleness. GhostTextField, Notes zen mode, and
 * Journal Muse all go through here so a suggestion cannot skip the
 * app-wide lock or fire with no pending UI.
 *
 * Rendering is not this hook's job. It returns suggestion + pending and
 * the callbacks; the caller paints them.
 */
export function useGhostText(options?: { enabled?: boolean }) {
  const settingsEnabled = useSettingsStore((s) => s.aiSuggestionsEnabled);
  const enabled = options?.enabled ?? settingsEnabled;
  const ollamaClient = useOllamaClient();
  const resourceWatchdogClient = useResourceWatchdogClient();
  const logResourceEvent = useResourceStore((s) => s.logEvent);
  const focusedTaskTitle = useTasksStore((s) => s.tasks.find((t) => t.id === s.focusedTaskId)?.title ?? null);

  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      requestIdRef.current += 1;
    },
    [],
  );

  const clear = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    requestIdRef.current += 1;
    setSuggestion(null);
    setPending(false);
  }, []);

  const scheduleFor = useCallback(
    (text: string, cursorAtEnd: boolean) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setSuggestion(null);
      setPending(false);
      const myId = ++requestIdRef.current;

      if (!enabled || !cursorAtEnd) return;
      if (text.trim().length < MIN_CHARS_FOR_SUGGESTION) return;

      debounceRef.current = setTimeout(async () => {
        const pressure = await resourceWatchdogClient.checkPressure();
        if (requestIdRef.current !== myId) return;
        if (pressure.underPressure) {
          logResourceEvent(
            "throttled",
            `ghost-text suggestion skipped (cpu ${pressure.cpuPercent.toFixed(0)}%, mem ${pressure.memPercent.toFixed(0)}%)`,
          );
          return;
        }

        setPending(true);
        const result = await runAiJob(
          {
            kind: "ghost_text",
            label: "Suggesting a continuation",
            isStillRelevant: () => requestIdRef.current === myId,
          },
          () => ollamaClient.suggestContinuation(text, focusedTaskTitle ?? undefined),
        ).catch(() => null);

        if (requestIdRef.current !== myId) {
          setPending(false);
          return;
        }
        setPending(false);
        if (!result) return;
        setSuggestion(result);
      }, SUGGESTION_DEBOUNCE_MS);
    },
    [enabled, ollamaClient, resourceWatchdogClient, logResourceEvent, focusedTaskTitle],
  );

  const warmUp = useCallback(() => {
    if (enabled) ollamaClient.warmUpGhostText();
  }, [enabled, ollamaClient]);

  return { suggestion, pending, scheduleFor, clear, warmUp, enabled };
}
