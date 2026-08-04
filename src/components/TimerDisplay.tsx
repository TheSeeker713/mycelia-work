import { useEffect, useState } from "react";
import { computeElapsedSeconds } from "../store/sessionsStore";
import type { SessionEvent } from "../data";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatElapsed(totalSeconds: number): string {
  const hh = Math.floor(totalSeconds / 3600);
  const mm = Math.floor((totalSeconds % 3600) / 60);
  const ss = totalSeconds % 60;
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
}

/** Ticks once a second. The underlying math freezes automatically during an open break — see computeElapsedSeconds. */
export function TimerDisplay({
  clockedInAt,
  events,
}: {
  clockedInAt: string;
  events: Pick<SessionEvent, "type" | "occurred_at">[];
}) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const seconds = computeElapsedSeconds(clockedInAt, events, now);

  return (
    <span className="text-[1.4rem] font-light tabular-nums text-[var(--ink)]">
      {formatElapsed(seconds)}
    </span>
  );
}
