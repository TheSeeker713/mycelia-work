import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { createTauriResourceWatchdogClient } from "../resourceWatchdog";

afterEach(() => {
  vi.mocked(invoke).mockReset();
});

describe("createTauriResourceWatchdogClient", () => {
  it("maps the Rust snake_case response to camelCase", async () => {
    vi.mocked(invoke).mockResolvedValue({ under_pressure: true, cpu_percent: 92.5, mem_percent: 40.1 });

    const client = createTauriResourceWatchdogClient();
    const result = await client.checkPressure();

    expect(result).toEqual({ underPressure: true, cpuPercent: 92.5, memPercent: 40.1 });
    expect(invoke).toHaveBeenCalledWith("check_resource_pressure");
  });

  it("fails soft to 'not under pressure' when the check itself errors", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("no Tauri bridge in this test"));

    const client = createTauriResourceWatchdogClient();
    const result = await client.checkPressure();

    expect(result).toEqual({ underPressure: false, cpuPercent: 0, memPercent: 0 });
  });
});
