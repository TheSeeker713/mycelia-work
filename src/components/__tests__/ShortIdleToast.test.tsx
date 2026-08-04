import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ShortIdleToast } from "../ShortIdleToast";

describe("ShortIdleToast", () => {
  it("shows the rounded-minutes idle message", () => {
    render(
      <ShortIdleToast idleSeconds={185} onKeepAsWork={vi.fn()} onLogAsBreak={vi.fn()} />,
    );
    expect(screen.getByText(/You've been away ~3 min/)).toBeInTheDocument();
  });

  it("Keep as work calls onKeepAsWork", async () => {
    const user = userEvent.setup();
    const onKeepAsWork = vi.fn();
    render(
      <ShortIdleToast idleSeconds={185} onKeepAsWork={onKeepAsWork} onLogAsBreak={vi.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: "Keep as work" }));
    expect(onKeepAsWork).toHaveBeenCalledTimes(1);
  });

  it("Log as break calls onLogAsBreak", async () => {
    const user = userEvent.setup();
    const onLogAsBreak = vi.fn();
    render(
      <ShortIdleToast idleSeconds={185} onKeepAsWork={vi.fn()} onLogAsBreak={onLogAsBreak} />,
    );

    await user.click(screen.getByRole("button", { name: "Log as break" }));
    expect(onLogAsBreak).toHaveBeenCalledTimes(1);
  });

  it("auto-dismisses (calls onKeepAsWork) after 30s if ignored", () => {
    vi.useFakeTimers();
    try {
      const onKeepAsWork = vi.fn();
      render(
        <ShortIdleToast idleSeconds={185} onKeepAsWork={onKeepAsWork} onLogAsBreak={vi.fn()} />,
      );

      expect(onKeepAsWork).not.toHaveBeenCalled();
      vi.advanceTimersByTime(30_000);
      expect(onKeepAsWork).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
