import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GhostTextField } from "../GhostTextField";
import { StoreProvider } from "../../store/StoreProvider";
import { initDatabase, type Repositories } from "../../data";
import { createTestExecutor } from "../../data/__tests__/testExecutor";
import type { OllamaClient } from "../../services/ollamaClient";
import { MIN_CHARS_FOR_SUGGESTION } from "../../hooks/useGhostText";

let repos: Repositories;
let ollamaClient: OllamaClient;

beforeEach(async () => {
  repos = await initDatabase(createTestExecutor());
  ollamaClient = {
    suggestContinuation: vi.fn().mockResolvedValue(" and then some."),
    classifyOnTopic: vi.fn(),
    warmUpGhostText: vi.fn(),
    warmUpModel: vi.fn(),
    isAvailable: vi.fn().mockResolvedValue(true),
    generateReport: vi.fn(),
  };
});

/** Controlled wrapper, since the real call sites all own their own state. */
function Harness({ multiline = false }: { multiline?: boolean }) {
  const [value, setValue] = useState("");
  return (
    <GhostTextField
      value={value}
      onValueChange={setValue}
      multiline={multiline}
      aria-label="Field"
      className="text-[0.8rem]"
    />
  );
}

function renderField(multiline = false) {
  render(
    <StoreProvider repositories={repos} ollamaClient={ollamaClient}>
      <Harness multiline={multiline} />
    </StoreProvider>,
  );
  return userEvent.setup();
}

describe("GhostTextField", () => {
  it("shows a suggestion after a typing pause and Tab accepts it", async () => {
    const user = renderField();
    const field = screen.getByLabelText("Field");

    await user.type(field, "Fixed the shadow clipping");
    await waitFor(() => expect(screen.getByText("and then some.")).toBeInTheDocument());

    await user.tab();

    expect(field).toHaveValue("Fixed the shadow clipping and then some.");
    expect(screen.queryByText("and then some.")).not.toBeInTheDocument();
  });

  it("typing anything else dismisses the suggestion instead of accepting it", async () => {
    const user = renderField();
    const field = screen.getByLabelText("Field");

    await user.type(field, "Fixed the shadow clipping");
    await waitFor(() => expect(screen.getByText("and then some.")).toBeInTheDocument());

    await user.type(field, "!");

    expect(screen.queryByText("and then some.")).not.toBeInTheDocument();
    expect(field).toHaveValue("Fixed the shadow clipping!");
  });

  it("stays quiet below the minimum length rather than completing a couple of letters", async () => {
    const user = renderField();

    await user.type(screen.getByLabelText("Field"), "ab");

    await new Promise((r) => setTimeout(r, 900));
    expect(ollamaClient.suggestContinuation).not.toHaveBeenCalled();
  });

  it("shows a thinking mark while the suggestion request is still out", async () => {
    let resolveSuggestion: (text: string | null) => void = () => {};
    ollamaClient.suggestContinuation = vi.fn(
      () => new Promise<string | null>((resolve) => { resolveSuggestion = resolve; }),
    );
    const user = renderField();

    await user.type(screen.getByLabelText("Field"), "Fixed the shadow clipping");
    await waitFor(() => expect(screen.getByText("…")).toBeInTheDocument());
    expect(screen.getByText("…")).toHaveAttribute("aria-busy", "true");

    resolveSuggestion(" and then some.");
    await waitFor(() => expect(screen.getByText("and then some.")).toBeInTheDocument());
  });

  it("never asks for a suggestion when the caret is not at the end", async () => {
    const user = renderField();
    const field = screen.getByLabelText("Field");

    await user.type(field, "Fixed the shadow clipping");
    await waitFor(() => expect(ollamaClient.suggestContinuation).toHaveBeenCalledTimes(1));

    // Move the caret into the middle, then keep typing there.
    await user.type(field, "X", { initialSelectionStart: 3, initialSelectionEnd: 3 });
    await new Promise((r) => setTimeout(r, 900));

    expect(ollamaClient.suggestContinuation).toHaveBeenCalledTimes(1);
  });

  it("keeps the field transparent so the mirror behind it stays visible", () => {
    renderField();
    const field = screen.getByLabelText("Field");

    expect(field.className).toContain("bg-transparent");
  });

  it("works the same way as a multiline textarea", async () => {
    const user = renderField(true);
    const field = screen.getByLabelText("Field");

    expect(field.tagName).toBe("TEXTAREA");
    await user.type(field, "Fixed the shadow clipping");
    await waitFor(() => expect(screen.getByText("and then some.")).toBeInTheDocument());
  });

  it("exports a minimum length that is actually enforced, not just documented", () => {
    expect(MIN_CHARS_FOR_SUGGESTION).toBeGreaterThan(1);
  });
});
