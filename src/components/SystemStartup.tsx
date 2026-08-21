import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isPermissionGranted, requestPermission } from "@tauri-apps/plugin-notification";
import { Shell } from "./Shell";
import { useOllamaClient, useOpenClawClient, useSettingsStore, useVoiceClient } from "../store/StoreProvider";

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

/**
 * Step-weighted splash: probe / start-if-down / verify for OpenClaw
 * and Ollama, then Voice. Start slices are skipped (instant credit)
 * when the probe already found the service up. Weights add to 10.
 */
export const STARTUP_WEIGHT = {
  openclawProbe: 1,
  openclawStart: 2,
  openclawVerify: 1,
  ollamaProbe: 1,
  ollamaStart: 2,
  ollamaVerify: 1,
  voice: 2,
} as const;

export const STARTUP_WEIGHT_TOTAL = Object.values(STARTUP_WEIGHT).reduce((a, b) => a + b, 0);

export function startupPercent(completedWeight: number): number {
  return Math.min(100, Math.round((completedWeight / STARTUP_WEIGHT_TOTAL) * 100));
}

const STATUS_COLOR: Record<CheckStatus, string> = {
  checking: "var(--ink-faint)",
  online: "var(--moss)",
  unavailable: "var(--ink-faint)",
};

/**
 * Startup checklist with a determinate, step-weighted bar. Starts
 * OpenClaw and Ollama only when they're down; always verifies. Voice
 * still uses ensure_voice_agent_running. Fail-soft — Continue now and
 * the hard timeout both move on.
 */
export function SystemStartup({ onDone }: { onDone: () => void }) {
  const openClawClient = useOpenClawClient();
  const voiceClient = useVoiceClient();
  const ollamaClient = useOllamaClient();
  const localModelId = useSettingsStore((s) => s.localModelId);
  const [checks, setChecks] = useState<Checks>({
    openclaw: "checking",
    voice: "checking",
    ollama: "checking",
  });
  const [completedWeight, setCompletedWeight] = useState(0);
  const doneRef = useRef(false);

  function finish() {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  }

  useEffect(() => {
    let cancelled = false;

    function credit(weight: number) {
      if (!cancelled) setCompletedWeight((w) => w + weight);
    }

    async function probeOpenClaw(): Promise<boolean> {
      try {
        return await invoke<boolean>("openclaw_probe_daemon");
      } catch {
        return false;
      }
    }

    async function runOpenClaw() {
      const alreadyUp = await probeOpenClaw();
      credit(STARTUP_WEIGHT.openclawProbe);
      if (!alreadyUp) {
        try {
          await openClawClient.ensureDaemon();
        } catch {
          // Verify below reports the real state.
        }
      }
      credit(STARTUP_WEIGHT.openclawStart);
      const up = alreadyUp || (await probeOpenClaw());
      credit(STARTUP_WEIGHT.openclawVerify);
      if (!cancelled) setChecks((c) => ({ ...c, openclaw: up ? "online" : "unavailable" }));
    }

    async function runOllama() {
      let available = await ollamaClient.isAvailable();
      credit(STARTUP_WEIGHT.ollamaProbe);
      if (!available) {
        try {
          available = Boolean(await invoke<boolean>("ensure_ollama_running"));
        } catch {
          available = false;
        }
        if (!available) {
          available = await ollamaClient.isAvailable();
        }
      }
      credit(STARTUP_WEIGHT.ollamaStart);
      if (available) ollamaClient.warmUpModel(localModelId);
      credit(STARTUP_WEIGHT.ollamaVerify);
      if (!cancelled) setChecks((c) => ({ ...c, ollama: available ? "online" : "unavailable" }));
    }

    async function runVoice() {
      try {
        await invoke("ensure_voice_agent_running");
      } catch {
        // Best-effort — the poll loop below reports the real state either way.
      }
      const deadline = Date.now() + VOICE_MAX_WAIT_MS;
      while (!cancelled) {
        const up = await voiceClient.isTtsAvailable();
        if (up) {
          credit(STARTUP_WEIGHT.voice);
          if (!cancelled) setChecks((c) => ({ ...c, voice: "online" }));
          return;
        }
        if (Date.now() >= deadline) {
          credit(STARTUP_WEIGHT.voice);
          if (!cancelled) setChecks((c) => ({ ...c, voice: "unavailable" }));
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, VOICE_POLL_INTERVAL_MS));
      }
    }

    async function requestNotificationPermission() {
      try {
        const granted = await isPermissionGranted();
        if (!granted) await requestPermission();
      } catch {
        // Best-effort — real todo alerts still speak the cue either way,
        // the Windows toast just won't show without permission.
      }
    }

    async function runSequence() {
      await runOpenClaw();
      if (cancelled) return;
      await runOllama();
      if (cancelled) return;
      await runVoice();
    }

    void runSequence();
    void requestNotificationPermission();

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

  const percent = startupPercent(completedWeight);

  return (
    <Shell mode="pocket">
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6">
        <div className="text-[0.82rem] font-semibold text-[var(--ink)]">Mycelia Time</div>
        <div
          role="progressbar"
          aria-label="Starting local services"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--line)]"
        >
          <div
            className="h-full rounded-full bg-[var(--moss)] transition-[width] duration-200"
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="flex w-full flex-col gap-2">
          {(Object.keys(CHECK_LABELS) as (keyof Checks)[]).map((key) => (
            <div key={key} className="flex items-center justify-between text-[0.78rem]">
              <span className="text-[var(--ink-soft)]">{CHECK_LABELS[key]}</span>
              <span style={{ color: STATUS_COLOR[checks[key]] }}>
                {checks[key] === "checking" ? "…" : checks[key] === "online" ? "✓" : "—"}
              </span>
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
    </Shell>
  );
}
