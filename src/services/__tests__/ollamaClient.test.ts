import { afterEach, describe, expect, it, vi } from "vitest";
import { GHOST_TEXT_MODEL, createHttpOllamaClient } from "../ollamaClient";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("createHttpOllamaClient", () => {
  describe("suggestContinuation", () => {
    it("returns the trimmed suggestion on a successful call", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue({ ok: true, json: () => Promise.resolve({ response: "  more words here  " }) });

      const client = createHttpOllamaClient();
      const result = await client.suggestContinuation("Started the design doc");

      expect(result).toBe("more words here");
      const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toBe("http://127.0.0.1:11434/api/generate");
      const body = JSON.parse(init.body as string);
      expect(body.model).toBe(GHOST_TEXT_MODEL);
      expect(body.prompt).toContain("Started the design doc");
      expect(body.stream).toBe(false);
    });

    it("returns null (fails soft) when the server responds non-ok", async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false });
      const client = createHttpOllamaClient();
      expect(await client.suggestContinuation("some text")).toBeNull();
    });

    it("returns null (fails soft) when the server is unreachable", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
      const client = createHttpOllamaClient();
      expect(await client.suggestContinuation("some text")).toBeNull();
    });

    it("returns null for an empty response body", async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ response: "   " }) });
      const client = createHttpOllamaClient();
      expect(await client.suggestContinuation("some text")).toBeNull();
    });

    it("returns null for empty/whitespace-only input without making a call", async () => {
      global.fetch = vi.fn();
      const client = createHttpOllamaClient();
      expect(await client.suggestContinuation("   ")).toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});
