import { useState } from "react";
import type { ActiveSession } from "../store/sessionsStore";

type Bucket = "worked_little" | "kept_working";

const SHORT_DURATIONS = [
  { label: "~15 min", minutes: 15 },
  { label: "~30 min", minutes: 30 },
  { label: "~1 hour", minutes: 60 },
];

const LONG_DURATIONS = [
  { label: "~2 hours", minutes: 120 },
  { label: "~4 hours", minutes: 240 },
  { label: "~6+ hours", minutes: 360 },
];

/**
 * The forgot-to-clock-out check-in — Tier-0 static fallback per
 * docs/reference/checkin-conversation-guide.md, since the adaptive AI
 * conversation needs Phase 6's OpenClaw wrapper, which doesn't exist
 * yet. Same anchoring and one-question-at-a-time principles either way:
 * direct, literal, bucketed, never "how long were you working."
 */
export function CheckInDialog({
  activeSession,
  onResolve,
}: {
  activeSession: ActiveSession;
  onResolve: (clockedOutAt: string, note: string) => void;
}) {
  const [bucket, setBucket] = useState<Bucket | null>(null);
  const [durationMinutes, setDurationMinutes] = useState<number | null>(null);
  const [note, setNote] = useState("");

  const { task, session } = activeSession;
  const clockedInAt = new Date(session.clocked_in_at);
  const clockedInLabel = clockedInAt.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  function chooseCloseAtStart() {
    onResolve(session.clocked_in_at, note.trim());
  }

  function chooseBucket(b: Bucket) {
    setBucket(b);
  }

  function chooseDuration(minutes: number) {
    setDurationMinutes(minutes);
  }

  function finish() {
    const minutes = durationMinutes ?? 0;
    const resolvedAt = new Date(clockedInAt.getTime() + minutes * 60_000).toISOString();
    onResolve(resolvedAt, note.trim());
  }

  const durations = bucket === "worked_little" ? SHORT_DURATIONS : LONG_DURATIONS;

  return (
    <div
      role="dialog"
      aria-label="Forgot to clock out check-in"
      className="absolute inset-3 flex flex-col justify-center rounded-[14px] border p-4"
      style={{ background: "var(--paper-card)", borderColor: "var(--line)" }}
    >
      <div className="mb-3 text-[0.72rem] tracking-wide text-[var(--ink-faint)] uppercase">
        Still clocked in
      </div>
      <div className="mb-4 text-[0.85rem] leading-relaxed text-[var(--ink)]">
        <strong>{task.title}</strong> has been running since {clockedInLabel}.
      </div>

      {durationMinutes !== null ? (
        <div className="flex flex-col gap-2">
          <div className="text-[0.8rem] text-[var(--ink-soft)]">
            Anything you want to note about this? (optional)
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="resize-none rounded-lg border border-[var(--line)] bg-[var(--paper)] px-2.5 py-2 text-[0.8rem] text-[var(--ink)] outline-none"
          />
          <button
            type="button"
            onClick={finish}
            className="self-start rounded-lg bg-[var(--moss)] px-3 py-1.5 text-[0.78rem] text-white"
          >
            Done
          </button>
        </div>
      ) : bucket !== null ? (
        <div className="flex flex-col gap-2">
          <div className="text-[0.8rem] text-[var(--ink-soft)]">About how long?</div>
          {durations.map((d) => (
            <button
              key={d.label}
              type="button"
              onClick={() => chooseDuration(d.minutes)}
              className="rounded-lg border border-[var(--line)] px-3 py-2 text-left text-[0.8rem] text-[var(--ink)]"
            >
              {d.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={chooseCloseAtStart}
            className="rounded-lg border border-[var(--line)] px-3 py-2 text-left text-[0.8rem] text-[var(--ink)]"
          >
            That clock-in should just be closed out right at the time it
            started.
          </button>
          <button
            type="button"
            onClick={() => chooseBucket("worked_little")}
            className="rounded-lg border border-[var(--line)] px-3 py-2 text-left text-[0.8rem] text-[var(--ink)]"
          >
            I worked a little, then got pulled away and never came back to
            it.
          </button>
          <button
            type="button"
            onClick={() => chooseBucket("kept_working")}
            className="rounded-lg border border-[var(--line)] px-3 py-2 text-left text-[0.8rem] text-[var(--ink)]"
          >
            I kept working for a while after that, then stopped.
          </button>
        </div>
      )}
    </div>
  );
}
