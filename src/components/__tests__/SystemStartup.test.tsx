import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HARD_TIMEOUT_MS,
  STARTUP_WEIGHT,
  STARTUP_WEIGHT_TOTAL,
  startupPercent,
  SystemStartup,
  VOICE_MAX_WAIT_MS,
} from "../SystemStartup";
import { StoreProvider } from "../../store/StoreProvider";
import { initDatabase, type Repositories } from "../../data";
import { createTestExecutor } from "../../data/__tests__/testExecutor";
import type { OpenClawClient } from "../../services/openclawClient";
import type { OllamaClient } from "../../services/ollamaClient";
import type { VoiceClient } from "../../services/voiceClient";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: vi.fn().mockResolvedValue(true),
  requestPermission: vi.fn().mockResolvedValue("granted"),
}));

import { invoke } from "@tauri-apps/api/core";
import { isPermissionGranted, requestPermission } from "@tauri-apps/plugin-notification";

let repos: Repositories;
let openClawClient: OpenClawClient;
let ollamaClient: OllamaClient;
let voiceClient: VoiceClient;

beforeEach(async () => {
  repos = await initDatabase(createTestExecutor());
  vi.mocked(invoke).mockReset();
  vi.mocked(invoke).mockResolvedValue(undefined);
  vi.mocked(isPermissionGranted).mockReset().mockResolvedValue(true);
  vi.mocked(requestPermission).mockReset().mockResolvedValue("granted");
  openClawClient = {
    runOnce: vi.fn(),
    ensureDaemon: vi.fn().mockResolvedValue(true),
    call: vi.fn(),
    releaseDaemon: vi.fn(),
    cancelActiveCall: vi.fn(),
  };
  ollamaClient = {
    suggestContinuation: vi.fn(),
    classifyOnTopic: vi.fn(),
    warmUpGhostText: vi.fn(),
    warmUpModel: vi.fn(),
    isAvailable: vi.fn().mockResolvedValue(true),
    generateReport: vi.fn(),
  };
  voiceClient = {
    speak: vi.fn(),
    transcribe: vi.fn(),
    isTtsAvailable: vi.fn().mockResolvedValue(true),
    isSttAvailable: vi.fn().mockResolvedValue(true),
  };
});

afterEach(() => {
  vi.useRealTimers();
});

function renderStartup(onDone = vi.fn()) {
  render(
    <StoreProvider
      repositories={repos}
      openClawClient={openClawClient}
      ollamaClient={ollamaClient}
      voiceClient={voiceClient}
    >
      <SystemStartup onDone={onDone} />
    </StoreProvider>,
  );
  return { onDone };
}

describe("SystemStartup", () => {
  it("checks all three backends and finishes on its own once everything's online", async () => {
    const { onDone } = renderStartup();

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(ollamaClient.isAvailable).toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith("ensure_voice_agent_running");
    expect(screen.getByRole("progressbar", { name: "Starting local services" })).toBeInTheDocument();
  });

  it("skips starting OpenClaw when the probe already finds it up", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd) => {
      if (cmd === "openclaw_probe_daemon") return true;
      return undefined;
    });
    const { onDone } = renderStartup();

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(openClawClient.ensureDaemon).not.toHaveBeenCalled();
  });

  it("starts OpenClaw only when the probe finds it down", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd) => {
      if (cmd === "openclaw_probe_daemon") return false;
      return undefined;
    });
    const { onDone } = renderStartup();

    await waitFor(() => expect(openClawClient.ensureDaemon).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  });

  it("requests notification permission once, only when not already granted", async () => {
    vi.mocked(isPermissionGranted).mockResolvedValue(false);
    renderStartup();

    await waitFor(() => expect(isPermissionGranted).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(requestPermission).toHaveBeenCalledTimes(1));
  });

  it("doesn't re-request notification permission when it's already granted", async () => {
    vi.mocked(isPermissionGranted).mockResolvedValue(true);
    const { onDone } = renderStartup();

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("warms the settings-selected local model once Ollama is confirmed reachable", async () => {
    renderStartup();

    await waitFor(() => expect(ollamaClient.warmUpModel).toHaveBeenCalledWith("hermes3:8b"));
  });

  it("never warms the model when Ollama isn't reachable", async () => {
    ollamaClient.isAvailable = vi.fn().mockResolvedValue(false);
    const { onDone } = renderStartup();

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(ollamaClient.warmUpModel).not.toHaveBeenCalled();
  });

  it("still finishes when OpenClaw's daemon fails to start — one backend down doesn't block the others", async () => {
    openClawClient.ensureDaemon = vi.fn().mockRejectedValue(new Error("daemon start failed"));
    const { onDone } = renderStartup();

    expect(await screen.findByText("—")).toBeInTheDocument();
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  });

  it("reports Ollama as unavailable after a fail-soft start attempt when it stays down", async () => {
    ollamaClient.isAvailable = vi.fn().mockResolvedValue(false);
    const { onDone } = renderStartup();

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(invoke).toHaveBeenCalledWith("ensure_ollama_running");
    expect(ollamaClient.warmUpModel).not.toHaveBeenCalled();
  });

  it("does not spawn Ollama when it is already reachable", async () => {
    ollamaClient.isAvailable = vi.fn().mockResolvedValue(true);
    const { onDone } = renderStartup();

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(invoke).not.toHaveBeenCalledWith("ensure_ollama_running");
  });

  it("launches the voice-agent stack and polls until it reports healthy", async () => {
    vi.useFakeTimers();
    let call = 0;
    voiceClient.isTtsAvailable = vi.fn().mockImplementation(() => {
      call += 1;
      return Promise.resolve(call >= 3);
    });
    const { onDone } = renderStartup();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(voiceClient.isTtsAvailable).toHaveBeenCalledTimes(3);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("Continue now finishes immediately, regardless of what's still checking", async () => {
    // Never resolve — simulates every backend hanging.
    openClawClient.ensureDaemon = vi.fn(() => new Promise<boolean>(() => {}));
    ollamaClient.isAvailable = vi.fn(() => new Promise<boolean>(() => {}));
    voiceClient.isTtsAvailable = vi.fn(() => new Promise<boolean>(() => {}));
    const user = userEvent.setup();
    const { onDone } = renderStartup();

    await user.click(screen.getByText("Continue now"));

    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("never blocks indefinitely — a hard timeout finishes on its own if a check hangs", async () => {
    vi.useFakeTimers();
    openClawClient.ensureDaemon = vi.fn(() => new Promise<boolean>(() => {}));
    ollamaClient.isAvailable = vi.fn(() => new Promise<boolean>(() => {}));
    voiceClient.isTtsAvailable = vi.fn(() => new Promise<boolean>(() => {}));
    const { onDone } = renderStartup();

    expect(onDone).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(HARD_TIMEOUT_MS);
    });

    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("startupPercent is determinate, not an infinite spinner", () => {
    expect(startupPercent(0)).toBe(0);
    expect(startupPercent(STARTUP_WEIGHT_TOTAL)).toBe(100);
    expect(startupPercent(STARTUP_WEIGHT.openclawProbe)).toBeGreaterThan(0);
    expect(startupPercent(STARTUP_WEIGHT.openclawProbe)).toBeLessThan(100);
  });

  it("gives up waiting on voice past its own max wait and reports unavailable, without blocking the hard timeout", async () => {
    vi.useFakeTimers();
    voiceClient.isTtsAvailable = vi.fn().mockResolvedValue(false);
    const { onDone } = renderStartup();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(VOICE_MAX_WAIT_MS + 1000);
    });

    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
