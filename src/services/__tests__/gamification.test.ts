import { describe, expect, it } from "vitest";
import {
  BADGE_LEVELS,
  LEVEL_CAP,
  WELCOME_BACK_STICKER_KEYS,
  badgeKeyForLevel,
  cumulativeXpForLevel,
  daysBetweenDateStrings,
  hasFeaturesUnlockedAtLevel111,
  levelForXp,
  pickRandom,
  todayDateString,
  xpProgressWithinLevel,
} from "../gamification";

describe("cumulativeXpForLevel", () => {
  it("matches the confirmed anchor: level 2 costs exactly 100 XP", () => {
    expect(cumulativeXpForLevel(2)).toBe(100);
  });

  it("level 1 costs nothing — the starting level", () => {
    expect(cumulativeXpForLevel(1)).toBe(0);
  });

  it("is strictly increasing across the whole range up to the cap", () => {
    let previous = cumulativeXpForLevel(1);
    for (let level = 2; level <= LEVEL_CAP; level += 1) {
      const current = cumulativeXpForLevel(level);
      expect(current).toBeGreaterThan(previous);
      previous = current;
    }
  });

  it("level 111 lands in the hundreds-of-thousands range, a genuine long-term milestone", () => {
    const xp = cumulativeXpForLevel(LEVEL_CAP);
    expect(xp).toBeGreaterThan(100_000);
    expect(xp).toBeLessThan(1_000_000);
  });
});

describe("levelForXp", () => {
  it("starts at level 1 with zero XP", () => {
    expect(levelForXp(0)).toBe(1);
  });

  it("reaches level 2 exactly at its threshold, not one XP short", () => {
    expect(levelForXp(99)).toBe(1);
    expect(levelForXp(100)).toBe(2);
  });

  it("never exceeds the level cap no matter how much XP is earned", () => {
    expect(levelForXp(10_000_000)).toBe(LEVEL_CAP);
  });

  it("lands on the exact level for every badge threshold", () => {
    for (const level of BADGE_LEVELS) {
      const threshold = cumulativeXpForLevel(level);
      expect(levelForXp(threshold)).toBe(level);
    }
  });
});

describe("xpProgressWithinLevel", () => {
  it("reports 0/100 right at the start of level 1", () => {
    expect(xpProgressWithinLevel(0, 1)).toEqual({ current: 0, needed: 100 });
  });

  it("reports partial progress mid-level", () => {
    const progress = xpProgressWithinLevel(150, 2);
    expect(progress.current).toBe(50);
    expect(progress.needed).toBe(cumulativeXpForLevel(3) - cumulativeXpForLevel(2));
  });

  it("needed is 0 at the level cap — nothing further to climb toward", () => {
    const capXp = cumulativeXpForLevel(LEVEL_CAP);
    expect(xpProgressWithinLevel(capXp, LEVEL_CAP).needed).toBe(0);
  });
});

describe("BADGE_LEVELS", () => {
  it("has exactly 25 entries, per the confirmed cadence", () => {
    expect(BADGE_LEVELS).toHaveLength(25);
  });

  it("is 1, 2, 5, then every 5 from 10 through 110, plus 111", () => {
    expect(BADGE_LEVELS.slice(0, 3)).toEqual([1, 2, 5]);
    expect(BADGE_LEVELS.slice(3, 24)).toEqual(
      Array.from({ length: 21 }, (_, i) => 10 + i * 5),
    );
    expect(BADGE_LEVELS.at(-1)).toBe(111);
  });

  it("is strictly increasing with no duplicates", () => {
    for (let i = 1; i < BADGE_LEVELS.length; i += 1) {
      expect(BADGE_LEVELS[i]).toBeGreaterThan(BADGE_LEVELS[i - 1]);
    }
  });
});

describe("badgeKeyForLevel", () => {
  it("formats a stable, unique key per level", () => {
    expect(badgeKeyForLevel(5)).toBe("badge_level_5");
    expect(badgeKeyForLevel(111)).toBe("badge_level_111");
  });
});

describe("hasFeaturesUnlockedAtLevel111", () => {
  it("is false below the cap and true at/after it", () => {
    expect(hasFeaturesUnlockedAtLevel111(110)).toBe(false);
    expect(hasFeaturesUnlockedAtLevel111(111)).toBe(true);
  });
});

describe("WELCOME_BACK_STICKER_KEYS", () => {
  it("has exactly 10 distinct keys, per the confirmed pool size", () => {
    expect(WELCOME_BACK_STICKER_KEYS).toHaveLength(10);
    expect(new Set(WELCOME_BACK_STICKER_KEYS).size).toBe(10);
  });
});

describe("pickRandom", () => {
  it("picks the first element when the RNG returns 0", () => {
    expect(pickRandom(["a", "b", "c"], () => 0)).toBe("a");
  });

  it("picks the last element when the RNG returns just under 1", () => {
    expect(pickRandom(["a", "b", "c"], () => 0.999)).toBe("c");
  });
});

describe("todayDateString", () => {
  it("formats a fixed local date as YYYY-MM-DD", () => {
    expect(todayDateString(new Date(2026, 7, 6, 15, 30))).toBe("2026-08-06");
  });

  it("zero-pads single-digit months and days", () => {
    expect(todayDateString(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("daysBetweenDateStrings", () => {
  it("returns 0 for the same date", () => {
    expect(daysBetweenDateStrings("2026-08-06", "2026-08-06")).toBe(0);
  });

  it("returns a positive count for a later date", () => {
    expect(daysBetweenDateStrings("2026-08-01", "2026-08-06")).toBe(5);
  });

  it("returns a negative count when the second date is earlier", () => {
    expect(daysBetweenDateStrings("2026-08-06", "2026-08-01")).toBe(-5);
  });
});
