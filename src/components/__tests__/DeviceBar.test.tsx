import { fireEvent, render, screen } from "@testing-library/react";
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

  it("the emergency exit button doesn't throw when clicked without a Tauri bridge", async () => {
    const user = userEvent.setup();
    render(<DeviceBar />);

    const exitBtn = screen.getByTitle("Emergency exit — fully closes the app");
    await user.click(exitBtn);
    expect(exitBtn).toBeInTheDocument();
  });

  it("a mousedown-drag-mouseup sequence on the bar doesn't throw without a Tauri bridge", async () => {
    render(<DeviceBar />);
    const bar = screen.getByTestId("device-bar");

    fireEvent.mouseDown(bar, { button: 0, screenX: 100, screenY: 100 });
    fireEvent.mouseMove(document, { screenX: 140, screenY: 130 });
    fireEvent.mouseUp(document);

    expect(screen.getByText("Mycelia Time")).toBeInTheDocument();
  });

  it("mousedown on the pin button doesn't start a window drag", async () => {
    render(<DeviceBar />);
    const pinBtn = screen.getByTitle("Always on top");

    // stopPropagation on the button means this mousedown never reaches
    // the bar's drag handler — nothing to assert on the drag itself
    // (there's no Tauri bridge to move a window through anyway), just
    // that it doesn't throw.
    fireEvent.mouseDown(pinBtn, { button: 0 });
    expect(pinBtn).toBeInTheDocument();
  });
});
