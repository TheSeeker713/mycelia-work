import { afterEach, describe, expect, it, vi } from "vitest";
import { CLASSIFY_MODEL, GHOST_TEXT_MODEL, createHttpOllamaClient } from "../ollamaClient";

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
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403 });
      const client = createHttpOllamaClient();
      expect(await client.suggestContinuation("some text")).toBeNull();
    });

    it("warns to the console (not silently) on a non-ok response — this is the class of bug that went unnoticed for a whole session", async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403 });
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const client = createHttpOllamaClient();

      await client.suggestContinuation("some text");

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("403"));
    });

    it("returns null (fails soft) when the server is unreachable", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
      const client = createHttpOllamaClient();
      expect(await client.suggestContinuation("some text")).toBeNull();
    });

    it("warns to the console when the request itself throws", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const client = createHttpOllamaClient();

      await client.suggestContinuation("some text");

      expect(warnSpy).toHaveBeenCalled();
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

  describe("classifyOnTopic", () => {
    it("returns true when the model answers yes", async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ response: "Yes" }) });

      const client = createHttpOllamaClient();
      const result = await client.classifyOnTopic("fed the cat, need to buy more food");

      expect(result).toBe(true);
      const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toBe("http://127.0.0.1:11434/api/generate");
      const body = JSON.parse(init.body as string);
      expect(body.model).toBe(CLASSIFY_MODEL);
      expect(body.prompt).toContain("fed the cat, need to buy more food");
    });

    it("returns false when the model answers no", async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ response: "no" }) });
      const client = createHttpOllamaClient();
      expect(await client.classifyOnTopic("how do I pick a lock")).toBe(false);
    });

    it("fails closed (false) when the server responds non-ok", async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false });
      const client = createHttpOllamaClient();
      expect(await client.classifyOnTopic("some text")).toBe(false);
    });

    it("fails closed (false) when the server is unreachable", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
      const client = createHttpOllamaClient();
      expect(await client.classifyOnTopic("some text")).toBe(false);
    });

    it("fails closed (false) for empty/whitespace-only input without making a call", async () => {
      global.fetch = vi.fn();
      const client = createHttpOllamaClient();
      expect(await client.classifyOnTopic("   ")).toBe(false);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe("warmUpGhostText", () => {
    it("sends an empty-prompt load request for the ghost-text model", () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true });
      const client = createHttpOllamaClient();

      client.warmUpGhostText();

      const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toBe("http://127.0.0.1:11434/api/generate");
      const body = JSON.parse(init.body as string);
      expect(body.model).toBe(GHOST_TEXT_MODEL);
      expect(body.prompt).toBe("");
    });

    it("never throws even when the server is unreachable", () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
      const client = createHttpOllamaClient();
      expect(() => client.warmUpGhostText()).not.toThrow();
    });
  });

  describe("warmUpModel", () => {
    it("sends an empty-prompt load request for whichever model id is given", () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true });
      const client = createHttpOllamaClient();

      client.warmUpModel("hermes3:8b");

      const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toBe("http://127.0.0.1:11434/api/generate");
      const body = JSON.parse(init.body as string);
      expect(body.model).toBe("hermes3:8b");
      expect(body.prompt).toBe("");
    });

    it("never throws even when the server is unreachable", () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
      const client = createHttpOllamaClient();
      expect(() => client.warmUpModel("hermes3:8b")).not.toThrow();
    });
  });

  describe("isAvailable", () => {
    it("returns true when the server responds ok", async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true });
      const client = createHttpOllamaClient();

      expect(await client.isAvailable()).toBe(true);
      const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toBe("http://127.0.0.1:11434/api/version");
    });

    it("returns false when the server responds non-ok", async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false });
      const client = createHttpOllamaClient();
      expect(await client.isAvailable()).toBe(false);
    });

    it("returns false (fails soft) when the server is unreachable", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
      const client = createHttpOllamaClient();
      expect(await client.isAvailable()).toBe(false);
    });
  });

  describe("generateReport", () => {
    it("returns the trimmed response text on success", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue({ ok: true, json: () => Promise.resolve({ response: "  a real report  " }) });
      const client = createHttpOllamaClient();

      const result = await client.generateReport("write a report", "hermes3:8b", 90);

      expect(result).toBe("a real report");
      const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toBe("http://127.0.0.1:11434/api/generate");
      const body = JSON.parse(init.body as string);
      expect(body.model).toBe("hermes3:8b");
      expect(body.prompt).toBe("write a report");
      expect(body.stream).toBe(false);
    });

    it("throws (does not fail soft) when the server responds non-ok — callers rely on this for retry/markResult('failed', ...)", async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403 });
      const client = createHttpOllamaClient();

      await expect(client.generateReport("write a report", "hermes3:8b", 90)).rejects.toThrow("403");
    });

    it("throws on an empty response body", async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ response: "   " }) });
      const client = createHttpOllamaClient();

      await expect(client.generateReport("write a report", "hermes3:8b", 90)).rejects.toThrow("empty");
    });

    it("throws when the server is unreachable", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
      const client = createHttpOllamaClient();

      await expect(client.generateReport("write a report", "hermes3:8b", 90)).rejects.toThrow("ECONNREFUSED");
    });
  });
});
