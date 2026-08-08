/**
 * Constants, level curve, and reward catalog for the gamification
 * system — pure functions/data only, no store or repository access
 * here. See docs/reference/gamification-guide.md for the plain-English
 * version and docs/reference/next-build-wave-plan.md's Section 2 for
 * the design history. First-pass numbers per that plan — easy to
 * retune here in one place if they read wrong in practice.
 */

export const XP = {
  CLOCK_IN: 5,
  PER_HOUR: 10,
  FOUR_HOUR_BONUS: 20,
  EIGHT_HOUR_BONUS: 50,
  NOTE: 2,
  PROJECT_CREATED: 5,
  PROJECT_FINISHED: 40,
  TODO_COMPLETED: 5,
  DAILY_USE: 5,
  STREAK_7: 50,
  STREAK_30: 150,
  WELCOME_BACK: 15,
} as const;

export const LEVEL_CAP = 111;

/**
 * Cumulative XP required to reach `level`, per the confirmed anchor
 * (level 2 = 100 XP) and growth curve (`100 * (N-1)^1.6`, rounded) —
 * a tempered exponential rather than literal doubling, since literal
 * exponential growth and a hard level-111 cap don't coexist sanely.
 * The exponent (1.6) is the one number to change if the pacing ever
 * needs retuning; everything else derives from it.
 */
export function cumulativeXpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.round(100 * Math.pow(level - 1, 1.6));
}

/** The highest level whose cumulative-XP threshold `totalXp` has reached, capped at LEVEL_CAP. */
export function levelForXp(totalXp: number): number {
  let level = 1;
  while (level < LEVEL_CAP && cumulativeXpForLevel(level + 1) <= totalXp) {
    level += 1;
  }
  return level;
}

/** XP earned within the current level, and XP needed to clear it — for progress-bar rendering. `needed` is 0 at the cap (nothing further to earn toward a level). */
export function xpProgressWithinLevel(totalXp: number, level: number): { current: number; needed: number } {
  const floor = cumulativeXpForLevel(level);
  if (level >= LEVEL_CAP) return { current: totalXp - floor, needed: 0 };
  return { current: totalXp - floor, needed: cumulativeXpForLevel(level + 1) - floor };
}

/** Confirmed cadence: level 1, 2, 5, then every 5 from 10 through 110, plus the level-111 cap — 25 badges total. */
export const BADGE_LEVELS: readonly number[] = [
  1,
  2,
  5,
  ...Array.from({ length: 21 }, (_, i) => 10 + i * 5),
  111,
];

export function badgeKeyForLevel(level: number): string {
  return `badge_level_${level}`;
}

export interface BadgeDefinition {
  level: number;
  key: string;
  label: string;
}

export const BADGES: readonly BadgeDefinition[] = BADGE_LEVELS.map((level) => ({
  level,
  key: badgeKeyForLevel(level),
  label: level === LEVEL_CAP ? `Level ${level} — Journey Complete` : `Level ${level}`,
}));

/**
 * Level 111 also unlocks "something we have yet to build" — deliberately
 * undesigned per Jeremy's explicit call. This is the extensibility hook:
 * a real, checkable signal for that future feature to gate on, without
 * needing new plumbing when it's designed.
 */
export function hasFeaturesUnlockedAtLevel111(level: number): boolean {
  return level >= LEVEL_CAP;
}

export const WELCOME_BACK_GAP_DAYS = 3;
export const STREAK_MILESTONES = [7, 30] as const;

export function streakAchievementKey(milestone: (typeof STREAK_MILESTONES)[number]): string {
  return `sticker_streak_${milestone}`;
}

export const WELCOME_BACK_STICKER_KEYS: readonly string[] = Array.from(
  { length: 10 },
  (_, i) => `sticker_welcome_back_${i + 1}`,
);

/** A handful of distinct lines, per Jeremy's "warm, specific, not generic" ask — picked at random alongside the sticker, independently of which sticker lands. */
export const WELCOME_BACK_VOICE_LINES: readonly string[] = [
  "Good to see you again.",
  "Welcome back — glad you're here.",
  "You're back. Let's pick up where you left off.",
  "Hey, welcome back.",
  "Missed you — good to have you back.",
];

export function pickRandom<T>(pool: readonly T[], rand: () => number = Math.random): T {
  return pool[Math.floor(rand() * pool.length)];
}

export interface StickerDefinition {
  key: string;
  label: string;
}

export const STICKERS: readonly StickerDefinition[] = [
  { key: "sticker_project_finished", label: "Project Finished" },
  { key: streakAchievementKey(7), label: "7-Day Streak" },
  { key: streakAchievementKey(30), label: "30-Day Streak" },
  ...WELCOME_BACK_STICKER_KEYS.map((key, i) => ({ key, label: `Welcome Back #${i + 1}` })),
];

/** Local calendar date (YYYY-MM-DD), not UTC — "same calendar day" means the day on this machine, matching how the rest of the app already reasons about "today." */
export function todayDateString(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Whole days between two YYYY-MM-DD local date strings (b - a). */
export function daysBetweenDateStrings(a: string, b: string): number {
  const ta = new Date(`${a}T00:00:00`).getTime();
  const tb = new Date(`${b}T00:00:00`).getTime();
  return Math.round((tb - ta) / 86_400_000);
}
