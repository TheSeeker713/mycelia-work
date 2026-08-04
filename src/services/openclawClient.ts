import { invoke } from "@tauri-apps/api/core";

export interface OpenClawCallInput {
  sessionKey: string;
  message: string;
  timeoutSecs?: number;
}

export interface OpenClawCallResult {
  text: string;
  model: string;
}

/**
 * Talks to the local OpenClaw install via the Rust subprocess wrapper.
 * Injectable (like `SqlExecutor`/`Repositories`) so journal generation
 * and the adaptive check-in conversation can be tested against a fake
 * implementation instead of a real Tauri bridge or a live model call.
 */
export interface OpenClawClient {
  /** One-off call: wakes the Gateway if needed, calls, puts it back to sleep if this call woke it. */
  runOnce(input: OpenClawCallInput): Promise<OpenClawCallResult>;
  /** For a multi-turn exchange — wake the Gateway once, make several `call`s, `releaseDaemon` once at the end. */
  ensureDaemon(): Promise<boolean>;
  call(input: OpenClawCallInput): Promise<OpenClawCallResult>;
  releaseDaemon(wasAlreadyRunning: boolean): Promise<void>;
}

export function createTauriOpenClawClient(): OpenClawClient {
  return {
    runOnce(input) {
      return invoke<OpenClawCallResult>("run_openclaw_agent", {
        sessionKey: input.sessionKey,
        message: input.message,
        timeoutSecs: input.timeoutSecs,
      });
    },
    ensureDaemon() {
      return invoke<boolean>("openclaw_ensure_daemon");
    },
    call(input) {
      return invoke<OpenClawCallResult>("openclaw_call_agent", {
        sessionKey: input.sessionKey,
        message: input.message,
        timeoutSecs: input.timeoutSecs,
      });
    },
    releaseDaemon(wasAlreadyRunning) {
      return invoke<void>("openclaw_release_daemon", { wasAlreadyRunning });
    },
  };
}
