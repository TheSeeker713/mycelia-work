import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { PocketShell } from "./PocketShell";
import { useOllamaClient, useOpenClawClient, useVoiceClient } from "../store/StoreProvider";

type CheckStatus = "checking" | "online" | "unavailable";

interface Checks {
  openclaw: CheckStatus;
  voice: CheckStatus;
  ollama: CheckStatus;
}

const CHECK_LABELS: Record<keyof Checks, string> = {
  openclaw: "AI assistant",
  voice: "Voice",
  ollama: "Local AI model",
};

/** How often the voice stack's health endpoint gets polled while start_all.ps1 is bringing Piper/faster-whisper up. */
export const VOICE_POLL_INTERVAL_MS = 1000;
/** Generous — a cold Piper/faster-whisper start is the slowest thing this screen waits on. Past this, voice just reports unavailable; the app already handles that everywhere else. */
export const VOICE_MAX_WAIT_MS = 20_000;
/** A real ceiling so this screen never blocks the user indefinitely, even if something above hangs in a way its own checks don't catch. */
export const HARD_TIMEOUT_MS = 25_000;

const STATUS_GLYPH: Record<CheckStatus, string> = {
  checking: "…",
  online: "✓",
  unavailable: "—",
};

const STATUS_COLOR: Record<CheckStatus, string> = {
  checking: "var(--ink-faint)",
  online: "var(--moss)",
  unavailable: "var(--ink-faint)",
};

/**
 * The initializing phase Jeremy asked for, ahead of onboarding: checks
 * whether the local AI backends this app depends on are up, and starts
 * the ones it can (OpenClaw's daemon via the existing ensureDaemon,
 * the Voice-Agent Piper/faster-whisper stack via start_all.ps1) rather
 * than just reporting them down. Ollama isn't something this app knows
 * how to start (no known launch command, unlike the other two), so
 * that check is report-only.
 *
 * Never blocks indefinitely — a hard timeout and an always-available
 * "Continue now" both move on regardless of what's still not ready.
 * Every AI call site in the app already fails soft when its backend
 * isn't reachable; this screen exists to make that the exception
 * instead of the common case, not to gate access to the app.
 */
export function SystemStartup({ onDone }: { onDone: () => void }) {
  const openClawClient = useOpenClawClient();
  const voiceClient = useVoiceClient();
  const ollamaClient = useOllamaClient();
  const [checks, setChecks] = useState<Checks>({
    openclaw: "checking",
    voice: "checking",
    ollama: "checking",
  });
  const doneRef = useRef(false);

  function finish() {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  }

  useEffect(() => {
    let cancelled = false;

    async function checkOpenClaw() {
      try {
        await openClawClient.ensureDaemon();
        if (!cancelled) setChecks((c) => ({ ...c, openclaw: "online" }));
      } catch {
        if (!cancelled) setChecks((c) => ({ ...c, openclaw: "unavailable" }));
      }
    }

    async function checkOllama() {
      const available = await ollamaClient.isAvailable();
      if (!cancelled) setChecks((c) => ({ ...c, ollama: available ? "online" : "unavailable" }));
    }

    async function checkVoice() {
      try {
        await invoke("ensure_voice_agent_running");
      } catch {
        // Best-effort — the poll loop below reports the real state either way.
      }
      const deadline = Date.now() + VOICE_MAX_WAIT_MS;
      while (!cancelled) {
        const up = await voiceClient.isTtsAvailable();
        if (up) {
          if (!cancelled) setChecks((c) => ({ ...c, voice: "online" }));
          return;
        }
        if (Date.now() >= deadline) {
          if (!cancelled) setChecks((c) => ({ ...c, voice: "unavailable" }));
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, VOICE_POLL_INTERVAL_MS));
      }
    }

    void checkOpenClaw();
    void checkOllama();
    void checkVoice();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setTimeout(finish, HARD_TIMEOUT_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const allSettled = (Object.values(checks) as CheckStatus[]).every((s) => s !== "checking");
    if (allSettled) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checks]);

  return (
    <PocketShell>
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6">
        <div className="text-[0.82rem] font-semibold text-[var(--ink)]">Mycelia Time</div>
        <div className="flex w-full flex-col gap-2">
          {(Object.keys(CHECK_LABELS) as (keyof Checks)[]).map((key) => (
            <div key={key} className="flex items-center justify-between text-[0.78rem]">
              <span className="text-[var(--ink-soft)]">{CHECK_LABELS[key]}</span>
              <span style={{ color: STATUS_COLOR[checks[key]] }}>{STATUS_GLYPH[checks[key]]}</span>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={finish}
          className="mt-2 text-[0.72rem] text-[var(--ink-faint)] underline"
        >
          Continue now
        </button>
      </div>
    </PocketShell>
  );
}
