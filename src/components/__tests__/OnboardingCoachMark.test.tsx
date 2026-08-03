import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { OnboardingCoachMark } from "../OnboardingCoachMark";

describe("OnboardingCoachMark", () => {
  it("shows the first tip and a 1/2 counter", () => {
    render(<OnboardingCoachMark onDismiss={vi.fn()} />);
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    expect(screen.getByText(/emergency exit/)).toBeInTheDocument();
  });

  it("Next advances to the second tip, then the button reads Done", async () => {
    const user = userEvent.setup();
    render(<OnboardingCoachMark onDismiss={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Next →" }));

    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    expect(screen.getByText(/Pull a tab on the right/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
  });

  it("Done on the last tip calls onDismiss", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<OnboardingCoachMark onDismiss={onDismiss} />);

    await user.click(screen.getByRole("button", { name: "Next →" }));
    await user.click(screen.getByRole("button", { name: "Done" }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("the skip (✕) button calls onDismiss immediately from any step", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<OnboardingCoachMark onDismiss={onDismiss} />);

    await user.click(screen.getByTitle("Skip all"));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
