import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DeviceBar } from "../DeviceBar";

function renderDeviceBar(overrides: Partial<React.ComponentProps<typeof DeviceBar>> = {}) {
  const props = {
    pinned: false,
    onTogglePin: vi.fn(),
    onMinimize: vi.fn(),
    onExpandFullscreen: vi.fn(),
    onExit: vi.fn(),
    ...overrides,
  };
  render(<DeviceBar {...props} />);
  return props;
}

describe("DeviceBar", () => {
  it("renders without crashing", async () => {
    renderDeviceBar();
    expect(await screen.findByText("Mycelia Time")).toBeInTheDocument();
  });

  it("the pin button calls onTogglePin", async () => {
    const user = userEvent.setup();
    const props = renderDeviceBar();

    await user.click(screen.getByTitle("Always on top"));
    expect(props.onTogglePin).toHaveBeenCalledTimes(1);
  });

  it("the expand-to-full-screen button calls onExpandFullscreen", async () => {
    const user = userEvent.setup();
    const props = renderDeviceBar();

    await user.click(screen.getByTitle("Expand to full screen"));
    expect(props.onExpandFullscreen).toHaveBeenCalledTimes(1);
  });

  it("the minimize-to-tray button calls onMinimize", async () => {
    const user = userEvent.setup();
    const props = renderDeviceBar();

    await user.click(screen.getByTitle("Minimize to tray"));
    expect(props.onMinimize).toHaveBeenCalledTimes(1);
  });

  it("the exit button calls onExit", async () => {
    const user = userEvent.setup();
    const props = renderDeviceBar();

    await user.click(screen.getByTitle("Exit"));
    expect(props.onExit).toHaveBeenCalledTimes(1);
  });

  it("a mousedown-drag-mouseup sequence on the bar doesn't throw without a Tauri bridge", async () => {
    renderDeviceBar();
    const bar = screen.getByTestId("device-bar");

    fireEvent.mouseDown(bar, { button: 0, screenX: 100, screenY: 100 });
    fireEvent.mouseMove(document, { screenX: 140, screenY: 130 });
    fireEvent.mouseUp(document);

    expect(screen.getByText("Mycelia Time")).toBeInTheDocument();
  });

  it("mousedown on the pin button doesn't start a window drag", async () => {
    const props = renderDeviceBar();
    const pinBtn = screen.getByTitle("Always on top");

    // stopPropagation on the button means this mousedown never reaches
    // the bar's drag handler.
    fireEvent.mouseDown(pinBtn, { button: 0 });
    expect(props.onTogglePin).not.toHaveBeenCalled();
  });
});
