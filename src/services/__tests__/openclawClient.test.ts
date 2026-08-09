import { describe, expect, it, vi } from "vitest";
import { DEFAULT_LOCAL_MODEL_ID, resolveModelOverride, runOnceWithRetry, type OpenClawClient } from "../openclawClient";

describe("resolveModelOverride", () => {
  it("returns undefined (don't override) when Grok is enabled", () => {
    expect(resolveModelOverride(true, "hermes3:8b")).toBeUndefined();
  });

  it("prefixes the local model id with ollama/ when Grok is off", () => {
    expect(resolveModelOverride(false, "hermes3:8b")).toBe("ollama/hermes3:8b");
  });

  it("respects whichever local model id is passed, not just the default", () => {
    expect(resolveModelOverride(false, "dolphin-phi:latest")).toBe("ollama/dolphin-phi:latest");
  });
});

describe("runOnceWithRetry", () => {
  function fakeClient(runOnce: OpenClawClient["runOnce"]): OpenClawClient {
    return {
      runOnce,
      ensureDaemon: vi.fn(),
      call: vi.fn(),
      releaseDaemon: vi.fn(),
      cancelActiveCall: vi.fn(),
    };
  }

  it("returns the result on the first try when it succeeds", async () => {
    const runOnce = vi.fn().mockResolvedValue({ text: "hi", model: "ollama/hermes3:8b" });
    const client = fakeClient(runOnce);

    const result = await runOnceWithRetry(client, { sessionKey: "s", message: "m" });

    expect(result).toEqual({ text: "hi", model: "ollama/hermes3:8b" });
    expect(runOnce).toHaveBeenCalledTimes(1);
  });

  it("retries exactly once on failure and returns the retry's result", async () => {
    const runOnce = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce({ text: "recovered", model: "ollama/hermes3:8b" });
    const client = fakeClient(runOnce);

    const result = await runOnceWithRetry(client, { sessionKey: "s", message: "m" });

    expect(result).toEqual({ text: "recovered", model: "ollama/hermes3:8b" });
    expect(runOnce).toHaveBeenCalledTimes(2);
  });

  it("throws the second attempt's error when both attempts fail", async () => {
    const runOnce = vi
      .fn()
      .mockRejectedValueOnce(new Error("first failure"))
      .mockRejectedValueOnce(new Error("second failure"));
    const client = fakeClient(runOnce);

    await expect(runOnceWithRetry(client, { sessionKey: "s", message: "m" })).rejects.toThrow(
      "second failure",
    );
    expect(runOnce).toHaveBeenCalledTimes(2);
  });
});

describe("DEFAULT_LOCAL_MODEL_ID", () => {
  it("matches OpenClaw's own first configured Ollama fallback entry", () => {
    expect(DEFAULT_LOCAL_MODEL_ID).toBe("hermes3:8b");
  });
});
