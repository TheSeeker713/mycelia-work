import { describe, expect, it } from "vitest";
import { BADGE_IMAGE_BY_LEVEL, STICKER_IMAGE_BY_KEY } from "../gamificationAssets";
import { BADGES, WELCOME_BACK_STICKER_KEYS } from "../gamification";

describe("gamificationAssets", () => {
  it("resolves a real image URL for every one of the 25 badge levels", () => {
    for (const badge of BADGES) {
      expect(BADGE_IMAGE_BY_LEVEL[badge.level], `level ${badge.level}`).toBeTruthy();
    }
  });

  it("resolves a real image URL for the project-finished and streak-milestone stickers", () => {
    expect(STICKER_IMAGE_BY_KEY.sticker_project_finished).toBeTruthy();
    expect(STICKER_IMAGE_BY_KEY.sticker_streak_7).toBeTruthy();
    expect(STICKER_IMAGE_BY_KEY.sticker_streak_30).toBeTruthy();
  });

  it("resolves a real image URL for all 10 welcome-back stickers", () => {
    for (const key of WELCOME_BACK_STICKER_KEYS) {
      expect(STICKER_IMAGE_BY_KEY[key], key).toBeTruthy();
    }
  });

  it("every resolved URL is unique — no two achievements silently share art", () => {
    const urls = [
      ...Object.values(BADGE_IMAGE_BY_LEVEL),
      ...Object.values(STICKER_IMAGE_BY_KEY),
    ].filter((u): u is string => !!u);
    expect(new Set(urls).size).toBe(urls.length);
  });
});
