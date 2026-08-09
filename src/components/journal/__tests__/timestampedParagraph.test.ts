import { describe, expect, it } from "vitest";
import { formatParagraphStamp } from "../timestampedParagraph";

describe("formatParagraphStamp", () => {
  it("formats as M-D-YYYY H:MMam/pm, per spec (e.g. 8-8-2026 10:40pm)", () => {
    expect(formatParagraphStamp("2026-08-08T22:40:00")).toBe("8-8-2026 10:40pm");
  });

  it("uses 12 for midnight and noon, not 0", () => {
    expect(formatParagraphStamp("2026-01-05T00:05:00")).toBe("1-5-2026 12:05am");
    expect(formatParagraphStamp("2026-01-05T12:05:00")).toBe("1-5-2026 12:05pm");
  });

  it("pads minutes but not hours", () => {
    expect(formatParagraphStamp("2026-03-01T09:03:00")).toBe("3-1-2026 9:03am");
  });
});
