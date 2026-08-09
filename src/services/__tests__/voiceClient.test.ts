import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpVoiceClient } from "../voiceClient";

async function formDataFromLastCall(fetchMock: ReturnType<typeof vi.fn>): Promise<FormData> {
  const [, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return init.body as FormData;
}

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
        "http://127.0.0.1:8006/tts",
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

    it("defaults to the default voice's underlying Kokoro voice when none is given", async () => {
      const blob = new Blob(["wav"], { type: "audio/wav" });
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) });
      global.fetch = fetchMock;

      const client = createHttpVoiceClient();
      await client.speak("Clocked in.");

      const form = await formDataFromLastCall(fetchMock);
      expect(form.get("voice")).toBe("af_heart");
      expect(form.get("pitch_shift_cents")).toBe("200");
    });

    it("resolves a picker id to its underlying Kokoro voice string", async () => {
      const blob = new Blob(["wav"], { type: "audio/wav" });
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) });
      global.fetch = fetchMock;

      const client = createHttpVoiceClient();
      await client.speak("Clocked in.", "am_adam");

      const form = await formDataFromLastCall(fetchMock);
      expect(form.get("voice")).toBe("am_adam");
    });

    it("sends the locked-in pitch shift for the default voice — Kokoro has no native pitch control", async () => {
      const blob = new Blob(["wav"], { type: "audio/wav" });
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) });
      global.fetch = fetchMock;

      const client = createHttpVoiceClient();
      await client.speak("Clocked in.", "af_heart_200");

      const form = await formDataFromLastCall(fetchMock);
      expect(form.get("pitch_shift_cents")).toBe("200");
    });

    it("the three Heart entries share one underlying voice at three different pitch shifts", async () => {
      const blob = new Blob(["wav"], { type: "audio/wav" });
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) });
      global.fetch = fetchMock;
      const client = createHttpVoiceClient();

      await client.speak("Clocked in.", "af_heart_150");
      let form = await formDataFromLastCall(fetchMock);
      expect(form.get("voice")).toBe("af_heart");
      expect(form.get("pitch_shift_cents")).toBe("150");

      await client.speak("Clocked in.", "af_heart_100");
      form = await formDataFromLastCall(fetchMock);
      expect(form.get("voice")).toBe("af_heart");
      expect(form.get("pitch_shift_cents")).toBe("100");
    });

    it("sends no pitch shift for an unrecognized voice id rather than guessing", async () => {
      const blob = new Blob(["wav"], { type: "audio/wav" });
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) });
      global.fetch = fetchMock;

      const client = createHttpVoiceClient();
      await client.speak("Clocked in.", "some-future-voice");

      const form = await formDataFromLastCall(fetchMock);
      expect(form.get("pitch_shift_cents")).toBe("0");
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
