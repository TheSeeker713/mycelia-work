import { useEffect, useState } from "react";
import { useOllamaClient, useRepositories, useTasksStore } from "../store/StoreProvider";
import { aggregateActivityEvents } from "../services/activityAggregation";
import { labelActivitySession } from "../services/activityLabels";
import type { ActivitySession } from "../../data/repositories/activitySessionsRepository";

function todayStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function DayTimeline() {
  const repos = useRepositories();
  const ollama = useOllamaClient();
  const tasks = useTasksStore((s) => s.tasks);
  const loadTasks = useTasksStore((s) => s.loadTasks);
  const [sessions, setSessions] = useState<ActivitySession[]>([]);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function refresh() {
    const day = todayStamp();
    const existing = await repos.activitySessions.listForDay(day);
    if (existing.length > 0) {
      setSessions(existing);
      return;
    }
    const from = `${day}T00:00:00.000Z`;
    const to = `${day}T23:59:59.999Z`;
    const events = await repos.activityEvents.listBetween(from, to);
    const aggregated = aggregateActivityEvents(events);
    for (const a of aggregated) {
      await repos.activitySessions.create({
        started_at: a.started_at,
        ended_at: a.ended_at,
        app: a.app,
        title: a.title,
        idle: a.idle,
      });
    }
    setSessions(await repos.activitySessions.listForDay(day));
  }

  useEffect(() => {
    void loadTasks();
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLabel(session: ActivitySession) {
    setPendingId(session.id);
    const label = await labelActivitySession(ollama, {
      started_at: session.started_at,
      ended_at: session.ended_at,
      app: session.app,
      title: session.title,
      idle: Boolean(session.idle),
      event_ids: [],
    });
    if (label) await repos.activitySessions.setLabel(session.id, label.trim());
    setPendingId(null);
    await refresh();
  }

  async function handleAttach(sessionId: string, taskId: string) {
    await repos.activitySessions.attach(sessionId, { taskId });
    await refresh();
  }

  async function handleDiscard(sessionId: string) {
    await repos.activitySessions.setStatus(sessionId, "discarded");
    await refresh();
  }

  if (sessions.length === 0) {
    return <p className="text-[0.72rem] text-[var(--ink-faint)]">No activity spans for today yet.</p>;
  }

  return (
    <ul className="space-y-2">
      {sessions
        .filter((s) => s.status !== "discarded")
        .map((s) => (
          <li key={s.id} className="rounded-lg border border-dashed border-[var(--line)] p-2">
            <div className="text-[0.75rem] text-[var(--ink)]">
              {s.label || s.title || s.app}
              {s.idle ? " (idle)" : ""}
            </div>
            <div className="text-[0.68rem] text-[var(--ink-faint)]">
              {new Date(s.started_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              {" – "}
              {new Date(s.ended_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              {" · "}
              {s.app}
            </div>
            {pendingId === s.id && (
              <div className="progress-indeterminate mt-1" aria-label="Generating…">
                Generating…
              </div>
            )}
            <div className="mt-1 flex flex-wrap gap-1">
              <button
                type="button"
                className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[0.65rem]"
                onClick={() => void handleLabel(s)}
                disabled={pendingId === s.id}
              >
                Label
              </button>
              <button
                type="button"
                className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[0.65rem]"
                onClick={() => void handleDiscard(s.id)}
              >
                Discard
              </button>
              {tasks.slice(0, 4).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[0.65rem]"
                  onClick={() => void handleAttach(s.id, t.id)}
                >
                  Attach {t.title}
                </button>
              ))}
            </div>
          </li>
        ))}
    </ul>
  );
}
