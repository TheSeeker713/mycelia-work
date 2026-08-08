import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LibraryCompartment } from "../LibraryCompartment";
import { StoreProvider } from "../../../store/StoreProvider";
import { initDatabase, type Repositories } from "../../../data";
import { createTestExecutor } from "../../../data/__tests__/testExecutor";
import { DEFAULT_PIPER_VOICE_ID, type VoiceClient } from "../../../services/voiceClient";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue("D:\\_Dev\\Projects\\mycelia-work\\docs\\workjournal\\2026-08-07_2100_session-journal.md"),
}));

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

describe("LibraryCompartment — accordion", () => {
  it("shows Work Journal expanded and the other two sections collapsed into buttons by default", async () => {
    renderLibrary();

    expect(await screen.findByText("Work journal")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archived tasks" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Books" })).toBeInTheDocument();
    // Not present as section headers while collapsed.
    expect(screen.queryByText("Archived tasks", { selector: "div" })).not.toBeInTheDocument();
  });

  it("clicking Archived tasks expands it and collapses Work Journal into a button", async () => {
    const user = userEvent.setup();
    renderLibrary();

    await user.click(screen.getByRole("button", { name: "Archived tasks" }));

    expect(screen.getByText("Nothing archived yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Work journal" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Books" })).toBeInTheDocument();
  });

  it("shows a count badge on the Archived tasks button once something's archived", async () => {
    const task = await repos.tasks.create({ title: "Old task" });
    await repos.tasks.archive(task.id);
    renderLibrary();

    expect(await screen.findByRole("button", { name: /Archived tasks/ })).toHaveTextContent("1");
  });
});

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

    expect(voiceClient.speak).toHaveBeenCalledWith(
      "Spent the afternoon on the devlog entry.",
      DEFAULT_PIPER_VOICE_ID,
    );
    await waitFor(() => expect(screen.getByText("Stop reading")).toBeInTheDocument());
  });

  it("Export writes the journal to disk and shows the saved path", async () => {
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

    await user.click(await screen.findByText("Export"));

    expect(await screen.findByText(/Saved to/)).toBeInTheDocument();
  });
});

describe("LibraryCompartment — failed journals", () => {
  it("shows the failure reason next to a failed journal, and Retry re-runs it", async () => {
    const task = await repos.tasks.create({ title: "Write the devlog entry" });
    const session = await repos.taskSessions.clockIn(task.id);
    const journal = await repos.journals.createPending({
      taskId: task.id,
      taskSessionId: session.id,
      kind: "session",
    });
    await repos.journals.markResult(journal.id, "failed", {
      failureReason: "Generation didn't finish — the app was likely closed or reloaded mid-run.",
    });

    renderLibrary();

    expect(
      await screen.findByText(/Generation didn't finish — the app was likely closed/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
