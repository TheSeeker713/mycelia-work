// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildHeatmap, formatDuration, localDateKey } from "../heatmap";
import type { TaskSession } from "../../data";

function session(clockedIn: string, clockedOut: string | null): TaskSession {
  return {
    id: Math.random().toString(36),
    task_id: "t1",
    clocked_in_at: clockedIn,
    clocked_out_at: clockedOut,
    status: clockedOut ? "stopped" : "running",
    is_estimated: false,
  };
}

/** Local wall-clock, since the whole point is that days are local. */
function at(dayOffset: number, hour: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dayOffset);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

describe("buildHeatmap", () => {
  it("returns one entry per day including the empty ones", () => {
    const days = buildHeatmap([], 30);
    expect(days).toHaveLength(30);
    expect(days.every((d) => d.seconds === 0 && d.level === 0)).toBe(true);
  });

  it("ends on today, so the most recent day is last", () => {
    const days = buildHeatmap([], 7);
    expect(days[days.length - 1].date).toBe(localDateKey(new Date()));
  });

  it("sums multiple sessions on the same day", () => {
    const days = buildHeatmap([session(at(1, 9), at(1, 11)), session(at(1, 13), at(1, 14))], 7);
    const yesterday = days.find((d) => d.date === localDateKey(new Date(Date.now() - 86400000)));
    expect(yesterday?.seconds).toBe(3 * 3600);
  });

  it("ignores a session that never clocked out", () => {
    const days = buildHeatmap([session(at(1, 9), null)], 7);
    expect(days.every((d) => d.seconds === 0)).toBe(true);
  });

  it("bands a heavy day higher than a light one", () => {
    const light = buildHeatmap([session(at(1, 9), at(1, 10))], 3);
    const heavy = buildHeatmap([session(at(1, 9), at(1, 18))], 3);
    const lightDay = light.find((d) => d.seconds > 0);
    const heavyDay = heavy.find((d) => d.seconds > 0);
    expect(heavyDay!.level).toBeGreaterThan(lightDay!.level);
    expect(heavyDay!.level).toBe(4);
  });

  it("uses local dates, so late-evening work doesn't land on tomorrow", () => {
    const d = new Date();
    d.setHours(23, 30, 0, 0);
    // toISOString would roll this into the next day anywhere west of UTC.
    expect(localDateKey(d)).toBe(localDateKey(new Date()));
  });
});

describe("formatDuration", () => {
  it("says so plainly when a day is empty", () => {
    expect(formatDuration(0)).toBe("nothing logged");
  });

  it("drops the hours part below an hour", () => {
    expect(formatDuration(24 * 60)).toBe("24m");
  });

  it("drops the minutes part on a whole hour", () => {
    expect(formatDuration(2 * 3600)).toBe("2h");
  });

  it("shows both when there are both", () => {
    expect(formatDuration(3 * 3600 + 20 * 60)).toBe("3h 20m");
  });
});
