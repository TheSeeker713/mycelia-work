import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpVoiceClient } from "../voiceClient";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("createHttpVoiceClient", () => {
  describe("speak", () => {
    it("returns the audio blob on a successful call", async () => {
      const blob = new Blob(["fake wav bytes"], { type: "audio/wav" });
      global.fetch = vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) });

      const client = createHttpVoiceClient();
      const result = await client.speak("Clocked in.");

      expect(result).toBe(blob);
      expect(global.fetch).toHaveBeenCalledWith(
        "http://127.0.0.1:8004/tts",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("returns null (fails soft) when the server responds non-ok", async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false });
      const client = createHttpVoiceClient();
      expect(await client.speak("Clocked in.")).toBeNull();
    });

    it("returns null (fails soft) when the server is unreachable", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
      const client = createHttpVoiceClient();
      expect(await client.speak("Clocked in.")).toBeNull();
    });

    it("returns null for empty/whitespace-only text without making a call", async () => {
      global.fetch = vi.fn();
      const client = createHttpVoiceClient();
      expect(await client.speak("   ")).toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe("transcribe", () => {
    it("returns the transcribed text on success", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ text: "buy more coffee", language: "en" }),
      });
      const client = createHttpVoiceClient();
      const result = await client.transcribe(new Blob(["audio"]));
      expect(result).toBe("buy more coffee");
    });

    it("returns null (fails soft) on a network error", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("down"));
      const client = createHttpVoiceClient();
      expect(await client.transcribe(new Blob(["audio"]))).toBeNull();
    });
  });

  describe("availability checks", () => {
    it("isTtsAvailable is true when /health resolves ok", async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true });
      const client = createHttpVoiceClient();
      expect(await client.isTtsAvailable()).toBe(true);
    });

    it("isSttAvailable is false when the server is unreachable", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("down"));
      const client = createHttpVoiceClient();
      expect(await client.isSttAvailable()).toBe(false);
    });
  });
});
