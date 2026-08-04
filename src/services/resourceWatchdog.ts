import { invoke } from "@tauri-apps/api/core";

export interface ResourcePressure {
  underPressure: boolean;
  cpuPercent: number;
  memPercent: number;
}

/**
 * Real CPU/memory pressure via the Rust `sysinfo` watchdog (Phase 11) —
 * backs the deferred-job queue and the "tell the user plainly instead
 * of degrading invisibly" rule. Fails soft to "not under pressure" on
 * any error: a broken watchdog check should never itself block real
 * work, since the whole point is staying out of the way until there's
 * an actual reason not to.
 */
export interface ResourceWatchdogClient {
  checkPressure(): Promise<ResourcePressure>;
}

export function createTauriResourceWatchdogClient(): ResourceWatchdogClient {
  return {
    async checkPressure() {
      try {
        const result = await invoke<{ under_pressure: boolean; cpu_percent: number; mem_percent: number }>(
          "check_resource_pressure",
        );
        return {
          underPressure: result.under_pressure,
          cpuPercent: result.cpu_percent,
          memPercent: result.mem_percent,
        };
      } catch {
        return { underPressure: false, cpuPercent: 0, memPercent: 0 };
      }
    },
  };
}
