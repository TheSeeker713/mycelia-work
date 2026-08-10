import type { TaskSession } from "../data";

export interface HeatmapDay {
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  seconds: number;
  /** 0 (nothing) through 4 (a heavy day), for colour banding. */
  level: 0 | 1 | 2 | 3 | 4;
}

/** Bands in hours. Four hours is already a real day's focused work, so the top band starts there rather than at eight. */
const LEVEL_THRESHOLDS_HOURS = [0.5, 2, 4] as const;

/** Local date string. Deliberately not toISOString, which would bucket late-evening work into tomorrow anywhere west of UTC. */
export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function levelFor(seconds: number): HeatmapDay["level"] {
  if (seconds <= 0) return 0;
  const hours = seconds / 3600;
  if (hours < LEVEL_THRESHOLDS_HOURS[0]) return 1;
  if (hours < LEVEL_THRESHOLDS_HOURS[1]) return 2;
  if (hours < LEVEL_THRESHOLDS_HOURS[2]) return 3;
  return 4;
}

/**
 * Rolls closed sessions up into one entry per calendar day, including
 * the empty days — a heatmap with gaps punched out where nothing
 * happened isn't a heatmap, it's a scatter plot.
 *
 * A session is credited entirely to the day it started. Splitting a
 * session across midnight would be more precise and would also mean a
 * long evening's work showing up as two half-hearted days, which
 * misrepresents it worse than the rounding does.
 */
export function buildHeatmap(sessions: TaskSession[], days: number, today = new Date()): HeatmapDay[] {
  const totals = new Map<string, number>();

  for (const session of sessions) {
    if (!session.clocked_out_at) continue;
    const start = new Date(session.clocked_in_at);
    const end = new Date(session.clocked_out_at);
    const seconds = Math.max(0, (end.getTime() - start.getTime()) / 1000);
    const key = localDateKey(start);
    totals.set(key, (totals.get(key) ?? 0) + seconds);
  }

  const result: HeatmapDay[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = localDateKey(d);
    const seconds = totals.get(key) ?? 0;
    result.push({ date: key, seconds, level: levelFor(seconds) });
  }
  return result;
}

/** "3h 20m", or "24m", or nothing at all for an empty day. */
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return "nothing logged";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}
