// @vitest-environment node
import { describe, expect, it } from "vitest";
import { shouldRecordSample, type ActivitySample } from "../activityCapture";

const sample: ActivitySample = {
  app: "Code.exe",
  title: "mycelia-work",
  url: null,
  idle: false,
  idle_seconds: 2,
};

describe("shouldRecordSample", () => {
  it("records when capture is on and not paused", () => {
    expect(shouldRecordSample(sample, { enabled: true, paused: false, excludeApps: "" })).toBe(true);
  });

  it("skips when paused or disabled", () => {
    expect(shouldRecordSample(sample, { enabled: false, paused: false, excludeApps: "" })).toBe(false);
    expect(shouldRecordSample(sample, { enabled: true, paused: true, excludeApps: "" })).toBe(false);
  });

  it("skips excluded app names", () => {
    expect(
      shouldRecordSample(sample, { enabled: true, paused: false, excludeApps: "code.exe" }),
    ).toBe(false);
  });
});
