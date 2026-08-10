import { useMemo } from "react";
import { useStore } from "zustand";
import { aiQueueStore, cancelAiJob, visibleQueued } from "../services/aiQueue";

/**
 * Shows what the AI is doing and what's stacked up behind it, whenever
 * anything is actually waiting. Only one AI call runs at a time across
 * the whole app, so without this a queued request just looks like the
 * app ignoring you.
 *
 * Every waiting entry gets a real choice, not a spinner: leave it
 * queued, or cancel it outright. Cancelling something that hasn't
 * started is instant and costs nothing, since no work has begun.
 *
 * Nothing renders while a single job runs on its own with nothing
 * behind it — that case already has its own in-place indicator (the
 * Library's progress bar, the capture drawer's thinking state).
 */
export function AiQueueTicker() {
  const running = useStore(aiQueueStore, (s) => s.running);
  // Select the stable array reference and filter here — a selector that
  // builds a new array on every call gives useSyncExternalStore a fresh
  // snapshot each render, which React treats as an infinite update loop.
  const allQueued = useStore(aiQueueStore, (s) => s.queued);
  const queued = useMemo(() => visibleQueued({ running, queued: allQueued }), [running, allQueued]);

  if (queued.length === 0) return null;

  return (
    <div
      role="status"
      aria-label="AI queue"
      className="absolute right-3 bottom-3 left-3 z-30 rounded-[12px] border p-2.5"
      style={{ background: "var(--paper-card)", borderColor: "var(--line)" }}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <div className="progress-indeterminate flex-1" aria-hidden="true" />
        <span className="text-[0.65rem] tracking-wide text-[var(--ink-faint)] uppercase">
          {queued.length} waiting
        </span>
      </div>

      {running && (
        <p className="mb-1.5 text-[0.75rem] text-[var(--ink-soft)]">
          {running.label} first. One AI task runs at a time, so this could take a while.
        </p>
      )}

      <ul className="flex flex-col gap-1">
        {queued.map((job) => (
          <li key={job.id} className="flex items-center justify-between gap-2">
            <span className="truncate text-[0.75rem] text-[var(--ink)]">{job.label}</span>
            <button
              type="button"
              onClick={() => cancelAiJob(job.id)}
              className="flex-shrink-0 rounded-full border px-2 py-0.5 text-[0.68rem]"
              style={{ borderColor: "var(--line)", color: "var(--ink-soft)" }}
            >
              Cancel
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
