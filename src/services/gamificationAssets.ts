/**
 * Real badge/sticker art, wired to the achievement catalog in
 * `gamification.ts`. Source files live in `assets/gamification/`
 * (Jeremy's curation staging area, untouched by this build) — this
 * app bundles its own copy from `src/assets/gamification/`, since
 * Vite only processes imports under `src/`. See
 * `assets/gamification/README.md` for the content disclosure.
 *
 * Every curated file is referenced from some pool below — "all assets
 * need to be applied," per Jeremy — and every achievement that has
 * more than one candidate image exposes all of them as a pool rather
 * than picking one canonical file. `pickPoolImage()` draws a random
 * entry from a pool each time it's called, which is what actually
 * produces the "rotating random reward, never the same twice" effect
 * Jeremy asked for — call it fresh at award/toast time, not once and
 * cache it, or the "random" would only ever happen once per session.
 */

import { pickRandom } from "./gamification";

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
function urlsFor(map: Record<string, string>, exactFilenames: readonly string[]): string[] {
  return exactFilenames
    .map((name) => {
      const key = Object.keys(map).find((k) => k.endsWith("/" + name));
      return key ? map[key] : undefined;
    })
    .filter((u): u is string => !!u);
}

/** Picks a random image from a pool — call this at the moment something is displayed (a toast, a fresh render), not once and memoized, so repeated earns of the same achievement actually show different art. */
export function pickPoolImage(pool: readonly string[] | undefined): string | undefined {
  if (!pool || pool.length === 0) return undefined;
  return pickRandom(pool);
}

export const BADGE_IMAGE_POOL_BY_LEVEL: Readonly<Record<number, string[]>> = {
  1: urlsFor(badgeUrls, ["lvl1_hw.webp", "lvl1_hw (2).webp"]),
  2: urlsFor(badgeUrls, ["lvl2_hw.webp", "lvl2_hwn.webp"]),
  5: urlsFor(badgeUrls, ["lvl5_hw.webp"]),
  10: urlsFor(badgeUrls, ["lvl10_hw.webp"]),
  15: urlsFor(badgeUrls, ["lvl15_hw.webp"]),
  20: urlsFor(badgeUrls, ["lvl20_hw.webp"]),
  25: urlsFor(badgeUrls, ["lvl25_hw.webp"]),
  30: urlsFor(badgeUrls, ["lvl30_hw.webp"]),
  35: urlsFor(badgeUrls, ["lvl35_hw.webp"]),
  40: urlsFor(badgeUrls, ["lvl40_hw.webp"]),
  45: urlsFor(badgeUrls, ["lvl45_hw.webp"]),
  50: urlsFor(badgeUrls, ["lvl50_hw.webp"]),
  55: urlsFor(badgeUrls, ["lvl55_hw.webp"]),
  60: urlsFor(badgeUrls, ["lvl60_hw.webp"]),
  65: urlsFor(badgeUrls, ["lvl65_hw.webp"]),
  70: urlsFor(badgeUrls, ["lvl70_hwn.webp"]),
  75: urlsFor(badgeUrls, ["lvl75_hwn.webp"]),
  80: urlsFor(badgeUrls, ["lvl80_hwn.webp", "lvl80_hwn (2).webp"]),
  85: urlsFor(badgeUrls, ["lvl85_hwn.webp"]),
  90: urlsFor(badgeUrls, ["lvl90_hwn.webp"]),
  95: urlsFor(badgeUrls, ["lvl95_hwn.webp"]),
  100: urlsFor(badgeUrls, ["lvl100_hwn.webp"]),
  105: urlsFor(badgeUrls, ["lvl105_hwn.webp"]),
  110: urlsFor(badgeUrls, ["lvl110_hwn.webp"]),
  // hw_collection.webp (stickers folder) is a group shot, not tied to
  // any specific achievement concept — folded in here as the level-111
  // badge's second variant, a fitting "whole roster" image for the cap.
  111: [...urlsFor(badgeUrls, ["lvl111_hwn.webp"]), ...urlsFor(stickerUrls, ["hw_collection.webp"])],
};

export const STICKER_IMAGE_POOL_BY_KEY: Readonly<Record<string, string[]>> = {
  sticker_project_finished: urlsFor(stickerUrls, [
    "projectcomplete_hw.webp",
    "projectcomplete_hwn.webp",
    "projectcomplete_hwn (2).webp",
  ]),
  sticker_streak_7: urlsFor(stickerUrls, ["7day_hw.webp"]),
  sticker_streak_30: urlsFor(stickerUrls, ["30day_hw.webp", "30day_hw (2).webp"]),
  sticker_streak_100: urlsFor(stickerUrls, ["100days_hw.webp"]),
  sticker_streak_365: urlsFor(stickerUrls, ["365days_hw.webp"]),
  sticker_welcome_back: urlsFor(stickerUrls, [
    "welcomeback_hw.webp",
    "welcomeback_hw (2).webp",
    "welcomeback_hw (3).webp",
    "welcomeback_hw (4).webp",
    "welcomeback_hw (5).webp",
    "welcomeback_hw (6).webp",
    "welcomeback_hw (7).webp",
    "welcomeback_hw (8).webp",
    "welcomeback_hw (9).webp",
    "welcomeback_hw (10).webp",
    "welcomeback_hwn.webp",
  ]),
  sticker_first_clock_in: urlsFor(stickerUrls, ["firstclockin_hw.webp"]),
  sticker_first_note: urlsFor(stickerUrls, [
    "1note_hw.webp",
    "1note_1women.webp",
    "1note_2women.webp",
    "1note_3women.webp",
    "1note_3women (2).webp",
    "1note_3women (3).webp",
    "1note_5women.webp",
    "1note_6women.webp",
    "firstnote_women.webp",
  ]),
  sticker_first_todo_completed: urlsFor(stickerUrls, [
    "1sttodo_hw.webp",
    "first_todo_women.webp",
    "firsttodo_women.webp",
    "1todo_women.webp",
  ]),
  sticker_first_project_created: urlsFor(stickerUrls, [
    "1stproject_hw.webp",
    "firstproject_3women.webp",
    "firstproject_3women (2).webp",
    "firstproject_4women.webp",
  ]),
  sticker_four_hour_day_first: urlsFor(stickerUrls, [
    "4hour_hwn.webp",
    "4hour_hwn (2).webp",
    "4hourday_hwn.webp",
    "4hours_hwn.webp",
  ]),
  sticker_notes_10: urlsFor(stickerUrls, [
    "10notes_hwn.webp",
    "10notes_hwn (2).webp",
    "10notes_hwn (3).webp",
    "10notes_hwn (4).webp",
  ]),
  sticker_notes_50: urlsFor(stickerUrls, ["50notes_hwn.webp"]),
  sticker_todos_10: urlsFor(stickerUrls, ["10todo_hw.webp"]),
  sticker_todos_50: urlsFor(stickerUrls, ["50todo_hw.webp", "50todos_hw.webp"]),
  sticker_todos_100: urlsFor(stickerUrls, [
    "100todos_hwn.webp",
    "100todos_hwn (2).webp",
    "100todos_hwn (3).webp",
  ]),
  sticker_sessions_10: urlsFor(stickerUrls, [
    "10session_hwn.webp",
    "10session_hwn (2).webp",
    "10sessions_hwn.webp",
    "10sessions_hwn (2).webp",
  ]),
  sticker_sessions_50: urlsFor(stickerUrls, [
    "50sessions_hw.webp",
    "50sessions_hw1.webp",
    "50sessions_hwn.webp",
    "50sessions_hwn (2).webp",
  ]),
  sticker_sessions_100: urlsFor(stickerUrls, [
    "100sessions_hwn.webp",
    "100sessions_hwn (2).webp",
    "100sessions_hwn (3).webp",
    "100sessions_hwn (4).webp",
  ]),
  // Reserved for the not-yet-built personal journal feature — see gamification.ts's FIRST_JOURNAL_ENTRY_KEY.
  sticker_first_journal_entry: urlsFor(stickerUrls, [
    "1journal_hw.webp",
    "firstjournalentry_3women.webp",
    "firstjournalentry_3women (2).webp",
    "firstjournalentry_women.webp",
    "firstjournalentry_women (2).webp",
  ]),
};
