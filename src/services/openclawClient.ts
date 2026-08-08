import { invoke } from "@tauri-apps/api/core";

export interface OpenClawCallInput {
  sessionKey: string;
  message: string;
  timeoutSecs?: number;
  /** Explicit `--model` override — if omitted, OpenClaw's own configured default applies (currently Grok 4.5). Callers normally get this from `resolveModelOverride()` below rather than hardcoding it. */
  model?: string;
}

export interface OpenClawCallResult {
  text: string;
  model: string;
}

/**
 * Same key settingsStore.ts persists the "Use Grok 4.5 (cloud)" toggle
 * under — owned here since this is the module that actually needs to
 * read the raw persisted value (stores that call the AI service
 * functions don't have reactive access to settingsStore, only to
 * `repos`), and settingsStore imports it from here rather than
 * declaring a second copy that could drift.
 */
export const GROK4_ENABLED_KEY = "grok4_enabled";

/**
 * OpenClaw's own configured Ollama fallback chain (confirmed live via
 * `openclaw models status --json` during Phase 3 planning) — the first,
 * most well-rounded entry is reused here as the explicit local model
 * when the cloud toggle is off, rather than inventing a separate
 * choice.
 */
export const LOCAL_FALLBACK_MODEL = "ollama/hermes3:8b";
export const GROK4_MODEL = "xai/grok-4.5";

/**
 * Grok 4.5 is Jeremy's own paid cloud subscription — off by default
 * (his explicit instruction), so every AI call needs to know whether
 * it's allowed to reach for it. `undefined` here means "don't
 * override" — OpenClaw's own default takes over, which today happens
 * to be Grok, so the toggle being on doesn't force anything, it just
 * stops this app from *avoiding* it.
 */
export function resolveModelOverride(grok4Enabled: boolean): string | undefined {
  return grok4Enabled ? undefined : LOCAL_FALLBACK_MODEL;
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
  /** The non-instant exit flow's "quit now anyway" path — kills whatever agent call is currently in flight, if any. */
  cancelActiveCall(): Promise<void>;
}

export function createTauriOpenClawClient(): OpenClawClient {
  return {
    runOnce(input) {
      return invoke<OpenClawCallResult>("run_openclaw_agent", {
        sessionKey: input.sessionKey,
        message: input.message,
        timeoutSecs: input.timeoutSecs,
        model: input.model,
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
        model: input.model,
      });
    },
    releaseDaemon(wasAlreadyRunning) {
      return invoke<void>("openclaw_release_daemon", { wasAlreadyRunning });
    },
    cancelActiveCall() {
      return invoke<void>("cancel_active_agent_call");
    },
  };
}
