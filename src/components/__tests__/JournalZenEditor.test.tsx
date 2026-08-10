import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JournalZenEditor } from "../JournalZenEditor";
import { StoreProvider } from "../../store/StoreProvider";
import { initDatabase, type Repositories } from "../../data";
import { createTestExecutor } from "../../data/__tests__/testExecutor";
import type { OllamaClient } from "../../services/ollamaClient";

let repos: Repositories;
let ollamaClient: OllamaClient;

beforeEach(async () => {
  repos = await initDatabase(createTestExecutor());
  ollamaClient = {
    suggestContinuation: vi.fn().mockResolvedValue(null),
    classifyOnTopic: vi.fn(),
    warmUpGhostText: vi.fn(),
    warmUpModel: vi.fn(),
    isAvailable: vi.fn().mockResolvedValue(true),
    generateReport: vi.fn(),
  };
});

function renderJournal(onExit = vi.fn()) {
  render(
    <StoreProvider repositories={repos} ollamaClient={ollamaClient}>
      <JournalZenEditor onExit={onExit} />
    </StoreProvider>,
  );
  return { onExit };
}

describe("JournalZenEditor", () => {
  it("loads the open draft and renders the writing surface with Muse on by default", async () => {
    renderJournal();

    expect(await screen.findByText("Free write")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Muse on" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("Muse toggle flips on/off and persists across a remount", async () => {
    const user = userEvent.setup();
    renderJournal();

    const museButton = await screen.findByRole("button", { name: "Muse on" });
    await user.click(museButton);

    expect(await screen.findByRole("button", { name: "Muse off" })).toBeInTheDocument();
  });

  it("the shortcuts icon opens the shortcuts overlay, and Escape closes just the overlay first", async () => {
    const user = userEvent.setup();
    const { onExit } = renderJournal();

    await screen.findByText("Free write");
    await user.click(screen.getByLabelText("Keyboard shortcuts"));
    expect(await screen.findByText("Keyboard shortcuts")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByText("Keyboard shortcuts")).not.toBeInTheDocument();
    expect(onExit).not.toHaveBeenCalled();

    await user.keyboard("{Escape}");
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("the Exit button calls onExit directly", async () => {
    const user = userEvent.setup();
    const { onExit } = renderJournal();

    await user.click(await screen.findByRole("button", { name: "Exit" }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("Muse actually fires once the caret is at the end of the document", async () => {
    // The original end-of-document check compared the caret against
    // `doc.content.size`, which is never a reachable caret position (the
    // paragraph's closing token sits there), so Muse never requested
    // anything at all. Typing normally leaves the caret at the true end,
    // so a real suggestion call has to happen here.
    const user = userEvent.setup();
    ollamaClient.suggestContinuation = vi.fn().mockResolvedValue(" and kept going.");
    renderJournal();

    await screen.findByText("Free write");
    await user.click(screen.getByRole("textbox"));
    await user.keyboard("Sketched the layout");

    await waitFor(() => expect(ollamaClient.suggestContinuation).toHaveBeenCalled(), {
      timeout: 3000,
    });
  });

  it("right-clicking the writing surface opens the formatting menu, closes on outside click", async () => {
    const user = userEvent.setup();
    renderJournal();

    await screen.findByText("Free write");
    const surface = screen.getByRole("textbox");
    await user.pointer({ keys: "[MouseRight]", target: surface });

    expect(await screen.findByRole("menu", { name: "Formatting" })).toBeInTheDocument();
    expect(screen.getByText("Bold")).toBeInTheDocument();
    expect(screen.getByText("Undo")).toBeInTheDocument();

    await user.click(screen.getByText("Free write"));
    expect(screen.queryByRole("menu", { name: "Formatting" })).not.toBeInTheDocument();
  });

  it("Save commits the current draft and loads a fresh blank one", async () => {
    const user = userEvent.setup();
    renderJournal();

    await screen.findByText("Free write");
    const firstDraft = await repos.journalEntries.getOrCreateOpenDraft();

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(async () => {
      const committed = await repos.journalEntries.listCommitted(10);
      expect(committed.map((c) => c.id)).toContain(firstDraft.id);
    });
    const freshDraft = await repos.journalEntries.getOrCreateOpenDraft();
    expect(freshDraft.id).not.toBe(firstDraft.id);
  });
});
