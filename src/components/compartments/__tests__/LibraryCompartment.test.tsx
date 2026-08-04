import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LibraryCompartment } from "../LibraryCompartment";
import { StoreProvider } from "../../../store/StoreProvider";
import { initDatabase, type Repositories } from "../../../data";
import { createTestExecutor } from "../../../data/__tests__/testExecutor";
import type { VoiceClient } from "../../../services/voiceClient";

let repos: Repositories;
let voiceClient: VoiceClient;

beforeEach(async () => {
  repos = await initDatabase(createTestExecutor());
  voiceClient = {
    speak: vi.fn().mockResolvedValue(new Blob(["wav"])),
    transcribe: vi.fn(),
    isTtsAvailable: vi.fn(),
    isSttAvailable: vi.fn(),
  };
});

function renderLibrary() {
  return render(
    <StoreProvider repositories={repos} voiceClient={voiceClient}>
      <LibraryCompartment />
    </StoreProvider>,
  );
}

describe("LibraryCompartment — Read aloud", () => {
  it("reads a ready journal entry's content aloud via the voice client, and can be stopped", async () => {
    const user = userEvent.setup();
    const task = await repos.tasks.create({ title: "Write the devlog entry" });
    const session = await repos.taskSessions.clockIn(task.id);
    const journal = await repos.journals.createPending({
      taskId: task.id,
      taskSessionId: session.id,
      kind: "session",
    });
    await repos.journals.markResult(journal.id, "ok", {
      content: "Spent the afternoon on the devlog entry.",
      modelUsed: "xai/grok-4.5",
    });

    renderLibrary();

    const readAloud = await screen.findByText("🔊 Read aloud");
    await user.click(readAloud);

    expect(voiceClient.speak).toHaveBeenCalledWith("Spent the afternoon on the devlog entry.");
    await waitFor(() => expect(screen.getByText("Stop reading")).toBeInTheDocument());
  });
});
