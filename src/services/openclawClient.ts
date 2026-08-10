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

/** Same pattern as GROK4_ENABLED_KEY — the raw persisted key for Settings' local-model picker (Grok-off fallback), owned here for the same reason. */
export const LOCAL_MODEL_ID_KEY = "local_model_id";

/**
 * The cloud model a request should ideally land on when Grok is
 * enabled. Distinct from LOCAL_MODEL_ID_KEY, which picks the local
 * model for the Grok-off path. Empty means no preference, so the
 * router does no model retry and nothing is ever marked a fallback.
 */
export const PREFERRED_MODEL_KEY = "preferred_model";

/**
 * Every installed local chat model this machine has pulled (confirmed
 * live via `ollama list`, 2026-08-08) — excludes `qwen3-embedding`,
 * which isn't a chat/instruct model. `hermes3:8b` stays the default: it
 * was already OpenClaw's own first configured Ollama fallback entry
 * (confirmed via `openclaw models status --json` during Phase 3
 * planning), reused rather than picking a new default arbitrarily.
 */
export const LOCAL_MODELS = [
  { id: "hermes3:8b", label: "Hermes 3 (8B)" },
  { id: "dolphin-phi:latest", label: "Dolphin Phi (3B, fastest)" },
  { id: "dolphin3:8b", label: "Dolphin 3 (8B)" },
  { id: "mannix/llama3.1-8b-abliterated:q5_K_M", label: "Llama 3.1 (8B, abliterated)" },
  { id: "goekdenizguelmez/JOSIEFIED-Qwen3:8b-q4_k_m", label: "JOSIEfied Qwen3 (8B)" },
  { id: "huihui_ai/qwen3.5-abliterated:9b", label: "Qwen 3.5 (9.7B, abliterated)" },
  { id: "huihui_ai/qwen2.5-vl-abliterated:7b", label: "Qwen 2.5 VL (8.3B, abliterated)" },
  { id: "huihui_ai/qwen3-vl-abliterated:8b", label: "Qwen 3 VL (8.8B, abliterated)" },
  { id: "huihui_ai/qwen3-vl-abliterated:4b", label: "Qwen 3 VL (4.4B, abliterated)" },
  { id: "huihui_ai/gemma3-abliterated:4b", label: "Gemma 3 (4.3B, abliterated, unquantized)" },
] as const;

export const DEFAULT_LOCAL_MODEL_ID = LOCAL_MODELS[0].id;
export const GROK4_MODEL = "xai/grok-4.5";

/**
 * Grok 4.5 is Jeremy's own paid cloud subscription — off by default
 * (his explicit instruction), so every AI call needs to know whether
 * it's allowed to reach for it. `undefined` here means "don't
 * override" — OpenClaw's own default takes over, which today happens
 * to be Grok, so the toggle being on doesn't force anything, it just
 * stops this app from *avoiding* it. When it's off, `localModelId`
 * (Settings' local-model picker) decides which installed Ollama model
 * actually answers.
 */
export function resolveModelOverride(grok4Enabled: boolean, localModelId: string): string | undefined {
  return grok4Enabled ? undefined : `ollama/${localModelId}`;
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

/**
 * One automatic retry for calls that persist a result row (journal/report
 * generation) — a transient blip (or the real, measured ~60s of OpenClaw
 * CLI/gateway overhead this machine has on every call, independent of
 * model or prompt) shouldn't turn into a stuck "failed" on the very first
 * try. Deliberately not used for single-shot fail-soft paths (capture
 * classification, freeform project assist) — those already degrade to a
 * user-facing message/decline instantly, and a silent retry there would
 * just add latency without a matching robustness win.
 */
export async function runOnceWithRetry(
  client: OpenClawClient,
  input: OpenClawCallInput,
): Promise<OpenClawCallResult> {
  try {
    return await client.runOnce(input);
  } catch {
    return await client.runOnce(input);
  }
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
