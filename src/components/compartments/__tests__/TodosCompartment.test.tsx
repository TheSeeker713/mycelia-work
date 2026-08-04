import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TodosCompartment } from "../TodosCompartment";
import { StoreProvider } from "../../../store/StoreProvider";
import { initDatabase, type Repositories } from "../../../data";
import { createTestExecutor } from "../../../data/__tests__/testExecutor";
import type { VoiceClient } from "../../../services/voiceClient";

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

function renderTodos() {
  return render(
    <StoreProvider repositories={repos} voiceClient={voiceClient}>
      <TodosCompartment />
    </StoreProvider>,
  );
}

describe("TodosCompartment — mic icon", () => {
  it("dictating appends transcribed text into the new-todo field", async () => {
    const user = userEvent.setup();
    renderTodos();

    await user.click(await screen.findByRole("button", { name: "Dictate with your voice" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Stop recording" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Stop recording" }));

    await waitFor(() => expect(screen.getByLabelText("New todo")).toHaveValue("buy more coffee"));
  });
});
