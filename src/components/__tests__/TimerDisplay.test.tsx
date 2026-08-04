import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { formatElapsed, TimerDisplay } from "../TimerDisplay";

describe("formatElapsed", () => {
  it("formats zero seconds as 00:00:00", () => {
    expect(formatElapsed(0)).toBe("00:00:00");
  });

  it("formats minutes and seconds", () => {
    expect(formatElapsed(65)).toBe("00:01:05");
  });

  it("formats hours", () => {
    expect(formatElapsed(3661)).toBe("01:01:01");
  });
});

describe("TimerDisplay", () => {
  it("renders the elapsed time since clock-in", () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    render(<TimerDisplay clockedInAt={fiveMinutesAgo} events={[]} />);
    // Allow a couple seconds of slack for test execution time.
    const text = screen.getByText(/^00:0[45]:\d{2}$/);
    expect(text).toBeInTheDocument();
  });
});
