import { useEffect } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZenModeEditor } from "../ZenModeEditor";
import { StoreProvider, useSessionsStore, useSettingsStore } from "../../store/StoreProvider";
import { initDatabase, type Repositories } from "../../data";
import { createTestExecutor } from "../../data/__tests__/testExecutor";
import type { VoiceClient } from "../../services/voiceClient";
import type { OllamaClient } from "../../services/ollamaClient";

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
let ollamaClient: OllamaClient;
let sessionId: string;

function CaptureSession({ onReady }: { onReady: (id: string) => void }) {
  const clockIn = useSessionsStore((s) => s.clockIn);
  const activeSessions = useSessionsStore((s) => s.activeSessions);

  useEffect(() => {
    if (activeSessions[0]) onReady(activeSessions[0].session.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessions]);

  return (
    <button
      type="button"
      onClick={async () => {
        const task = await repos.tasks.create({ title: "Write the devlog entry" });
        await clockIn(task);
      }}
    >
      clock in
    </button>
  );
}

beforeEach(async () => {
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  vi.stubGlobal("navigator", {
    ...navigator,
    mediaDevices: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }) },
  });
  repos = await initDatabase(createTestExecutor());
  voiceClient = {
    speak: vi.fn(),
    transcribe: vi.fn().mockResolvedValue("a dictated line"),
    isTtsAvailable: vi.fn(),
    isSttAvailable: vi.fn(),
  };
  ollamaClient = {
    suggestContinuation: vi.fn().mockResolvedValue(null),
    classifyOnTopic: vi.fn().mockResolvedValue(true),
  };
  sessionId = "";
});

async function renderZenMode(onExit = vi.fn()) {
  const user = userEvent.setup();
  render(
    <StoreProvider repositories={repos} voiceClient={voiceClient} ollamaClient={ollamaClient}>
      <CaptureSession onReady={(id) => (sessionId = id)} />
      <ZenModeEditorHarness onExit={onExit} />
    </StoreProvider>,
  );
  await user.click(screen.getByText("clock in"));
  await waitFor(() => expect(sessionId).not.toBe(""));
  return { user, onExit };
}

function ZenModeEditorHarness({ onExit }: { onExit: () => void }) {
  const activeSessions = useSessionsStore((s) => s.activeSessions);
  const aiSuggestionsEnabled = useSettingsStore((s) => s.aiSuggestionsEnabled);
  const setAiSuggestionsEnabled = useSettingsStore((s) => s.setAiSuggestionsEnabled);
  const active = activeSessions[0];

  if (!active) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setAiSuggestionsEnabled(!aiSuggestionsEnabled)}
      >
        toggle ai suggestions
      </button>
      <ZenModeEditor sessionId={active.session.id} taskTitle={active.task.title} onExit={onExit} />
    </>
  );
}

describe("ZenModeEditor", () => {
  it("shows the task title and an empty writing surface", async () => {
    await renderZenMode();
    expect(screen.getByText("Write the devlog entry")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Write for Write the devlog entry...")).toHaveValue("");
  });

  it("Exit zen mode calls onExit", async () => {
    const { user, onExit } = await renderZenMode();
    await user.click(screen.getByRole("button", { name: "Exit zen mode" }));
    expect(onExit).toHaveBeenCalled();
  });

  it("Escape calls onExit", async () => {
    const { onExit } = await renderZenMode();
    fireEvent.keyDown(screen.getByPlaceholderText("Write for Write the devlog entry..."), {
      key: "Escape",
    });
    expect(onExit).toHaveBeenCalled();
  });

  it("Save note adds the draft as a real note and clears it", async () => {
    const { user } = await renderZenMode();
    const textarea = screen.getByPlaceholderText("Write for Write the devlog entry...");
    await user.type(textarea, "Sketched the layout.");

    await user.click(screen.getByRole("button", { name: "Save note" }));

    await waitFor(() => expect(textarea).toHaveValue(""));
    const notes = await repos.notes.listBySession(sessionId);
    expect(notes.map((n) => n.body)).toContain("Sketched the layout.");
  });

  it("dictating appends transcribed text into the draft", async () => {
    const { user } = await renderZenMode();

    await user.click(await screen.findByRole("button", { name: "Dictate with your voice" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Stop recording" })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Stop recording" }));

    await waitFor(() =>
      expect(screen.getByPlaceholderText("Write for Write the devlog entry...")).toHaveValue(
        "a dictated line",
      ),
    );
  });

  describe("ghost-text suggestions", () => {
    it("shows a suggestion after a typing pause, and Tab accepts it into the draft", async () => {
      ollamaClient.suggestContinuation = vi.fn().mockResolvedValue(" and kept going.");
      const { user } = await renderZenMode();
      const textarea = screen.getByPlaceholderText("Write for Write the devlog entry...");

      await user.type(textarea, "Sketched the layout");

      await waitFor(() => expect(screen.getByText("and kept going.")).toBeInTheDocument());

      await user.type(textarea, "{Tab}");

      expect(textarea).toHaveValue("Sketched the layout and kept going.");
      expect(screen.queryByText("and kept going.")).not.toBeInTheDocument();
    });

    it("any other key dismisses the suggestion instead of accepting it", async () => {
      ollamaClient.suggestContinuation = vi.fn().mockResolvedValue(" more text");
      const { user } = await renderZenMode();
      const textarea = screen.getByPlaceholderText("Write for Write the devlog entry...");

      await user.type(textarea, "Sketched the layout");
      await waitFor(() => expect(screen.getByText("more text")).toBeInTheDocument());

      await user.type(textarea, "!");

      expect(screen.queryByText("more text")).not.toBeInTheDocument();
      expect(textarea).toHaveValue("Sketched the layout!");
    });

    it("does not fetch a suggestion while AI writing suggestions is turned off", async () => {
      const suggestFn = vi.fn().mockResolvedValue(" more text");
      ollamaClient.suggestContinuation = suggestFn;
      const { user } = await renderZenMode();

      await user.click(screen.getByRole("button", { name: "toggle ai suggestions" }));
      const textarea = screen.getByPlaceholderText("Write for Write the devlog entry...");
      await user.type(textarea, "Sketched the layout");

      // Give the debounce window a real chance to have fired if it were going to.
      await new Promise((resolve) => setTimeout(resolve, 700));
      expect(suggestFn).not.toHaveBeenCalled();
    });
  });
});
