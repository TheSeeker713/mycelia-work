import { useEffect } from "react";
import { useGamificationStore } from "../../store/StoreProvider";
import { BADGES, LEVEL_CAP, STICKERS, xpProgressWithinLevel } from "../../services/gamification";

/**
 * No hidden-unlock gate of any kind — ordinary, always-visible feature,
 * unlike the (now-removed) 18+ system. Badge/sticker art isn't wired
 * yet (Jeremy's still curating the real asset set), so this renders
 * plain labeled chips for now — same "build the plug, not what plugs
 * into it" treatment as the rest of this phase; swapping in real
 * images later only touches this file.
 */
export function ProgressCompartment() {
  const stats = useGamificationStore((s) => s.stats);
  const unlockedAchievements = useGamificationStore((s) => s.unlockedAchievements);
  const recentXpEvents = useGamificationStore((s) => s.recentXpEvents);
  const load = useGamificationStore((s) => s.load);

  useEffect(() => {
    load();
  }, [load]);

  if (!stats) {
    return (
      <div className="flex h-full flex-col">
        <div className="mb-3 text-[0.78rem] font-semibold text-[var(--ink)]">Progress</div>
        <p className="text-[0.82rem] text-[var(--ink-faint)]">Loading…</p>
      </div>
    );
  }

  const unlockedBadgeKeys = new Set(
    unlockedAchievements.filter((a) => a.kind === "badge").map((a) => a.achievement_key),
  );
  const stickerCounts = new Map<string, number>();
  for (const event of recentXpEvents) {
    if (!event.sticker_key) continue;
    stickerCounts.set(event.sticker_key, (stickerCounts.get(event.sticker_key) ?? 0) + 1);
  }
  for (const achievement of unlockedAchievements) {
    if (achievement.kind === "sticker" && !stickerCounts.has(achievement.achievement_key)) {
      stickerCounts.set(achievement.achievement_key, 1);
    }
  }

  const progress = xpProgressWithinLevel(stats.total_xp, stats.level);
  const atCap = stats.level >= LEVEL_CAP;
  const progressPercent = atCap ? 100 : Math.min(100, Math.round((progress.current / progress.needed) * 100));

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="mb-3 text-[0.78rem] font-semibold text-[var(--ink)]">Progress</div>

      <div className="mb-3 rounded-[10px] border p-3" style={{ borderColor: "var(--line)" }}>
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-[0.9rem] font-semibold text-[var(--ink)]">Level {stats.level}</span>
          <span className="text-[0.72rem] text-[var(--ink-faint)]">{stats.total_xp} XP total</span>
        </div>
        {atCap ? (
          <p className="text-[0.76rem] text-[var(--moss-deep)]">
            Level {LEVEL_CAP} reached — the journey's complete.
          </p>
        ) : (
          <>
            <div
              className="h-1.5 w-full overflow-hidden rounded-full"
              style={{ background: "var(--paper-deep)" }}
              role="progressbar"
              aria-valuenow={progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full"
                style={{ width: `${progressPercent}%`, background: "var(--moss)" }}
              />
            </div>
            <p className="mt-1 text-[0.72rem] text-[var(--ink-faint)]">
              {progress.current} / {progress.needed} XP to level {stats.level + 1}
            </p>
          </>
        )}
        <p className="mt-1.5 text-[0.72rem] text-[var(--ink-faint)]">
          {stats.streak_days} active day{stats.streak_days === 1 ? "" : "s"} logged
        </p>
      </div>

      <div className="mb-1.5 text-[0.7rem] tracking-wide text-[var(--ink-faint)] uppercase">
        Badges ({unlockedBadgeKeys.size}/{BADGES.length})
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {BADGES.map((badge) => {
          const unlocked = unlockedBadgeKeys.has(badge.key);
          return (
            <span
              key={badge.key}
              title={badge.label}
              className="rounded-full border px-2 py-1 text-[0.68rem]"
              style={{
                borderColor: unlocked ? "var(--moss)" : "var(--line)",
                background: unlocked ? "var(--moss-pale)" : "transparent",
                color: unlocked ? "var(--moss-deep)" : "var(--ink-faint)",
              }}
            >
              {badge.level}
            </span>
          );
        })}
      </div>

      <div className="mb-1.5 text-[0.7rem] tracking-wide text-[var(--ink-faint)] uppercase">
        Stickers
      </div>
      {stickerCounts.size === 0 ? (
        <p className="text-[0.78rem] text-[var(--ink-faint)]">None earned yet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {STICKERS.filter((s) => stickerCounts.has(s.key)).map((sticker) => (
            <li
              key={sticker.key}
              className="flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-[0.78rem]"
              style={{ borderColor: "var(--line)", color: "var(--ink)" }}
            >
              <span>{sticker.label}</span>
              {stickerCounts.get(sticker.key)! > 1 && (
                <span className="text-[0.7rem] text-[var(--ink-faint)]">×{stickerCounts.get(sticker.key)}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
