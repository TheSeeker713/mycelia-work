import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { createTauriRewardsClient } from "../rewardsClient";

afterEach(() => {
  vi.mocked(invoke).mockReset();
});

describe("createTauriRewardsClient", () => {
  it("verifyPassword forwards to the verify_rewards_password command", async () => {
    vi.mocked(invoke).mockResolvedValue(true);
    const client = createTauriRewardsClient();

    const result = await client.verifyPassword("there is no spoon");

    expect(result).toBe(true);
    expect(invoke).toHaveBeenCalledWith("verify_rewards_password", { password: "there is no spoon" });
  });

  it("listAssets forwards to the list_reward_assets command", async () => {
    vi.mocked(invoke).mockResolvedValue(["sticker-1.png"]);
    const client = createTauriRewardsClient();

    const result = await client.listAssets();

    expect(result).toEqual(["sticker-1.png"]);
    expect(invoke).toHaveBeenCalledWith("list_reward_assets");
  });

  it("readAsset forwards the filename to the read_reward_asset command", async () => {
    vi.mocked(invoke).mockResolvedValue("data:image/png;base64,abc123");
    const client = createTauriRewardsClient();

    const result = await client.readAsset("sticker-1.png");

    expect(result).toBe("data:image/png;base64,abc123");
    expect(invoke).toHaveBeenCalledWith("read_reward_asset", { filename: "sticker-1.png" });
  });
});
