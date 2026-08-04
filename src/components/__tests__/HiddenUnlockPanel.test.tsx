import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HiddenUnlockPanel } from "../HiddenUnlockPanel";
import { StoreProvider } from "../../store/StoreProvider";
import { initDatabase, type Repositories } from "../../data";
import { createTestExecutor } from "../../data/__tests__/testExecutor";
import type { RewardsClient } from "../../services/rewardsClient";

let repos: Repositories;
let rewardsClient: RewardsClient;

beforeEach(async () => {
  repos = await initDatabase(createTestExecutor());
  rewardsClient = {
    verifyPassword: vi.fn().mockResolvedValue(false),
    listAssets: vi.fn().mockResolvedValue([]),
    readAsset: vi.fn(),
  };
});

function renderPanel(onUnlocked = vi.fn(), onCancel = vi.fn()) {
  const utils = render(
    <StoreProvider repositories={repos} rewardsClient={rewardsClient}>
      <HiddenUnlockPanel onUnlocked={onUnlocked} onCancel={onCancel} />
    </StoreProvider>,
  );
  return { ...utils, onUnlocked, onCancel };
}

function blankPanel() {
  return screen.getByLabelText("blank");
}

describe("HiddenUnlockPanel", () => {
  it("renders a blank panel with no visible text", () => {
    renderPanel();
    const panel = blankPanel();
    expect(panel.textContent).toBe("");
  });

  it("3 clicks, then typing 111, then Enter reveals the password prompt", async () => {
    const user = userEvent.setup();
    renderPanel();
    const panel = blankPanel();

    await user.click(panel);
    await user.click(panel);
    await user.click(panel);
    fireEvent.keyDown(panel, { key: "1" });
    fireEvent.keyDown(panel, { key: "1" });
    fireEvent.keyDown(panel, { key: "1" });
    fireEvent.keyDown(panel, { key: "Enter" });

    expect(await screen.findByRole("dialog", { name: "Unlock rewards" })).toBeInTheDocument();
  });

  it("the wrong number of clicks silently fails to reveal the password prompt", async () => {
    const user = userEvent.setup();
    renderPanel();
    const panel = blankPanel();

    await user.click(panel);
    await user.click(panel);
    fireEvent.keyDown(panel, { key: "1" });
    fireEvent.keyDown(panel, { key: "1" });
    fireEvent.keyDown(panel, { key: "1" });
    fireEvent.keyDown(panel, { key: "Enter" });

    expect(screen.queryByRole("dialog", { name: "Unlock rewards" })).not.toBeInTheDocument();
  });

  it("typing before any clicks land resets that attempt rather than counting toward it", async () => {
    renderPanel();
    const panel = blankPanel();

    // Typing with 0 clicks so far resets silently — confirmed by
    // Enter immediately after doing nothing else, which must not unlock.
    fireEvent.keyDown(panel, { key: "1" });
    fireEvent.keyDown(panel, { key: "Enter" });

    expect(screen.queryByRole("dialog", { name: "Unlock rewards" })).not.toBeInTheDocument();
  });

  it("a reset from premature typing doesn't block a clean, correct attempt afterward", async () => {
    const user = userEvent.setup();
    renderPanel();
    const panel = blankPanel();

    fireEvent.keyDown(panel, { key: "1" }); // premature — resets, but shouldn't lock anything out
    await user.click(panel);
    await user.click(panel);
    await user.click(panel);
    fireEvent.keyDown(panel, { key: "1" });
    fireEvent.keyDown(panel, { key: "1" });
    fireEvent.keyDown(panel, { key: "1" });
    fireEvent.keyDown(panel, { key: "Enter" });

    expect(await screen.findByRole("dialog", { name: "Unlock rewards" })).toBeInTheDocument();
  });

  it("a click after typing has started resets the whole attempt", async () => {
    const user = userEvent.setup();
    renderPanel();
    const panel = blankPanel();

    await user.click(panel);
    await user.click(panel);
    await user.click(panel);
    fireEvent.keyDown(panel, { key: "1" });
    await user.click(panel); // resets everything
    fireEvent.keyDown(panel, { key: "1" });
    fireEvent.keyDown(panel, { key: "1" });
    fireEvent.keyDown(panel, { key: "1" });
    fireEvent.keyDown(panel, { key: "Enter" });

    expect(screen.queryByRole("dialog", { name: "Unlock rewards" })).not.toBeInTheDocument();
  });

  it("Escape cancels from the blank panel", async () => {
    const { onCancel } = renderPanel();
    fireEvent.keyDown(blankPanel(), { key: "Escape" });
    expect(onCancel).toHaveBeenCalled();
  });

  async function reachPasswordPrompt() {
    const user = userEvent.setup();
    const panel = blankPanel();
    await user.click(panel);
    await user.click(panel);
    await user.click(panel);
    fireEvent.keyDown(panel, { key: "1" });
    fireEvent.keyDown(panel, { key: "1" });
    fireEvent.keyDown(panel, { key: "1" });
    fireEvent.keyDown(panel, { key: "Enter" });
    return user;
  }

  it("the correct password calls onUnlocked", async () => {
    rewardsClient.verifyPassword = vi.fn().mockResolvedValue(true);
    const { onUnlocked } = renderPanel();
    const user = await reachPasswordPrompt();

    await user.type(screen.getByLabelText("Password"), "there is no spoon");
    await user.click(screen.getByText("Continue"));

    expect(rewardsClient.verifyPassword).toHaveBeenCalledWith("there is no spoon");
    expect(onUnlocked).toHaveBeenCalled();
  });

  it("the wrong password shows an inline message and does not unlock", async () => {
    rewardsClient.verifyPassword = vi.fn().mockResolvedValue(false);
    const { onUnlocked } = renderPanel();
    const user = await reachPasswordPrompt();

    await user.type(screen.getByLabelText("Password"), "wrong guess");
    await user.click(screen.getByText("Continue"));

    expect(await screen.findByText("Incorrect.")).toBeInTheDocument();
    expect(onUnlocked).not.toHaveBeenCalled();
  });

  it("fails closed (reads as incorrect, doesn't throw) when the password check itself is unreachable", async () => {
    rewardsClient.verifyPassword = vi.fn().mockRejectedValue(new Error("no Tauri bridge in this test"));
    const { onUnlocked } = renderPanel();
    const user = await reachPasswordPrompt();

    await user.type(screen.getByLabelText("Password"), "there is no spoon");
    await user.click(screen.getByText("Continue"));

    expect(await screen.findByText("Incorrect.")).toBeInTheDocument();
    expect(onUnlocked).not.toHaveBeenCalled();
  });

  it("Cancel from the password prompt calls onCancel", async () => {
    const { onCancel } = renderPanel();
    const user = await reachPasswordPrompt();

    await user.click(screen.getByText("Cancel"));

    expect(onCancel).toHaveBeenCalled();
  });
});
