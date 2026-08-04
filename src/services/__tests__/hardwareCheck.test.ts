import { describe, expect, it, vi } from "vitest";
import type { VoiceClient } from "../voiceClient";
import {
  SLOW_TTS_THRESHOLD_SECONDS,
  classifyVoicePerformance,
  measureTtsLatencySeconds,
} from "../hardwareCheck";

function fakeClient(overrides: Partial<VoiceClient> = {}): VoiceClient {
  return {
    speak: vi.fn().mockResolvedValue(new Blob(["wav"])),
    transcribe: vi.fn(),
    isTtsAvailable: vi.fn(),
    isSttAvailable: vi.fn(),
    ...overrides,
  };
}

describe("measureTtsLatencySeconds", () => {
  it("returns a positive number when speak() succeeds", async () => {
    const seconds = await measureTtsLatencySeconds(fakeClient());
    expect(seconds).not.toBeNull();
    expect(seconds!).toBeGreaterThanOrEqual(0);
  });

  it("returns null when speak() fails (server unreachable)", async () => {
    const seconds = await measureTtsLatencySeconds(fakeClient({ speak: vi.fn().mockResolvedValue(null) }));
    expect(seconds).toBeNull();
  });
});

describe("classifyVoicePerformance", () => {
  it("classifies null latency as unavailable", () => {
    expect(classifyVoicePerformance(null)).toBe("unavailable");
  });

  it("classifies at-or-under the threshold as fast", () => {
    expect(classifyVoicePerformance(SLOW_TTS_THRESHOLD_SECONDS)).toBe("fast");
    expect(classifyVoicePerformance(0.15)).toBe("fast");
  });

  it("classifies over the threshold as slow", () => {
    expect(classifyVoicePerformance(SLOW_TTS_THRESHOLD_SECONDS + 0.01)).toBe("slow");
    expect(classifyVoicePerformance(5)).toBe("slow");
  });
});
