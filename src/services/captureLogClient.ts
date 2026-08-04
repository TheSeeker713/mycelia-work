import { invoke } from "@tauri-apps/api/core";
import type { CaptureAction } from "./captureAgent";

export interface CaptureLogEntry {
  occurredAt: string;
  inputText: string;
  action: CaptureAction;
  clarifyingQuestion?: string;
  declineReason?: string;
}

/**
 * Local-first logging for every capture-agent interaction, per
 * docs/reference/capture-agent-guide.md — declines and clarify
 * exchanges get logged too, not just successful routes. Injectable
 * like every other client (openClawClient, voiceClient, ...) so tests
 * pass a fake instead of hitting the real Tauri command.
 */
export interface CaptureLogClient {
  log(entry: CaptureLogEntry): Promise<void>;
}

export function createTauriCaptureLogClient(): CaptureLogClient {
  return {
    async log(entry) {
      const date = entry.occurredAt.slice(0, 10);
      await invoke<void>("append_capture_log", {
        date,
        entryJson: JSON.stringify(entry),
      });
    },
  };
}
