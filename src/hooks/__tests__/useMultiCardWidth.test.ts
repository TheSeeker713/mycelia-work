import { describe, expect, it } from "vitest";
import { computeCardWidth } from "../useMultiCardWidth";

describe("computeCardWidth", () => {
  it("stays at the base 340px for 0 or 1 active sessions", () => {
    expect(computeCardWidth(0)).toBe(340);
    expect(computeCardWidth(1)).toBe(340);
  });

  it("grows to fit 2 session cards side by side", () => {
    // 2*280 + 1*12 + 56 padding = 628
    expect(computeCardWidth(2)).toBe(628);
  });

  it("grows to fit 3 session cards side by side", () => {
    // 3*280 + 2*12 + 56 padding = 920
    expect(computeCardWidth(3)).toBe(920);
  });
});
