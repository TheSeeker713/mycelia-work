import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initDatabase, type Repositories } from "../../data";
import { createTestExecutor } from "../../data/__tests__/testExecutor";
import { StoreProvider, useSettingsStore } from "../../store/StoreProvider";
import type { VoiceClient } from "../../services/voiceClient";
import { useSpeechToText } from "../useSpeechToText";

class FakeMediaRecorder {
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(public stream: MediaStream) {}
  start() {
    this.ondataavailable?.({ data: new Blob(["chunk"]) });
  }
  stop() {
    this.onstop?.();
  }
}

function fakeStream(): MediaStream {
  return { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
}

let repos: Repositories;
let fakeClient: VoiceClient;
let getUserMedia: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  getUserMedia = vi.fn().mockResolvedValue(fakeStream());
  vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia } });

  repos = await initDatabase(createTestExecutor());
  fakeClient = {
    speak: vi.fn(),
    transcribe: vi.fn().mockResolvedValue("buy more coffee"),
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

describe("useSpeechToText", () => {
  it("records then transcribes on stop(), returning the text", async () => {
    const { result } = renderHook(() => useSpeechToText(), { wrapper });

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.recording).toBe(true);
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });

    let text: string | null = null;
    await act(async () => {
      text = await result.current.stop();
    });

    expect(text).toBe("buy more coffee");
    expect(fakeClient.transcribe).toHaveBeenCalled();
    expect(result.current.recording).toBe(false);
    expect(result.current.transcribing).toBe(false);
  });

  it("start() does nothing when STT is disabled", async () => {
    const { result } = renderHook(
      () => ({ stt: useSpeechToText(), settings: useSettingsStore((s) => s) }),
      { wrapper },
    );
    await act(async () => {
      await result.current.settings.setSttEnabled(false);
    });

    await act(async () => {
      await result.current.stt.start();
    });

    expect(getUserMedia).not.toHaveBeenCalled();
    expect(result.current.stt.recording).toBe(false);
  });

  it("sets an error and stays not-recording when mic access is denied", async () => {
    getUserMedia.mockRejectedValue(new Error("Permission denied"));
    const { result } = renderHook(() => useSpeechToText(), { wrapper });

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.recording).toBe(false);
    expect(result.current.error).toBe("Permission denied");
  });

  it("stop() without a prior start() resolves to null instead of throwing", async () => {
    const { result } = renderHook(() => useSpeechToText(), { wrapper });
    let text: string | null = "not-null-yet";
    await act(async () => {
      text = await result.current.stop();
    });
    expect(text).toBeNull();
  });

  it("sets an error when transcription fails (service unreachable)", async () => {
    fakeClient.transcribe = vi.fn().mockResolvedValue(null);
    const { result } = renderHook(() => useSpeechToText(), { wrapper });

    await act(async () => {
      await result.current.start();
    });
    let text: string | null = "not-null-yet";
    await act(async () => {
      text = await result.current.stop();
    });

    expect(text).toBeNull();
    await waitFor(() => expect(result.current.error).toBe("Couldn't reach the local transcription service."));
  });
});
