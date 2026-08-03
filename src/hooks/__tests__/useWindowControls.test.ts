import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useWindowControls } from "../useWindowControls";

describe("useWindowControls", () => {
  it("starts unpinned and not fullscreen", () => {
    const { result } = renderHook(() => useWindowControls());
    expect(result.current.pinned).toBe(false);
    expect(result.current.fullscreen).toBe(false);
  });

  it("enterFullscreen flips the view state even without a Tauri bridge", async () => {
    const { result } = renderHook(() => useWindowControls());

    await act(async () => {
      await result.current.enterFullscreen();
    });

    expect(result.current.fullscreen).toBe(true);
  });

  it("exitFullscreen flips it back", async () => {
    const { result } = renderHook(() => useWindowControls());

    await act(async () => {
      await result.current.enterFullscreen();
    });
    await act(async () => {
      await result.current.exitFullscreen();
    });

    expect(result.current.fullscreen).toBe(false);
  });

  it("togglePin, minimizeToTray, and emergencyExit don't throw without a Tauri bridge", async () => {
    const { result } = renderHook(() => useWindowControls());

    await act(async () => {
      await result.current.togglePin();
    });
    await act(async () => {
      await result.current.minimizeToTray();
    });
    await act(async () => {
      await result.current.emergencyExit();
    });

    // No Tauri bridge in jsdom, so togglePin silently no-ops rather than
    // flipping — this just confirms none of the calls threw.
    expect(result.current.pinned).toBe(false);
  });
});
