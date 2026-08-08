import { useEffect, useState } from "react";
import { useGamificationStore } from "../../store/StoreProvider";
import { BADGES, LEVEL_CAP, STICKERS, xpProgressWithinLevel } from "../../services/gamification";
import { BADGE_IMAGE_POOL_BY_LEVEL, STICKER_IMAGE_POOL_BY_KEY } from "../../services/gamificationAssets";

/**
 * No hidden-unlock gate of any kind — ordinary, always-visible feature,
 * unlike the (now-removed) 18+ system. Real badge/sticker art from
 * Jeremy's curated set (gamificationAssets.ts). Achievements with
 * multiple curated variants get a random one in the toast pop-up (the
 * actual "reward moment") — this grid/list is the stable collection
 * view, so it shows each achievement's first pool image consistently
 * rather than re-rolling on every render.
 */
export function ProgressCompartment() {
  const stats = useGamificationStore((s) => s.stats);
  const unlockedAchievements = useGamificationStore((s) => s.unlockedAchievements);
  const recentXpEvents = useGamificationStore((s) => s.recentXpEvents);
  const load = useGamificationStore((s) => s.load);
  const [showHowThisWorks, setShowHowThisWorks] = useState(false);

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
      <div className="mb-3 flex flex-wrap gap-2">
        {BADGES.map((badge) => {
          const unlocked = unlockedBadgeKeys.has(badge.key);
          const imageUrl = BADGE_IMAGE_POOL_BY_LEVEL[badge.level]?.[0];
          return (
            <div
              key={badge.key}
              title={badge.label}
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border"
              style={{
                borderColor: unlocked ? "var(--moss)" : "var(--line)",
                background: unlocked ? "var(--moss-pale)" : "var(--paper-deep)",
              }}
            >
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={badge.label}
                  className="h-full w-full object-cover"
                  style={unlocked ? undefined : { filter: "grayscale(1)", opacity: 0.35 }}
                />
              ) : (
                <span
                  className="text-[0.68rem]"
                  style={{ color: unlocked ? "var(--moss-deep)" : "var(--ink-faint)" }}
                >
                  {badge.level}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="mb-1.5 text-[0.7rem] tracking-wide text-[var(--ink-faint)] uppercase">
        Stickers
      </div>
      {stickerCounts.size === 0 ? (
        <p className="text-[0.78rem] text-[var(--ink-faint)]">None earned yet.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {STICKERS.filter((s) => stickerCounts.has(s.key)).map((sticker) => {
            const imageUrl = STICKER_IMAGE_POOL_BY_KEY[sticker.key]?.[0];
            return (
              <li
                key={sticker.key}
                className="flex items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-[0.78rem]"
                style={{ borderColor: "var(--line)", color: "var(--ink)" }}
              >
                {imageUrl && (
                  <img
                    src={imageUrl}
                    alt=""
                    className="h-8 w-8 flex-shrink-0 rounded-md object-cover"
                  />
                )}
                <span className="flex-1">{sticker.label}</span>
                {stickerCounts.get(sticker.key)! > 1 && (
                  <span className="text-[0.7rem] text-[var(--ink-faint)]">×{stickerCounts.get(sticker.key)}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 border-t border-dashed pt-3" style={{ borderColor: "var(--line)" }}>
        <button
          type="button"
          onClick={() => setShowHowThisWorks((v) => !v)}
          className="text-[0.74rem] text-[var(--ink-soft)] underline decoration-dotted"
        >
          {showHowThisWorks ? "Hide" : "How XP & rewards work"}
        </button>
        {showHowThisWorks && (
          <div className="mt-2 flex flex-col gap-2 text-[0.76rem] leading-relaxed text-[var(--ink-soft)]">
            <p>
              Clocking in, clocking real hours, writing notes, finishing
              todos and projects, and just showing up most days all earn
              XP. Leveling up (capped at 111) unlocks badges; finishing
              things and streak milestones earn stickers.
            </p>
            <p>
              Nothing here ever takes XP away, drops a level, or resets a
              streak — missing a day just means no new rewards during the
              gap. Coming back after roughly 3+ days away earns its own
              small bonus and a random "welcome back" sticker, every time
              you qualify for it.
            </p>
            <p className="text-[var(--ink-faint)]">
              Full details: docs/reference/gamification-guide.md.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
