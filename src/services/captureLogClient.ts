import { invoke } from "@tauri-apps/api/core";
import type { CaptureAction } from "./captureAgent";
import type { AssistAction } from "./projectAssist";

export interface CaptureLogEntry {
  occurredAt: string;
  inputText: string;
  action: CaptureAction;
  clarifyingQuestion?: string;
  declineReason?: string;
}

export interface AiAssistLogEntry {
  occurredAt: string;
  projectId: string;
  action: AssistAction | "status_report";
  resultSummary?: string;
}

/**
 * Local-first logging, shared by two features per the same policy
 * (docs/reference/capture-agent-guide.md's "Logging" section, extended
 * to Phase 10's AI assist actions per the plan's "still logged locally
 * per Phase 9's logging policy"): declines and clarify exchanges get
 * logged too, not just successful routes, and the same is true for the
 * assist panel's transient (non-persisted) actions. Injectable like
 * every other client (openClawClient, voiceClient, ...) so tests pass
 * a fake instead of hitting the real Tauri command.
 */
export interface CaptureLogClient {
  log(entry: CaptureLogEntry): Promise<void>;
  logAiAssist(entry: AiAssistLogEntry): Promise<void>;
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

    async logAiAssist(entry) {
      const date = entry.occurredAt.slice(0, 10);
      await invoke<void>("append_capture_log", {
        date,
        entryJson: JSON.stringify(entry),
      });
    },
  };
}
