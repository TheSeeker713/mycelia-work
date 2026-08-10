// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { generateVideo, type VideoGenConnector } from "../videoGen";

const request = { imageBase64: "abc", prompt: "gently animate" };

function fakeConnector(
  id: VideoGenConnector["id"],
  apiKeySetting: string,
  behavior: "ok" | "fail",
): VideoGenConnector {
  return {
    id,
    label: id,
    apiKeySetting,
    isConfigured: (key) => !!key,
    generate: vi.fn(async () => {
      if (behavior === "fail") throw new Error(`${id} is unhappy`);
      return { videoUrl: `${id}://clip`, provider: id };
    }),
  };
}

describe("generateVideo", () => {
  it("uses the first configured connector that works", async () => {
    const first = fakeConnector("huggingface", "hf", "ok");
    const second = fakeConnector("fal", "fal", "ok");

    const result = await generateVideo(request, { hf: "token", fal: "key" }, [first, second]);

    expect(result.provider).toBe("huggingface");
    expect(second.generate).not.toHaveBeenCalled();
  });

  it("falls through to the next provider when the free one is rate limited", async () => {
    const first = fakeConnector("huggingface", "hf", "fail");
    const second = fakeConnector("fal", "fal", "ok");

    const result = await generateVideo(request, { hf: "token", fal: "key" }, [first, second]);

    expect(result.provider).toBe("fal");
    expect(first.generate).toHaveBeenCalled();
  });

  it("skips a provider with no key instead of failing on it", async () => {
    const unconfigured = fakeConnector("huggingface", "hf", "ok");
    const configured = fakeConnector("fal", "fal", "ok");

    const result = await generateVideo(request, { hf: null, fal: "key" }, [unconfigured, configured]);

    expect(result.provider).toBe("fal");
    expect(unconfigured.generate).not.toHaveBeenCalled();
  });

  it("says plainly that nothing is set up when no provider has a key", async () => {
    const a = fakeConnector("huggingface", "hf", "ok");
    const b = fakeConnector("fal", "fal", "ok");

    await expect(generateVideo(request, {}, [a, b])).rejects.toThrow(/No video provider is set up/);
  });

  it("reports every provider's failure rather than just the last one", async () => {
    const a = fakeConnector("huggingface", "hf", "fail");
    const b = fakeConnector("fal", "fal", "fail");

    await expect(generateVideo(request, { hf: "t", fal: "k" }, [a, b])).rejects.toThrow(
      /huggingface is unhappy.*fal is unhappy/s,
    );
  });
});
