// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONNECT_ATTEMPTS, MODEL_RETRY_ATTEMPTS, routeAiCall } from "../aiBackendRouter";
import type { OpenClawClient } from "../openclawClient";
import type { OllamaClient } from "../ollamaClient";

let openClaw: OpenClawClient;
let ollama: OllamaClient;

const input = { sessionKey: "s", message: "write something", timeoutSecs: 180 };

function route(overrides: Partial<Parameters<typeof routeAiCall>[0]> = {}) {
  return routeAiCall({
    openClaw,
    ollama,
    input,
    localModelId: "hermes3:8b",
    localTimeoutSecs: 90,
    ...overrides,
  });
}

beforeEach(() => {
  openClaw = {
    runOnce: vi.fn().mockResolvedValue({ text: "answer", model: "xai/grok-4.5" }),
    ensureDaemon: vi.fn(),
    call: vi.fn(),
    releaseDaemon: vi.fn(),
    cancelActiveCall: vi.fn(),
  };
  ollama = {
    suggestContinuation: vi.fn(),
    classifyOnTopic: vi.fn(),
    warmUpGhostText: vi.fn(),
    warmUpModel: vi.fn(),
    isAvailable: vi.fn().mockResolvedValue(true),
    generateReport: vi.fn().mockResolvedValue("local answer"),
  };
});

describe("routeAiCall", () => {
  it("reports the OpenClaw backend on a clean first-try success", async () => {
    const result = await route();

    expect(result).toMatchObject({ text: "answer", model: "xai/grok-4.5", backend: "openclaw" });
    expect(result.usedFallback).toBe(false);
    expect(openClaw.runOnce).toHaveBeenCalledTimes(1);
    expect(ollama.generateReport).not.toHaveBeenCalled();
  });

  it("retries a briefly-unreachable gateway rather than giving up on the first refusal", async () => {
    openClaw.runOnce = vi
      .fn()
      .mockRejectedValueOnce(new Error("starting up"))
      .mockResolvedValueOnce({ text: "answer", model: "xai/grok-4.5" });

    const result = await route();

    expect(result.backend).toBe("openclaw");
    expect(openClaw.runOnce).toHaveBeenCalledTimes(2);
  });

  it("gives up on OpenClaw after CONNECT_ATTEMPTS and falls back to Ollama", async () => {
    openClaw.runOnce = vi.fn().mockRejectedValue(new Error("Gateway unreachable"));

    const result = await route();

    expect(openClaw.runOnce).toHaveBeenCalledTimes(CONNECT_ATTEMPTS);
    expect(result).toMatchObject({ backend: "ollama", model: "ollama/hermes3:8b", usedFallback: true });
    expect(result.text).toBe("local answer");
  });

  it("throws the original OpenClaw error when the Ollama fallback also fails", async () => {
    openClaw.runOnce = vi.fn().mockRejectedValue(new Error("Gateway unreachable"));
    ollama.generateReport = vi.fn().mockRejectedValue(new Error("Ollama unreachable"));

    await expect(route()).rejects.toThrow("Gateway unreachable");
  });

  it("retries with an explicit model when the answer came from something other than the preferred one", async () => {
    openClaw.runOnce = vi
      .fn()
      .mockResolvedValueOnce({ text: "local fallback answer", model: "ollama/hermes3:8b" })
      .mockResolvedValueOnce({ text: "the real thing", model: "xai/grok-4.5" });

    const result = await route({ preferredModel: "xai/grok-4.5" });

    expect(openClaw.runOnce).toHaveBeenCalledTimes(2);
    expect(openClaw.runOnce).toHaveBeenLastCalledWith(
      expect.objectContaining({ model: "xai/grok-4.5" }),
    );
    expect(result.model).toBe("xai/grok-4.5");
    expect(result.usedFallback).toBe(false);
  });

  it("accepts a wrong-model answer rather than looping forever, and marks it as a fallback", async () => {
    openClaw.runOnce = vi.fn().mockResolvedValue({ text: "answer", model: "ollama/hermes3:8b" });

    const result = await route({ preferredModel: "xai/grok-4.5" });

    // One initial call plus the bounded model retries, then it settles.
    expect(openClaw.runOnce).toHaveBeenCalledTimes(1 + MODEL_RETRY_ATTEMPTS);
    expect(result.text).toBe("answer");
    expect(result.usedFallback).toBe(true);
  });

  it("does no model retry at all when no preference is set", async () => {
    openClaw.runOnce = vi.fn().mockResolvedValue({ text: "answer", model: "ollama/hermes3:8b" });

    const result = await route({ preferredModel: "" });

    expect(openClaw.runOnce).toHaveBeenCalledTimes(1);
    expect(result.usedFallback).toBe(false);
  });

  it("keeps the answer it already has when the model retry itself throws", async () => {
    openClaw.runOnce = vi
      .fn()
      .mockResolvedValueOnce({ text: "good enough", model: "ollama/hermes3:8b" })
      .mockRejectedValue(new Error("blew up on retry"));

    const result = await route({ preferredModel: "xai/grok-4.5" });

    expect(result.text).toBe("good enough");
    expect(result.usedFallback).toBe(true);
  });

  it("treats a bare model name and its provider-prefixed form as the same model", async () => {
    openClaw.runOnce = vi.fn().mockResolvedValue({ text: "answer", model: "xai/grok-4.5" });

    const result = await route({ preferredModel: "grok-4.5" });

    expect(openClaw.runOnce).toHaveBeenCalledTimes(1);
    expect(result.usedFallback).toBe(false);
  });
});
