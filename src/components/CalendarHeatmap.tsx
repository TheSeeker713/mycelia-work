import { useEffect, useState } from "react";
import { useRepositories } from "../store/StoreProvider";
import { buildHeatmap, formatDuration, type HeatmapDay } from "../services/heatmap";

const DAYS = 119; // 17 weeks, so the grid comes out as whole columns

const LEVEL_COLOR: Record<HeatmapDay["level"], string> = {
  0: "var(--line-soft)",
  1: "var(--moss-pale)",
  2: "var(--moss)",
  3: "var(--moss-deep)",
  4: "var(--amber)",
};

/**
 * Clocked time per day for the last few months. Empty days are drawn,
 * not skipped — the gaps are the information, and the no-punishment
 * rule means a quiet week should look quiet rather than disappear.
 */
export function CalendarHeatmap() {
  const repos = useRepositories();
  const [days, setDays] = useState<HeatmapDay[] | null>(null);

  useEffect(() => {
    const since = new Date();
    since.setDate(since.getDate() - DAYS);
    void repos.taskSessions
      .listClosedSince(since.toISOString())
      .then((sessions) => setDays(buildHeatmap(sessions, DAYS)))
      .catch(() => setDays([]));
  }, [repos]);

  if (!days) return null;

  const total = days.reduce((sum, d) => sum + d.seconds, 0);
  const activeDays = days.filter((d) => d.seconds > 0).length;

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[0.7rem] tracking-wide text-[var(--ink-faint)] uppercase">
          Last {Math.round(DAYS / 7)} weeks
        </span>
        <span className="text-[0.7rem] text-[var(--ink-faint)]">
          {formatDuration(total)} over {activeDays} {activeDays === 1 ? "day" : "days"}
        </span>
      </div>
      <div
        className="grid grid-flow-col gap-[3px]"
        style={{ gridTemplateRows: "repeat(7, minmax(0, 1fr))" }}
        role="img"
        aria-label={`Clocked time heatmap, ${formatDuration(total)} across ${activeDays} days`}
      >
        {days.map((day) => (
          <div
            key={day.date}
            title={`${day.date}: ${formatDuration(day.seconds)}`}
            className="h-2.5 w-2.5 rounded-[2px]"
            style={{ background: LEVEL_COLOR[day.level] }}
          />
        ))}
      </div>
    </div>
  );
}
