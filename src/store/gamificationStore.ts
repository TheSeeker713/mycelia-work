import { create } from "zustand";
import type { GamificationStats, Repositories, UnlockedAchievement, XpEvent, XpSource } from "../data";
import {
  BADGES,
  COUNT_MILESTONES,
  FIRST_TIME_KEYS,
  FOUR_HOUR_DAY_FIRST_KEY,
  STICKERS,
  STREAK_MILESTONES,
  WELCOME_BACK_GAP_DAYS,
  WELCOME_BACK_STICKER_KEY,
  WELCOME_BACK_VOICE_LINES,
  XP,
  badgeKeyForLevel,
  daysBetweenDateStrings,
  levelForXp,
  pickRandom,
  streakAchievementKey,
  streakXpFor,
  todayDateString,
} from "../services/gamification";

export interface AchievementToastItem {
  id: string;
  kind: "badge" | "sticker" | "welcome_back";
  key: string;
  label: string;
  /** Only set on the welcome-back toast — Dashboard speaks this via self-voicing when present. */
  voiceLine?: string;
}

export interface GamificationState {
  stats: GamificationStats | null;
  unlockedAchievements: UnlockedAchievement[];
  recentXpEvents: XpEvent[];
  loaded: boolean;
  pendingToasts: AchievementToastItem[];
  load: () => Promise<void>;
  recordClockIn: () => Promise<void>;
  recordClockOut: (elapsedSeconds: number) => Promise<void>;
  recordNote: () => Promise<void>;
  recordProjectCreated: () => Promise<void>;
  recordProjectFinished: () => Promise<void>;
  recordTodoCompleted: () => Promise<void>;
  dismissToast: (id: string) => void;
}

function toastId(): string {
  return crypto.randomUUID();
}

export function createGamificationStore(repos: Repositories) {
  return create<GamificationState>((set, get) => {
    /** Ensures `stats` is populated before any award logic reads it — safe to call repeatedly, only fetches once. */
    async function ensureLoaded(): Promise<GamificationStats> {
      const existing = get().stats;
      if (existing) return existing;
      const stats = await repos.gamification.getStats();
      set({ stats });
      return stats;
    }

    /** Logs the XP event, updates total_xp/level, and queues any badge/sticker toasts the award triggers. */
    async function awardXp(source: XpSource, amount: number, stickerKey: string | null = null) {
      const before = await ensureLoaded();
      await repos.gamification.logXpEvent(source, amount, stickerKey);

      const newTotal = before.total_xp + amount;
      const newLevel = levelForXp(newTotal);
      await repos.gamification.updateStats({ total_xp: newTotal, level: newLevel });

      const toasts: AchievementToastItem[] = [];
      const newlyUnlocked: UnlockedAchievement[] = [];

      if (newLevel > before.level) {
        for (const badge of BADGES) {
          if (badge.level > before.level && badge.level <= newLevel) {
            const unlocked = await repos.gamification.unlockAchievement(badge.key, "badge");
            newlyUnlocked.push(unlocked);
            toasts.push({ id: toastId(), kind: "badge", key: badge.key, label: badge.label });
          }
        }
      }

      if (stickerKey) {
        const definition = STICKERS.find((s) => s.key === stickerKey);
        toasts.push({
          id: toastId(),
          kind: source === "welcome_back" ? "welcome_back" : "sticker",
          key: stickerKey,
          label: definition?.label ?? stickerKey,
          voiceLine: source === "welcome_back" ? pickRandom(WELCOME_BACK_VOICE_LINES) : undefined,
        });
      }

      const latest = get().stats ?? before;
      set({
        stats: { ...latest, total_xp: newTotal, level: newLevel },
        unlockedAchievements: [...get().unlockedAchievements, ...newlyUnlocked],
        recentXpEvents: [
          { id: toastId(), occurred_at: new Date().toISOString(), source, amount, sticker_key: stickerKey },
          ...get().recentXpEvents,
        ],
        pendingToasts: [...get().pendingToasts, ...toasts],
      });
    }

    /**
     * One-time achievement unlock (a "first X" sticker, a count
     * milestone, the first-4-hour-day sticker) — idempotent via
     * `unlockAchievement`'s own INSERT-OR-IGNORE handling, but checked
     * here first so a repeat call doesn't award XP or queue a toast a
     * second time. Distinct from `awardXp`'s badge-unlock path, which
     * only ever fires from a level crossing.
     */
    async function unlockStickerOnce(key: string, source: XpSource, amount: number) {
      const already = await repos.gamification.isAchievementUnlocked(key);
      if (already) return;
      const unlocked = await repos.gamification.unlockAchievement(key, "sticker");
      set({ unlockedAchievements: [...get().unlockedAchievements, unlocked] });
      await awardXp(source, amount, key);
    }

    /** Notes/todos/sessions count milestones — counted directly off xp_events, so no separate running-total bookkeeping is needed. */
    async function checkCountMilestones(source: "note" | "todo_completed" | "clock_in") {
      const config = COUNT_MILESTONES.find((c) => c.source === source);
      if (!config) return;
      const count = await repos.gamification.countXpEventsBySource(source);
      for (const threshold of config.thresholds) {
        if (count === threshold) {
          await unlockStickerOnce(`${config.keyPrefix}${threshold}`, "count_milestone", config.xpFor(threshold));
        }
      }
    }

    /**
     * Called from every record* method — credits "daily use" XP once per
     * calendar day, advances the (never-resetting) streak counter, checks
     * streak-milestone stickers, and detects a welcome-back gap. Claims
     * today's date in local state *before* any `await`, so two record*
     * calls firing in the same tick (e.g. rapid-fire todo completions)
     * can't both slip through and double-credit the day.
     */
    async function recordDailyActivity() {
      const stats = await ensureLoaded();
      const today = todayDateString();
      if (stats.last_active_date === today) return;

      const previousActiveDate = stats.last_active_date;
      set({ stats: { ...get().stats!, last_active_date: today } });

      if (previousActiveDate && daysBetweenDateStrings(previousActiveDate, today) >= WELCOME_BACK_GAP_DAYS) {
        await awardXp("welcome_back", XP.WELCOME_BACK, WELCOME_BACK_STICKER_KEY);
      }

      await awardXp("daily_use", XP.DAILY_USE);

      const newStreak = get().stats!.streak_days + 1;
      set({ stats: { ...get().stats!, streak_days: newStreak } });

      for (const milestone of STREAK_MILESTONES) {
        if (newStreak === milestone) {
          const key = streakAchievementKey(milestone);
          const unlocked = await repos.gamification.unlockAchievement(key, "sticker");
          set({ unlockedAchievements: [...get().unlockedAchievements, unlocked] });
          const source: XpSource = `streak_${milestone}` as XpSource;
          await awardXp(source, streakXpFor(milestone), key);
        }
      }

      await repos.gamification.updateStats({
        last_active_date: today,
        streak_days: get().stats!.streak_days,
      });
    }

    return {
      stats: null,
      unlockedAchievements: [],
      recentXpEvents: [],
      loaded: false,
      pendingToasts: [],

      async load() {
        const [stats, unlockedAchievements, recentXpEvents] = await Promise.all([
          repos.gamification.getStats(),
          repos.gamification.listUnlockedAchievements(),
          repos.gamification.listXpEvents(),
        ]);
        set({ stats, unlockedAchievements, recentXpEvents, loaded: true });

        // The level-1 badge can never be "crossed into" by awardXp's
        // level-crossing loop — everyone starts at level 1, so
        // before.level < 1 never happens. Unlocked here instead, once,
        // idempotently — everyone earns it just by having a profile.
        if (!unlockedAchievements.some((a) => a.achievement_key === badgeKeyForLevel(1))) {
          const unlocked = await repos.gamification.unlockAchievement(badgeKeyForLevel(1), "badge");
          set({ unlockedAchievements: [...get().unlockedAchievements, unlocked] });
        }
      },

      async recordClockIn() {
        await recordDailyActivity();
        await awardXp("clock_in", XP.CLOCK_IN);
        await unlockStickerOnce(FIRST_TIME_KEYS.clockIn, "first_time", XP.FIRST_TIME);
        await checkCountMilestones("clock_in");
      },

      async recordClockOut(elapsedSeconds) {
        await recordDailyActivity();
        const stats = await ensureLoaded();
        const today = todayDateString();

        let dailySeconds = stats.daily_seconds;
        let hoursDate = stats.daily_hours_date;
        let bonus4 = stats.daily_4hr_awarded;
        let bonus8 = stats.daily_8hr_awarded;
        if (hoursDate !== today) {
          dailySeconds = 0;
          bonus4 = false;
          bonus8 = false;
          hoursDate = today;
        }
        dailySeconds += elapsedSeconds;

        const wholeHours = Math.floor(elapsedSeconds / 3600);
        if (wholeHours > 0) {
          await awardXp("hourly", wholeHours * XP.PER_HOUR);
        }
        if (dailySeconds >= 4 * 3600 && !bonus4) {
          bonus4 = true;
          await awardXp("daily_4hr", XP.FOUR_HOUR_BONUS);
          await unlockStickerOnce(FOUR_HOUR_DAY_FIRST_KEY, "four_hour_day_first", XP.FOUR_HOUR_DAY_FIRST);
        }
        if (dailySeconds >= 8 * 3600 && !bonus8) {
          bonus8 = true;
          await awardXp("daily_8hr", XP.EIGHT_HOUR_BONUS);
        }

        await repos.gamification.updateStats({
          daily_seconds: dailySeconds,
          daily_hours_date: hoursDate,
          daily_4hr_awarded: bonus4,
          daily_8hr_awarded: bonus8,
        });
        set({
          stats: {
            ...get().stats!,
            daily_seconds: dailySeconds,
            daily_hours_date: hoursDate,
            daily_4hr_awarded: bonus4,
            daily_8hr_awarded: bonus8,
          },
        });
      },

      async recordNote() {
        await recordDailyActivity();
        await awardXp("note", XP.NOTE);
        await unlockStickerOnce(FIRST_TIME_KEYS.note, "first_time", XP.FIRST_TIME);
        await checkCountMilestones("note");
      },

      async recordProjectCreated() {
        await recordDailyActivity();
        await awardXp("project_created", XP.PROJECT_CREATED);
        await unlockStickerOnce(FIRST_TIME_KEYS.projectCreated, "first_time", XP.FIRST_TIME);
      },

      async recordProjectFinished() {
        await recordDailyActivity();
        await awardXp("project_finished", XP.PROJECT_FINISHED, "sticker_project_finished");
      },

      async recordTodoCompleted() {
        await recordDailyActivity();
        await awardXp("todo_completed", XP.TODO_COMPLETED);
        await unlockStickerOnce(FIRST_TIME_KEYS.todoCompleted, "first_time", XP.FIRST_TIME);
        await checkCountMilestones("todo_completed");
      },

      dismissToast(id) {
        set({ pendingToasts: get().pendingToasts.filter((t) => t.id !== id) });
      },
    };
  });
}

export type GamificationStore = ReturnType<typeof createGamificationStore>;
