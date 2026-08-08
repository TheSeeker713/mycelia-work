/**
 * Real badge/sticker art, wired to the achievement catalog in
 * `gamification.ts`. Source files live in `assets/gamification/`
 * (Jeremy's curation staging area, untouched by this build) — this
 * app bundles its own copy from `src/assets/gamification/`, since
 * Vite only processes imports under `src/`. See
 * `assets/gamification/README.md` for the content disclosure.
 *
 * Only the achievement types this app actually awards (25 badges,
 * project-finished, the two streak stickers, the 10 welcome-back
 * stickers) are wired here. The curated set has real art for more
 * concepts than that (first-time todo/note/project, 10/50/100-count
 * milestones, 100-day/365-day streak tiers, a four-hour-day badge) —
 * those aren't real achievement types in the app yet, so they're not
 * referenced here. `docs/reference/gamification-guide.md` tracks
 * what's actually live.
 */

const badgeUrls = import.meta.glob("../assets/gamification/badges/**/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const stickerUrls = import.meta.glob("../assets/gamification/stickers/**/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

/** Exact filename match (including extension) at the end of a glob-resolved path — avoids any prefix-collision between e.g. lvl1 and lvl10. */
function findUrl(map: Record<string, string>, exactFilename: string): string | undefined {
  const key = Object.keys(map).find((k) => k.endsWith("/" + exactFilename));
  return key ? map[key] : undefined;
}

export const BADGE_IMAGE_BY_LEVEL: Readonly<Record<number, string | undefined>> = {
  1: findUrl(badgeUrls, "lvl1_hw.webp"),
  2: findUrl(badgeUrls, "lvl2_hw.webp"),
  5: findUrl(badgeUrls, "lvl5_hw.webp"),
  10: findUrl(badgeUrls, "lvl10_hw.webp"),
  15: findUrl(badgeUrls, "lvl15_hw.webp"),
  20: findUrl(badgeUrls, "lvl20_hw.webp"),
  25: findUrl(badgeUrls, "lvl25_hw.webp"),
  30: findUrl(badgeUrls, "lvl30_hw.webp"),
  35: findUrl(badgeUrls, "lvl35_hw.webp"),
  40: findUrl(badgeUrls, "lvl40_hw.webp"),
  45: findUrl(badgeUrls, "lvl45_hw.webp"),
  50: findUrl(badgeUrls, "lvl50_hw.webp"),
  55: findUrl(badgeUrls, "lvl55_hw.webp"),
  60: findUrl(badgeUrls, "lvl60_hw.webp"),
  65: findUrl(badgeUrls, "lvl65_hw.webp"),
  70: findUrl(badgeUrls, "lvl70_hwn.webp"),
  75: findUrl(badgeUrls, "lvl75_hwn.webp"),
  80: findUrl(badgeUrls, "lvl80_hwn.webp"),
  85: findUrl(badgeUrls, "lvl85_hwn.webp"),
  90: findUrl(badgeUrls, "lvl90_hwn.webp"),
  95: findUrl(badgeUrls, "lvl95_hwn.webp"),
  100: findUrl(badgeUrls, "lvl100_hwn.webp"),
  105: findUrl(badgeUrls, "lvl105_hwn.webp"),
  110: findUrl(badgeUrls, "lvl110_hwn.webp"),
  111: findUrl(badgeUrls, "lvl111_hwn.webp"),
};

export const STICKER_IMAGE_BY_KEY: Readonly<Record<string, string | undefined>> = {
  sticker_project_finished: findUrl(stickerUrls, "projectcomplete_hw.webp"),
  sticker_streak_7: findUrl(stickerUrls, "7day_hw.webp"),
  sticker_streak_30: findUrl(stickerUrls, "30day_hw.webp"),
  sticker_welcome_back_1: findUrl(stickerUrls, "welcomeback_hw.webp"),
  sticker_welcome_back_2: findUrl(stickerUrls, "welcomeback_hw (2).webp"),
  sticker_welcome_back_3: findUrl(stickerUrls, "welcomeback_hw (3).webp"),
  sticker_welcome_back_4: findUrl(stickerUrls, "welcomeback_hw (4).webp"),
  sticker_welcome_back_5: findUrl(stickerUrls, "welcomeback_hw (5).webp"),
  sticker_welcome_back_6: findUrl(stickerUrls, "welcomeback_hw (6).webp"),
  sticker_welcome_back_7: findUrl(stickerUrls, "welcomeback_hw (7).webp"),
  sticker_welcome_back_8: findUrl(stickerUrls, "welcomeback_hw (8).webp"),
  sticker_welcome_back_9: findUrl(stickerUrls, "welcomeback_hw (9).webp"),
  sticker_welcome_back_10: findUrl(stickerUrls, "welcomeback_hw (10).webp"),
};
