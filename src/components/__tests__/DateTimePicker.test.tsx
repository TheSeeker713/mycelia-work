import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DateTimePicker } from "../DateTimePicker";

/** A real controlled wrapper, since `onChange` alone (a bare mock) never feeds a new `value` back in — chained interactions need actual state to build on each other, same as any real caller. */
function ControlledPicker({ initial }: { initial: string | null }) {
  const [value, setValue] = useState(initial);
  return <DateTimePicker value={value} onChange={setValue} />;
}

const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

describe("DateTimePicker", () => {
  it("starts on the Date tab with no day selected when value is null", () => {
    render(<DateTimePicker value={null} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Date" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText(/at \d\d:\d\d/)).not.toBeInTheDocument();
  });

  it("clicking the 15th of the currently viewed month commits that date", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DateTimePicker value={null} onChange={onChange} />);

    const now = new Date();
    const label = MONTH_LABELS[now.getMonth()];
    await user.click(screen.getByRole("button", { name: `${label} 15, ${now.getFullYear()}` }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const iso = onChange.mock.calls[0][0] as string;
    const committed = new Date(iso);
    expect(committed.getDate()).toBe(15);
    expect(committed.getMonth()).toBe(now.getMonth());
    expect(committed.getHours()).toBe(0);
    expect(committed.getMinutes()).toBe(0);
  });

  it("switching to the Time tab before a date is picked prompts to pick a date first", async () => {
    const user = userEvent.setup();
    render(<DateTimePicker value={null} onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Time" }));
    expect(screen.getByText("Pick a date first.")).toBeInTheDocument();
  });

  it("with a value already set, the Time tab shows hour/minute selects and changing them preserves the date", async () => {
    const user = userEvent.setup();
    // Constructed as a local date/time (not a hand-authored UTC string) so
    // this doesn't depend on the test runner's timezone offset.
    const initial = new Date(2026, 8, 15, 9, 0).toISOString();
    render(<ControlledPicker initial={initial} />);

    await user.click(screen.getByRole("button", { name: "Time" }));
    await user.selectOptions(screen.getByLabelText("Hour"), "14");
    await user.selectOptions(screen.getByLabelText("Minute"), "30");

    const summary = screen.getByText(/at 14:30/);
    expect(summary.textContent).toContain("14:30");
    expect(summary.textContent).toMatch(/15/);
  });

  it("shows a friendly summary line when a value is set", () => {
    const value = new Date(2026, 8, 15, 14, 30).toISOString();
    render(<DateTimePicker value={value} onChange={vi.fn()} />);
    expect(screen.getByText(/14:30/)).toBeInTheDocument();
  });

  it("Clear calls onChange with null", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const value = new Date(2026, 8, 15, 14, 30).toISOString();
    render(<DateTimePicker value={value} onChange={onChange} />);

    await user.click(screen.getByText("Clear"));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("month navigation moves the calendar forward and back", async () => {
    const user = userEvent.setup();
    render(<DateTimePicker value={null} onChange={vi.fn()} />);
    const now = new Date();
    expect(screen.getByText(`${MONTH_LABELS[now.getMonth()]} ${now.getFullYear()}`)).toBeInTheDocument();

    await user.click(screen.getByLabelText("Next month"));
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    expect(screen.getByText(`${MONTH_LABELS[next.getMonth()]} ${next.getFullYear()}`)).toBeInTheDocument();

    await user.click(screen.getByLabelText("Previous month"));
    await user.click(screen.getByLabelText("Previous month"));
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    expect(screen.getByText(`${MONTH_LABELS[prev.getMonth()]} ${prev.getFullYear()}`)).toBeInTheDocument();
  });
});
