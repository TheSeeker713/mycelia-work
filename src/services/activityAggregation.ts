import type { ActivityEvent } from "../data";

export interface AggregatedSession {
  started_at: string;
  ended_at: string;
  app: string;
  title: string | null;
  idle: boolean;
  event_ids: string[];
}

const GAP_MS = 2 * 60 * 1000;

function eventIdle(event: ActivityEvent): boolean {
  return Boolean(event.idle);
}

/**
 * Merge adjacent similar activity_events into candidate sessions.
 * Same app, optional same idle flag, gap under 2 minutes.
 */
export function aggregateActivityEvents(events: ActivityEvent[]): AggregatedSession[] {
  const ordered = [...events].sort(
    (a, b) => new Date(a.sampled_at).getTime() - new Date(b.sampled_at).getTime(),
  );
  const sessions: AggregatedSession[] = [];
  for (const event of ordered) {
    const last = sessions[sessions.length - 1];
    const t = new Date(event.sampled_at).getTime();
    if (
      last &&
      last.app === event.app &&
      last.idle === eventIdle(event) &&
      t - new Date(last.ended_at).getTime() <= GAP_MS
    ) {
      last.ended_at = event.sampled_at;
      last.title = event.title ?? last.title;
      last.event_ids.push(event.id);
    } else {
      sessions.push({
        started_at: event.sampled_at,
        ended_at: event.sampled_at,
        app: event.app,
        title: event.title,
        idle: eventIdle(event),
        event_ids: [event.id],
      });
    }
  }
  return sessions;
}
