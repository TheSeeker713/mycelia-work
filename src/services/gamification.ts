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
  STREAK_100: 300,
  STREAK_365: 1000,
  WELCOME_BACK: 15,
  FIRST_TIME: 10,
  FOUR_HOUR_DAY_FIRST: 25,
  COUNT_MILESTONE_SMALL: 15,
  COUNT_MILESTONE_MEDIUM: 30,
  COUNT_MILESTONE_LARGE: 60,
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
/** Cumulative distinct-active-days milestones — 7/30 were the original confirmed pair; 100/365 added per the curated art set (Jeremy: "all assets need to be applied"). */
export const STREAK_MILESTONES = [7, 30, 100, 365] as const;

export function streakAchievementKey(milestone: (typeof STREAK_MILESTONES)[number]): string {
  return `sticker_streak_${milestone}`;
}

export function streakXpFor(milestone: (typeof STREAK_MILESTONES)[number]): number {
  switch (milestone) {
    case 7:
      return XP.STREAK_7;
    case 30:
      return XP.STREAK_30;
    case 100:
      return XP.STREAK_100;
    case 365:
      return XP.STREAK_365;
  }
}

export const WELCOME_BACK_STICKER_KEY = "sticker_welcome_back";

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

/** One-time "first real action" achievement keys — unlocked via the same idempotent unlockAchievement() path as badges, just triggered from an XP source instead of a level crossing. */
export const FIRST_TIME_KEYS = {
  clockIn: "sticker_first_clock_in",
  note: "sticker_first_note",
  todoCompleted: "sticker_first_todo_completed",
  projectCreated: "sticker_first_project_created",
} as const;

export const FOUR_HOUR_DAY_FIRST_KEY = "sticker_four_hour_day_first";

/** Reserved for the not-yet-built personal journal feature (Section 2.2 of the plan doc) — cataloged now so the curated art has a home, but nothing in this app awards it yet. */
export const FIRST_JOURNAL_ENTRY_KEY = "sticker_first_journal_entry";

/**
 * Cumulative-count milestones — "10th of this action, ever." Counted
 * directly off `xp_events` (one row per qualifying action already
 * exists there), so no extra bookkeeping columns are needed. XP scales
 * with the threshold: the higher counts feel like a bigger deal.
 */
export const COUNT_MILESTONES: readonly {
  source: "note" | "todo_completed" | "clock_in";
  thresholds: readonly number[];
  keyPrefix: string;
  xpFor: (threshold: number) => number;
}[] = [
  {
    source: "note",
    thresholds: [10, 50],
    keyPrefix: "sticker_notes_",
    xpFor: (t) => (t <= 10 ? XP.COUNT_MILESTONE_SMALL : XP.COUNT_MILESTONE_MEDIUM),
  },
  {
    source: "todo_completed",
    thresholds: [10, 50, 100],
    keyPrefix: "sticker_todos_",
    xpFor: (t) => (t <= 10 ? XP.COUNT_MILESTONE_SMALL : t <= 50 ? XP.COUNT_MILESTONE_MEDIUM : XP.COUNT_MILESTONE_LARGE),
  },
  {
    // "Sessions" = clock-ins, the simplest unambiguous count of "times you've started work."
    source: "clock_in",
    thresholds: [10, 50, 100],
    keyPrefix: "sticker_sessions_",
    xpFor: (t) => (t <= 10 ? XP.COUNT_MILESTONE_SMALL : t <= 50 ? XP.COUNT_MILESTONE_MEDIUM : XP.COUNT_MILESTONE_LARGE),
  },
];

export const STICKERS: readonly StickerDefinition[] = [
  { key: "sticker_project_finished", label: "Project Finished" },
  { key: streakAchievementKey(7), label: "7-Day Streak" },
  { key: streakAchievementKey(30), label: "30-Day Streak" },
  { key: streakAchievementKey(100), label: "100-Day Streak" },
  { key: streakAchievementKey(365), label: "365-Day Streak" },
  { key: WELCOME_BACK_STICKER_KEY, label: "Welcome Back" },
  { key: FIRST_TIME_KEYS.clockIn, label: "First Clock-In" },
  { key: FIRST_TIME_KEYS.note, label: "First Note" },
  { key: FIRST_TIME_KEYS.todoCompleted, label: "First Todo Completed" },
  { key: FIRST_TIME_KEYS.projectCreated, label: "First Project" },
  { key: FOUR_HOUR_DAY_FIRST_KEY, label: "First 4-Hour Day" },
  { key: "sticker_notes_10", label: "10 Notes Written" },
  { key: "sticker_notes_50", label: "50 Notes Written" },
  { key: "sticker_todos_10", label: "10 Todos Completed" },
  { key: "sticker_todos_50", label: "50 Todos Completed" },
  { key: "sticker_todos_100", label: "100 Todos Completed" },
  { key: "sticker_sessions_10", label: "10 Sessions" },
  { key: "sticker_sessions_50", label: "50 Sessions" },
  { key: "sticker_sessions_100", label: "100 Sessions" },
  { key: FIRST_JOURNAL_ENTRY_KEY, label: "First Journal Entry" },
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
