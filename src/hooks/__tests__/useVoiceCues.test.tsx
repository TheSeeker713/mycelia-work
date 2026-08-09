import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initDatabase, type Repositories } from "../../data";
import { createTestExecutor } from "../../data/__tests__/testExecutor";
import { StoreProvider, useSettingsStore } from "../../store/StoreProvider";
import { useVoiceCues } from "../useVoiceCues";

class FakeAudio {
  paused = false;
  constructor(public src: string) {
    instances.push(this);
  }
  play() {
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
}
let instances: FakeAudio[] = [];

let repos: Repositories;

beforeEach(async () => {
  instances = [];
  vi.stubGlobal("Audio", FakeAudio);
  repos = await initDatabase(createTestExecutor());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function wrapper({ children }: { children: ReactNode }) {
  return <StoreProvider repositories={repos}>{children}</StoreProvider>;
}

describe("useVoiceCues", () => {
  it("plays the please-wait cue", () => {
    const { result } = renderHook(() => useVoiceCues(), { wrapper });
    act(() => {
      result.current.play("please_wait");
    });
    expect(instances.length).toBe(1);
    expect(instances[0].src).toContain("please-wait");
  });

  it("interrupts whatever's currently playing rather than queuing", () => {
    const { result } = renderHook(() => useVoiceCues(), { wrapper });
    act(() => {
      result.current.play("please_wait");
      result.current.play("please_wait");
    });
    expect(instances.length).toBe(2);
    expect(instances[0].paused).toBe(true);
  });

  it("plays the file matching whichever narration voice is currently selected", async () => {
    const { result } = renderHook(
      () => ({ cues: useVoiceCues(), settings: useSettingsStore((s) => s) }),
      { wrapper },
    );
    await act(async () => {
      await result.current.settings.setNarrationVoiceId("am_adam");
    });
    act(() => {
      result.current.cues.play("please_wait");
    });
    expect(instances[0].src).toContain("am_adam");
  });

  it("falls back to the default voice's file for an unrecognized narration voice id", async () => {
    const { result } = renderHook(
      () => ({ cues: useVoiceCues(), settings: useSettingsStore((s) => s) }),
      { wrapper },
    );
    await act(async () => {
      await result.current.settings.setNarrationVoiceId("some-removed-voice");
    });
    act(() => {
      result.current.cues.play("please_wait");
    });
    expect(instances[0].src).toContain("af_heart_200");
  });

  it("does nothing when self-voicing is disabled", async () => {
    const { result } = renderHook(
      () => ({ cues: useVoiceCues(), settings: useSettingsStore((s) => s) }),
      { wrapper },
    );
    await act(async () => {
      await result.current.settings.setSelfVoicingEnabled(false);
    });
    act(() => {
      result.current.cues.play("please_wait");
    });
    expect(instances.length).toBe(0);
  });
});
