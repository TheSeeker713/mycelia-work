import type { ActiveSession } from "../store/sessionsStore";
import { SessionCard } from "./SessionCard";

/** Up to MAX_CONCURRENT_SESSIONS cards, side by side — the "duplicated pocket-book" layout from the approved design. */
export function ActiveSessionsRow({
  activeSessions,
  onStartBreak,
  onResume,
  onClockOut,
}: {
  activeSessions: ActiveSession[];
  onStartBreak: (sessionId: string) => void;
  onResume: (sessionId: string) => void;
  onClockOut: (sessionId: string) => void;
}) {
  if (activeSessions.length === 0) return null;

  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {activeSessions.map((activeSession) => (
        <SessionCard
          key={activeSession.session.id}
          activeSession={activeSession}
          onStartBreak={onStartBreak}
          onResume={onResume}
          onClockOut={onClockOut}
        />
      ))}
    </div>
  );
}
