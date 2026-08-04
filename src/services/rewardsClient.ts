import { invoke } from "@tauri-apps/api/core";

/**
 * Thin wrapper around the three Rust commands backing the hidden
 * Rewards/18+ unlock (src-tauri/src/rewards.rs) — password verification
 * happens in Rust (against a hash, not a plaintext string sitting in
 * this file), and the asset files themselves live entirely outside
 * `src/` (Tauri's app-data directory), so nothing here can end up in
 * the public repo or the built app by accident.
 */
export interface RewardsClient {
  verifyPassword(password: string): Promise<boolean>;
  listAssets(): Promise<string[]>;
  readAsset(filename: string): Promise<string>;
}

export function createTauriRewardsClient(): RewardsClient {
  return {
    verifyPassword(password) {
      return invoke<boolean>("verify_rewards_password", { password });
    },
    listAssets() {
      return invoke<string[]>("list_reward_assets");
    },
    readAsset(filename) {
      return invoke<string>("read_reward_asset", { filename });
    },
  };
}
