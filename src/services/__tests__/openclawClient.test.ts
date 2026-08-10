import { describe, expect, it } from "vitest";
import { DEFAULT_LOCAL_MODEL_ID, resolveModelOverride } from "../openclawClient";

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

describe("DEFAULT_LOCAL_MODEL_ID", () => {
  it("matches OpenClaw's own first configured Ollama fallback entry", () => {
    expect(DEFAULT_LOCAL_MODEL_ID).toBe("hermes3:8b");
  });
});
