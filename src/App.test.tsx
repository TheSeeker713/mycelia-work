import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  it("degrades gracefully outside a Tauri webview instead of crashing", async () => {
    // No Tauri IPC bridge exists in jsdom, so DbProvider's real database
    // open will fail — this just confirms that failure is caught and
    // shown, not left as an unhandled rejection or a blank screen.
    render(<App />);
    expect(
      await screen.findByText(/Loading…|Couldn't open the database/),
    ).toBeInTheDocument();
  });
});
