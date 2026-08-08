import { describe, expect, it } from "vitest";
import { BADGE_IMAGE_POOL_BY_LEVEL, STICKER_IMAGE_POOL_BY_KEY, pickPoolImage } from "../gamificationAssets";
import { BADGES, STICKERS } from "../gamification";

describe("gamificationAssets", () => {
  it("resolves a non-empty image pool for every one of the 25 badge levels", () => {
    for (const badge of BADGES) {
      const pool = BADGE_IMAGE_POOL_BY_LEVEL[badge.level];
      expect(pool, `level ${badge.level}`).toBeDefined();
      expect(pool.length, `level ${badge.level}`).toBeGreaterThan(0);
    }
  });

  it("resolves a non-empty image pool for every catalog sticker", () => {
    for (const sticker of STICKERS) {
      const pool = STICKER_IMAGE_POOL_BY_KEY[sticker.key];
      expect(pool, sticker.key).toBeDefined();
      expect(pool.length, sticker.key).toBeGreaterThan(0);
    }
  });

  it("levels with multiple curated variants expose all of them, not just one", () => {
    expect(BADGE_IMAGE_POOL_BY_LEVEL[1].length).toBe(2);
    expect(BADGE_IMAGE_POOL_BY_LEVEL[2].length).toBe(2);
    expect(BADGE_IMAGE_POOL_BY_LEVEL[80].length).toBe(2);
    expect(STICKER_IMAGE_POOL_BY_KEY.sticker_welcome_back.length).toBe(11);
    expect(STICKER_IMAGE_POOL_BY_KEY.sticker_first_note.length).toBe(9);
  });

  it("every real curated image file is referenced by some pool — none left unused", () => {
    const allUrls = new Set<string>();
    for (const pool of Object.values(BADGE_IMAGE_POOL_BY_LEVEL)) {
      for (const url of pool) allUrls.add(url);
    }
    for (const pool of Object.values(STICKER_IMAGE_POOL_BY_KEY)) {
      for (const url of pool) allUrls.add(url);
    }
    // 28 badge files + 70 sticker files, no duplicates across pools
    // (hw_collection.webp lives in the stickers folder but is only
    // referenced once, from the level-111 badge pool).
    expect(allUrls.size).toBe(28 + 70);
  });

  it("pickPoolImage draws from within the given pool", () => {
    const pool = ["a", "b", "c"];
    for (let i = 0; i < 20; i += 1) {
      expect(pool).toContain(pickPoolImage(pool));
    }
  });

  it("pickPoolImage returns undefined for an empty or missing pool", () => {
    expect(pickPoolImage([])).toBeUndefined();
    expect(pickPoolImage(undefined)).toBeUndefined();
  });
});
