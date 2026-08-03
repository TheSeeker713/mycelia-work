import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DeviceBar } from "../DeviceBar";

describe("DeviceBar", () => {
  it("renders outside a Tauri webview without crashing", async () => {
    render(<DeviceBar />);
    expect(await screen.findByText("Mycelia Time")).toBeInTheDocument();
  });

  it("the pin button doesn't throw when clicked without a Tauri bridge", async () => {
    const user = userEvent.setup();
    render(<DeviceBar />);

    const pinBtn = screen.getByTitle("Always on top");
    await user.click(pinBtn);
    // No Tauri bridge in jsdom, so the toggle silently no-ops rather than
    // flipping state — this just confirms it doesn't crash the component.
    expect(pinBtn).toBeInTheDocument();
  });
});
