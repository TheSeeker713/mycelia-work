import { describe, expect, it } from "vitest";
import { DEFAULT_LOCAL_MODEL_ID, GROK4_MODEL, resolveModelOverride } from "../openclawClient";

describe("resolveModelOverride", () => {
  it("sends Grok 4.6 when Grok is enabled and no preferred model is set", () => {
    expect(resolveModelOverride(true, "hermes3:8b")).toBe(GROK4_MODEL);
    expect(GROK4_MODEL).toContain("4.6");
  });

  it("uses the preferred model when Grok is on and one is set", () => {
    expect(resolveModelOverride(true, "hermes3:8b", "xai/grok-4.6")).toBe("xai/grok-4.6");
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
