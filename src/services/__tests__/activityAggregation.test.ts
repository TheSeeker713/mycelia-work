// @vitest-environment node
import { describe, expect, it } from "vitest";
import { aggregateActivityEvents } from "../activityAggregation";
import type { ActivityEvent } from "../../data";

function ev(partial: Partial<ActivityEvent> & { id: string; sampled_at: string; app: string }): ActivityEvent {
  return {
    title: null,
    url: null,
    idle: 0,
    ...partial,
  };
}

describe("aggregateActivityEvents", () => {
  it("merges adjacent same-app samples under two minutes apart", () => {
    const sessions = aggregateActivityEvents([
      ev({ id: "a", app: "Code.exe", sampled_at: "2026-08-21T10:00:00.000Z", title: "one" }),
      ev({ id: "b", app: "Code.exe", sampled_at: "2026-08-21T10:00:05.000Z", title: "two" }),
    ]);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].event_ids).toEqual(["a", "b"]);
    expect(sessions[0].title).toBe("two");
  });

  it("splits on a different app or a long gap", () => {
    const sessions = aggregateActivityEvents([
      ev({ id: "a", app: "Code.exe", sampled_at: "2026-08-21T10:00:00.000Z" }),
      ev({ id: "b", app: "firefox.exe", sampled_at: "2026-08-21T10:00:05.000Z" }),
      ev({ id: "c", app: "Code.exe", sampled_at: "2026-08-21T10:10:00.000Z" }),
    ]);
    expect(sessions.map((s) => s.app)).toEqual(["Code.exe", "firefox.exe", "Code.exe"]);
  });
});
