import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MicButton } from "../MicButton";
import { StoreProvider, useSettingsStore } from "../../store/StoreProvider";
import { initDatabase, type Repositories } from "../../data";
import { createTestExecutor } from "../../data/__tests__/testExecutor";
import type { VoiceClient } from "../../services/voiceClient";

class FakeMediaRecorder {
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() {
    this.ondataavailable?.({ data: new Blob(["chunk"]) });
  }
  stop() {
    this.onstop?.();
  }
}

let repos: Repositories;
let voiceClient: VoiceClient;

beforeEach(async () => {
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  vi.stubGlobal("navigator", {
    ...navigator,
    mediaDevices: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }) },
  });
  repos = await initDatabase(createTestExecutor());
  voiceClient = {
    speak: vi.fn(),
    transcribe: vi.fn().mockResolvedValue("buy more coffee"),
    isTtsAvailable: vi.fn(),
    isSttAvailable: vi.fn(),
  };
});

function renderMic(onTranscribed = vi.fn()) {
  const utils = render(
    <StoreProvider repositories={repos} voiceClient={voiceClient}>
      <MicButton onTranscribed={onTranscribed} />
    </StoreProvider>,
  );
  return { ...utils, onTranscribed };
}

describe("MicButton", () => {
  it("starts recording on first click, stops and transcribes on second, calling onTranscribed", async () => {
    const user = userEvent.setup();
    const { onTranscribed } = renderMic();

    const button = screen.getByRole("button", { name: "Dictate with your voice" });
    await user.click(button);
    await waitFor(() => expect(screen.getByRole("button", { name: "Stop recording" })).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Stop recording" }));

    await waitFor(() => expect(onTranscribed).toHaveBeenCalledWith("buy more coffee"));
  });

  it("does not call onTranscribed when transcription fails", async () => {
    voiceClient.transcribe = vi.fn().mockResolvedValue(null);
    const user = userEvent.setup();
    const { onTranscribed } = renderMic();

    await user.click(screen.getByRole("button", { name: "Dictate with your voice" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Stop recording" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Stop recording" }));

    await waitFor(() => expect(voiceClient.transcribe).toHaveBeenCalled());
    expect(onTranscribed).not.toHaveBeenCalled();
  });

  it("renders nothing when STT is disabled in settings", async () => {
    function Wrapper() {
      const settings = useSettingsStore((s) => s);
      return (
        <>
          <button onClick={() => settings.setSttEnabled(false)}>disable</button>
          <MicButton onTranscribed={vi.fn()} />
        </>
      );
    }
    const user = userEvent.setup();
    render(
      <StoreProvider repositories={repos} voiceClient={voiceClient}>
        <Wrapper />
      </StoreProvider>,
    );

    expect(screen.getByRole("button", { name: "Dictate with your voice" })).toBeInTheDocument();
    await user.click(screen.getByText("disable"));
    expect(screen.queryByRole("button", { name: "Dictate with your voice" })).not.toBeInTheDocument();
  });
});
