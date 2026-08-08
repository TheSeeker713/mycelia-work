// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { applyMigrations } from "../schema";
import { createGamificationRepository } from "../repositories/gamificationRepository";
import type { SqlExecutor } from "../sqlExecutor";
import { createTestExecutor } from "./testExecutor";

let executor: SqlExecutor;
let gamification: ReturnType<typeof createGamificationRepository>;

beforeEach(async () => {
  executor = createTestExecutor();
  await applyMigrations(executor);
  gamification = createGamificationRepository(executor);
});

describe("gamificationRepository", () => {
  it("getStats creates the singleton row with defaults on first read", async () => {
    const stats = await gamification.getStats();
    expect(stats).toMatchObject({
      id: "main",
      total_xp: 0,
      level: 1,
      streak_days: 0,
      last_active_date: null,
      daily_hours_date: null,
      daily_seconds: 0,
      daily_4hr_awarded: false,
      daily_8hr_awarded: false,
    });
  });

  it("getStats returns the same row on repeated calls, not a fresh default each time", async () => {
    await gamification.updateStats({ total_xp: 250, level: 3 });
    const stats = await gamification.getStats();
    expect(stats.total_xp).toBe(250);
    expect(stats.level).toBe(3);
  });

  it("updateStats patches only the given fields", async () => {
    await gamification.getStats();
    await gamification.updateStats({ streak_days: 4 });
    await gamification.updateStats({ total_xp: 40 });
    const stats = await gamification.getStats();
    expect(stats.streak_days).toBe(4);
    expect(stats.total_xp).toBe(40);
  });

  it("updateStats round-trips boolean flags correctly", async () => {
    await gamification.getStats();
    await gamification.updateStats({ daily_4hr_awarded: true, daily_8hr_awarded: true });
    const stats = await gamification.getStats();
    expect(stats.daily_4hr_awarded).toBe(true);
    expect(stats.daily_8hr_awarded).toBe(true);
  });

  it("logXpEvent records the source, amount, and optional sticker key", async () => {
    const event = await gamification.logXpEvent("note", 2);
    expect(event.source).toBe("note");
    expect(event.amount).toBe(2);
    expect(event.sticker_key).toBeNull();

    const withSticker = await gamification.logXpEvent("project_finished", 40, "sticker_project_finished");
    expect(withSticker.sticker_key).toBe("sticker_project_finished");
  });

  it("listXpEvents returns newest first", async () => {
    await gamification.logXpEvent("clock_in", 5);
    await gamification.logXpEvent("note", 2);

    const all = await gamification.listXpEvents();
    expect(all[0].source).toBe("note");
    expect(all[1].source).toBe("clock_in");
  });

  it("unlockAchievement is idempotent for the same key", async () => {
    const first = await gamification.unlockAchievement("badge_level_5", "badge");
    const second = await gamification.unlockAchievement("badge_level_5", "badge");

    expect(second.id).toBe(first.id);
    const all = await gamification.listUnlockedAchievements();
    expect(all).toHaveLength(1);
  });

  it("isAchievementUnlocked reflects unlock state", async () => {
    expect(await gamification.isAchievementUnlocked("badge_level_1")).toBe(false);
    await gamification.unlockAchievement("badge_level_1", "badge");
    expect(await gamification.isAchievementUnlocked("badge_level_1")).toBe(true);
  });

  it("listUnlockedAchievements returns oldest first, with kind preserved", async () => {
    await gamification.unlockAchievement("badge_level_1", "badge");
    await gamification.unlockAchievement("sticker_streak_7", "sticker");

    const all = await gamification.listUnlockedAchievements();
    expect(all.map((a) => a.achievement_key)).toEqual(["badge_level_1", "sticker_streak_7"]);
    expect(all[1].kind).toBe("sticker");
  });
});
