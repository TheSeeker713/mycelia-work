import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initDatabase, type Repositories } from "../../data";
import { createTestExecutor } from "../../data/__tests__/testExecutor";
import { StoreProvider, useSettingsStore } from "../../store/StoreProvider";
import { DEFAULT_VOICE_ID, type VoiceClient } from "../../services/voiceClient";
import { useSelfVoicing } from "../useSelfVoicing";

class FakeAudio {
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
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
  finish() {
    this.onended?.();
  }
}
let instances: FakeAudio[] = [];

let repos: Repositories;
let fakeClient: VoiceClient;

beforeEach(async () => {
  instances = [];
  vi.stubGlobal("Audio", FakeAudio);
  vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:fake"), revokeObjectURL: vi.fn() });
  repos = await initDatabase(createTestExecutor());
  fakeClient = {
    speak: vi.fn().mockResolvedValue(new Blob(["wav"])),
    transcribe: vi.fn(),
    isTtsAvailable: vi.fn(),
    isSttAvailable: vi.fn(),
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function wrapper({ children }: { children: ReactNode }) {
  return (
    <StoreProvider repositories={repos} voiceClient={fakeClient}>
      {children}
    </StoreProvider>
  );
}

describe("useSelfVoicing", () => {
  it("speaks queued text via the voice client and reports speaking state", async () => {
    const { result } = renderHook(() => useSelfVoicing(), { wrapper });

    act(() => {
      result.current.speak("Clocked in.");
    });

    await waitFor(() =>
      expect(fakeClient.speak).toHaveBeenCalledWith("Clocked in.", DEFAULT_VOICE_ID),
    );
    await waitFor(() => expect(result.current.speaking).toBe(true));

    act(() => {
      instances[0].finish();
    });

    await waitFor(() => expect(result.current.speaking).toBe(false));
  });

  it("processes multiple speak() calls in order, one at a time", async () => {
    const { result } = renderHook(() => useSelfVoicing(), { wrapper });

    act(() => {
      result.current.speak("First.");
      result.current.speak("Second.");
    });

    await waitFor(() => expect(instances.length).toBe(1));
    expect(fakeClient.speak).toHaveBeenCalledTimes(1);

    act(() => {
      instances[0].finish();
    });

    await waitFor(() => expect(instances.length).toBe(2));
    expect(fakeClient.speak).toHaveBeenNthCalledWith(2, "Second.", DEFAULT_VOICE_ID);
  });

  it("does nothing when self-voicing is disabled", async () => {
    // Same tree/store instance for both hooks — a fresh StoreProvider
    // per renderHook call would create a *separate* settingsStore, so
    // toggling one wouldn't affect the other's in-memory state.
    const { result } = renderHook(
      () => ({ voicing: useSelfVoicing(), settings: useSettingsStore((s) => s) }),
      { wrapper },
    );

    await act(async () => {
      await result.current.settings.setSelfVoicingEnabled(false);
    });

    act(() => {
      result.current.voicing.speak("Should stay silent.");
    });

    expect(fakeClient.speak).not.toHaveBeenCalled();
  });

  it("stop() clears the queue and pauses current playback", async () => {
    const { result } = renderHook(() => useSelfVoicing(), { wrapper });

    act(() => {
      result.current.speak("First.");
      result.current.speak("Second.");
    });

    await waitFor(() => expect(instances.length).toBe(1));

    act(() => {
      result.current.stop();
    });

    expect(instances[0].paused).toBe(true);
    expect(result.current.speaking).toBe(false);

    // Finishing the (now-stopped) first clip shouldn't start the second.
    act(() => {
      instances[0].finish();
    });
    expect(instances.length).toBe(1);
  });

  it("skips silently past a failed voice call instead of getting stuck", async () => {
    fakeClient.speak = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(new Blob(["wav"]));
    const { result } = renderHook(() => useSelfVoicing(), { wrapper });

    act(() => {
      result.current.speak("Fails.");
      result.current.speak("Succeeds.");
    });

    await waitFor(() => expect(instances.length).toBe(1));
    expect(fakeClient.speak).toHaveBeenNthCalledWith(2, "Succeeds.", DEFAULT_VOICE_ID);
  });

  it("speakAndWait resolves only once that utterance finishes playing", async () => {
    const { result } = renderHook(() => useSelfVoicing(), { wrapper });
    let resolved = false;

    let promise: Promise<void> = Promise.resolve();
    act(() => {
      promise = result.current.speakAndWait("Goodbye.").then(() => {
        resolved = true;
      });
    });

    await waitFor(() => expect(instances.length).toBe(1));
    expect(resolved).toBe(false);

    act(() => {
      instances[0].finish();
    });

    await promise;
    expect(resolved).toBe(true);
  });

  it("speakAndWait resolves immediately when self-voicing is disabled", async () => {
    const { result } = renderHook(
      () => ({ voicing: useSelfVoicing(), settings: useSettingsStore((s) => s) }),
      { wrapper },
    );
    await act(async () => {
      await result.current.settings.setSelfVoicingEnabled(false);
    });

    let resolved = false;
    await act(async () => {
      await result.current.voicing.speakAndWait("Goodbye.").then(() => {
        resolved = true;
      });
    });

    expect(resolved).toBe(true);
    expect(fakeClient.speak).not.toHaveBeenCalled();
  });

  it("stop() also resolves any speakAndWait callers still queued, so nothing hangs", async () => {
    const { result } = renderHook(() => useSelfVoicing(), { wrapper });
    let resolved = false;

    act(() => {
      result.current.speak("First.");
      result.current.speakAndWait("Second.").then(() => {
        resolved = true;
      });
    });
    await waitFor(() => expect(instances.length).toBe(1));

    act(() => {
      result.current.stop();
    });

    await waitFor(() => expect(resolved).toBe(true));
  });

  it("passes the settingsStore's chosen voice id through to each speak() call", async () => {
    const { result } = renderHook(
      () => ({ voicing: useSelfVoicing(), settings: useSettingsStore((s) => s) }),
      { wrapper },
    );

    await act(async () => {
      await result.current.settings.setNarrationVoiceId("some-other-voice-id");
    });

    act(() => {
      result.current.voicing.speak("Clocked in.");
    });

    await waitFor(() =>
      expect(fakeClient.speak).toHaveBeenCalledWith("Clocked in.", "some-other-voice-id"),
    );
  });
});
