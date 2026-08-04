import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccessibilityOnboarding } from "../AccessibilityOnboarding";
import { StoreProvider } from "../../store/StoreProvider";
import { initDatabase, type Repositories } from "../../data";
import { createTestExecutor } from "../../data/__tests__/testExecutor";

let repos: Repositories;

beforeEach(async () => {
  repos = await initDatabase(createTestExecutor());
});

function renderOnboarding(onDone = vi.fn()) {
  const utils = render(
    <StoreProvider repositories={repos}>
      <AccessibilityOnboarding onDone={onDone} />
    </StoreProvider>,
  );
  return { ...utils, onDone };
}

describe("AccessibilityOnboarding", () => {
  it("both accessibility toggles start checked (on by default)", () => {
    renderOnboarding();
    expect(screen.getByLabelText("Speak the app aloud")).toBeChecked();
    expect(screen.getByLabelText("Let me dictate instead of typing")).toBeChecked();
  });

  it("unchecking a toggle here persists it, same as Settings would", async () => {
    const user = userEvent.setup();
    renderOnboarding();

    await user.click(screen.getByLabelText("Speak the app aloud"));
    expect(screen.getByLabelText("Speak the app aloud")).not.toBeChecked();

    expect(await repos.settings.get("self_voicing_enabled")).toBe("false");
  });

  it("Continue marks the onboarding seen and calls onDone", async () => {
    const user = userEvent.setup();
    const { onDone } = renderOnboarding();

    await user.click(screen.getByText("Continue"));

    expect(onDone).toHaveBeenCalled();
    expect(await repos.settings.get("accessibility_onboarding_seen")).toBe("true");
  });
});
