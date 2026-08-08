// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initDatabase, type Repositories } from "../../data";
import { createTestExecutor } from "../../data/__tests__/testExecutor";
import { createGamificationStore, type GamificationStore } from "../gamificationStore";
import { XP, cumulativeXpForLevel } from "../../services/gamification";

let repos: Repositories;
let useGamification: GamificationStore;

function setNow(iso: string) {
  vi.setSystemTime(new Date(iso));
}

beforeEach(async () => {
  vi.useFakeTimers();
  setNow("2026-08-06T10:00:00");
  repos = await initDatabase(createTestExecutor());
  useGamification = createGamificationStore(repos);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("gamificationStore", () => {
  it("load() populates stats at the defaults before anything happens", async () => {
    await useGamification.getState().load();
    const { stats } = useGamification.getState();
    expect(stats).toMatchObject({ total_xp: 0, level: 1, streak_days: 0 });
  });

  it("recordClockIn awards both the daily-use credit and the clock-in credit on a fresh day", async () => {
    await useGamification.getState().load();
    await useGamification.getState().recordClockIn();

    const { stats } = useGamification.getState();
    expect(stats!.total_xp).toBe(XP.DAILY_USE + XP.CLOCK_IN);
    expect(stats!.streak_days).toBe(1);
    expect(stats!.last_active_date).toBe("2026-08-06");
  });

  it("a second clock-in the same day doesn't double-credit daily use", async () => {
    await useGamification.getState().load();
    await useGamification.getState().recordClockIn();
    await useGamification.getState().recordClockIn();

    const { stats } = useGamification.getState();
    expect(stats!.total_xp).toBe(XP.DAILY_USE + XP.CLOCK_IN * 2);
    expect(stats!.streak_days).toBe(1);
  });

  it("recordClockOut awards per-whole-hour XP from elapsed active seconds", async () => {
    await useGamification.getState().load();
    await useGamification.getState().recordClockOut(2.5 * 3600); // 2h30m -> 2 whole hours

    const { stats } = useGamification.getState();
    expect(stats!.total_xp).toBe(XP.DAILY_USE + XP.PER_HOUR * 2);
  });

  it("crosses the 4-hour bonus by summing multiple sessions the same day, not just one", async () => {
    await useGamification.getState().load();
    await useGamification.getState().recordClockOut(2.5 * 3600);
    await useGamification.getState().recordClockOut(2 * 3600); // cumulative 4.5h -> crosses 4h

    const { stats, recentXpEvents } = useGamification.getState();
    expect(stats!.daily_4hr_awarded).toBe(true);
    expect(stats!.daily_8hr_awarded).toBe(false);
    expect(recentXpEvents.filter((e) => e.source === "daily_4hr")).toHaveLength(1);
  });

  it("crosses the 8-hour bonus without double-awarding the 4-hour bonus", async () => {
    await useGamification.getState().load();
    await useGamification.getState().recordClockOut(4.5 * 3600);
    await useGamification.getState().recordClockOut(4 * 3600); // cumulative 8.5h -> crosses 8h too

    const { stats, recentXpEvents } = useGamification.getState();
    expect(stats!.daily_8hr_awarded).toBe(true);
    expect(recentXpEvents.filter((e) => e.source === "daily_4hr")).toHaveLength(1);
    expect(recentXpEvents.filter((e) => e.source === "daily_8hr")).toHaveLength(1);
  });

  it("the 4hr/8hr cumulative total resets on a new calendar day", async () => {
    await useGamification.getState().load();
    await useGamification.getState().recordClockOut(3 * 3600);

    setNow("2026-08-07T09:00:00");
    await useGamification.getState().recordClockOut(3 * 3600);

    const { stats } = useGamification.getState();
    expect(stats!.daily_4hr_awarded).toBe(false);
    expect(stats!.daily_seconds).toBe(3 * 3600);
  });

  it("recordProjectFinished awards XP and queues a sticker toast", async () => {
    await useGamification.getState().load();
    await useGamification.getState().recordProjectFinished();

    const { stats, pendingToasts } = useGamification.getState();
    expect(stats!.total_xp).toBe(XP.DAILY_USE + XP.PROJECT_FINISHED);
    const stickerToast = pendingToasts.find((t) => t.key === "sticker_project_finished");
    expect(stickerToast).toBeDefined();
    expect(stickerToast!.kind).toBe("sticker");
  });

  it("recordProjectFinished queues a fresh sticker toast every time — repeatable, not a one-time unlock", async () => {
    await useGamification.getState().load();
    await useGamification.getState().recordProjectFinished();
    await useGamification.getState().recordProjectFinished();

    const stickerToasts = useGamification
      .getState()
      .pendingToasts.filter((t) => t.key === "sticker_project_finished");
    expect(stickerToasts).toHaveLength(2);
  });

  it("crossing a badge-level threshold unlocks the badge and queues a toast", async () => {
    await useGamification.getState().load();
    // Level 2's threshold is exactly 100 XP — a bit more than one project-finished award clears it.
    await useGamification.getState().recordProjectFinished();
    await useGamification.getState().recordProjectFinished();
    await useGamification.getState().recordProjectFinished();

    const { stats, unlockedAchievements, pendingToasts } = useGamification.getState();
    expect(stats!.total_xp).toBeGreaterThanOrEqual(cumulativeXpForLevel(2));
    expect(stats!.level).toBeGreaterThanOrEqual(2);
    expect(unlockedAchievements.some((a) => a.achievement_key === "badge_level_2")).toBe(true);
    expect(pendingToasts.some((t) => t.kind === "badge" && t.key === "badge_level_2")).toBe(true);
  });

  it("dismissToast removes exactly the given toast", async () => {
    await useGamification.getState().load();
    await useGamification.getState().recordProjectFinished();
    const [toast] = useGamification.getState().pendingToasts;

    useGamification.getState().dismissToast(toast.id);

    expect(useGamification.getState().pendingToasts.find((t) => t.id === toast.id)).toBeUndefined();
  });

  it("streak_days increments once per new active day and never resets across a gap", async () => {
    await useGamification.getState().load();
    await useGamification.getState().recordClockIn();
    expect(useGamification.getState().stats!.streak_days).toBe(1);

    setNow("2026-08-15T09:00:00"); // a 9-day gap
    await useGamification.getState().recordClockIn();

    expect(useGamification.getState().stats!.streak_days).toBe(2);
  });

  it("a gap of 3+ days triggers the welcome-back reward on the next real action", async () => {
    await useGamification.getState().load();
    await useGamification.getState().recordClockIn();

    setNow("2026-08-10T09:00:00"); // 4-day gap, past the 3-day threshold
    await useGamification.getState().recordClockIn();

    const { pendingToasts } = useGamification.getState();
    const welcomeBack = pendingToasts.find((t) => t.kind === "welcome_back");
    expect(welcomeBack).toBeDefined();
    expect(welcomeBack!.voiceLine).toBeTruthy();
    expect(welcomeBack!.key).toMatch(/^sticker_welcome_back_\d+$/);
  });

  it("a gap under the welcome-back threshold does not trigger the reward", async () => {
    await useGamification.getState().load();
    await useGamification.getState().recordClockIn();

    setNow("2026-08-07T09:00:00"); // 1-day gap
    await useGamification.getState().recordClockIn();

    expect(useGamification.getState().pendingToasts.some((t) => t.kind === "welcome_back")).toBe(false);
  });

  it("reaching a 7-day streak unlocks the streak-7 sticker exactly once", async () => {
    await useGamification.getState().load();
    for (let day = 6; day <= 12; day += 1) {
      setNow(`2026-08-${String(day).padStart(2, "0")}T09:00:00`);
      await useGamification.getState().recordClockIn();
    }

    const { stats, unlockedAchievements } = useGamification.getState();
    expect(stats!.streak_days).toBe(7);
    expect(unlockedAchievements.filter((a) => a.achievement_key === "sticker_streak_7")).toHaveLength(1);
  });
});
