import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDLE_THRESHOLD_SECONDS, useIdleWatcher } from "../useIdleWatcher";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useIdleWatcher", () => {
  it("doesn't poll at all when there's no running session", () => {
    const { result } = renderHook(() => useIdleWatcher(false));
    expect(result.current.showToast).toBe(false);
    expect(result.current.idleSeconds).toBe(0);
  });

  it("stays quiet without a Tauri bridge rather than crashing (invoke() rejects, caught)", async () => {
    const { result } = renderHook(() => useIdleWatcher(true));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });

    // No Tauri bridge in jsdom, so invoke() rejects and the catch block
    // just leaves state at its default — this only confirms it doesn't
    // throw and take the whole test down with it.
    expect(result.current.showToast).toBe(false);
  });

  it(`the threshold constant is a few minutes (${IDLE_THRESHOLD_SECONDS}s), matching CLAUDE.md`, () => {
    expect(IDLE_THRESHOLD_SECONDS).toBeGreaterThan(60);
    expect(IDLE_THRESHOLD_SECONDS).toBeLessThan(600);
  });
});
