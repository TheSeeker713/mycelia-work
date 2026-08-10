// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  bytesToBase64,
  generateVideo,
  hfSpaceBackupConnector,
  hfSpacePrimaryConnector,
  parseGradioResult,
  VIDEO_GEN_CONNECTORS,
  type VideoGenConnector,
} from "../videoGen";

const request = { imageBase64: "abc", prompt: "gently animate" };

function keyedConnector(
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

function keylessConnector(id: VideoGenConnector["id"], behavior: "ok" | "fail"): VideoGenConnector {
  return {
    id,
    label: id,
    apiKeySetting: null,
    isConfigured: () => true,
    generate: vi.fn(async () => {
      if (behavior === "fail") throw new Error(`${id} is unhappy`);
      return { videoUrl: `${id}://clip`, provider: id };
    }),
  };
}

describe("generateVideo", () => {
  it("animates with no keys configured at all", async () => {
    const free = keylessConnector("hf-wan22-primary", "ok");

    const result = await generateVideo(request, {}, [free]);

    expect(result.provider).toBe("hf-wan22-primary");
    expect(free.generate).toHaveBeenCalled();
  });

  it("passes null rather than a key to a connector that needs none", async () => {
    const free = keylessConnector("hf-wan22-primary", "ok");

    await generateVideo(request, {}, [free]);

    expect(free.generate).toHaveBeenCalledWith(request, null);
  });

  it("falls through to the mirror Space when the first one fails", async () => {
    const first = keylessConnector("hf-wan22-primary", "fail");
    const second = keylessConnector("hf-wan22-backup", "ok");

    const result = await generateVideo(request, {}, [first, second]);

    expect(result.provider).toBe("hf-wan22-backup");
  });

  it("skips an optional paid provider that has no key", async () => {
    const free = keylessConnector("hf-wan22-primary", "fail");
    const paid = keyedConnector("fal", "videogen_fal_key", "ok");

    await expect(generateVideo(request, {}, [free, paid])).rejects.toThrow(/Couldn't animate/);
    expect(paid.generate).not.toHaveBeenCalled();
  });

  it("uses an optional paid provider once a key exists", async () => {
    const free = keylessConnector("hf-wan22-primary", "fail");
    const paid = keyedConnector("fal", "videogen_fal_key", "ok");

    const result = await generateVideo(request, { videogen_fal_key: "k" }, [free, paid]);

    expect(result.provider).toBe("fal");
  });

  it("reports every provider's failure rather than just the last one", async () => {
    const a = keylessConnector("hf-wan22-primary", "fail");
    const b = keylessConnector("hf-wan22-backup", "fail");

    await expect(generateVideo(request, {}, [a, b])).rejects.toThrow(
      /hf-wan22-primary is unhappy.*hf-wan22-backup is unhappy/s,
    );
  });
});

describe("the shipped connector list", () => {
  it("leads with providers that need no key, so the feature works unconfigured", () => {
    expect(VIDEO_GEN_CONNECTORS[0].apiKeySetting).toBeNull();
    expect(VIDEO_GEN_CONNECTORS[1].apiKeySetting).toBeNull();
  });

  it("treats a keyless connector as configured no matter what it's handed", () => {
    expect(VIDEO_GEN_CONNECTORS[0].isConfigured(null)).toBe(true);
  });

  it("keeps the paid providers behind a key", () => {
    const paid = VIDEO_GEN_CONNECTORS.filter((c) => c.apiKeySetting !== null);
    expect(paid).toHaveLength(2);
    expect(paid.every((c) => !c.isConfigured(null))).toBe(true);
  });
});

/**
 * The two Spaces are forks of one app whose signatures have already
 * drifted apart, and the API is positional, so a shared argument array
 * would send a boolean where a list belongs. These pin the shapes that
 * were verified against the live Spaces.
 */
describe("Wan2.2 Space arguments", () => {
  async function capture(connector: VideoGenConnector): Promise<unknown[]> {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return new Response(JSON.stringify({ event_id: "e1" }), { status: 200 });
      }
      return new Response('event: complete\ndata: [{"url": "https://x/clip.mp4"}]\n\n', {
        status: 200,
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      await connector.generate(request, null);
    } finally {
      vi.unstubAllGlobals();
    }
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as { data: unknown[] };
    return body.data;
  }

  it("sends the primary Space 17 arguments", async () => {
    const args = await capture(hfSpacePrimaryConnector);
    expect(args).toHaveLength(17);
    // safe_mode, lora_groups, video_component
    expect(args.slice(14)).toEqual([false, null, true]);
  });

  it("sends the mirror Space 16 arguments with the last two swapped", async () => {
    const args = await capture(hfSpaceBackupConnector);
    expect(args).toHaveLength(16);
    // video_component, safe_mode — and no lora_groups anywhere
    expect(args.slice(14)).toEqual([true, false]);
  });

  it("sends the image as a data URI Gradio recognises", async () => {
    const args = await capture(hfSpacePrimaryConnector);
    expect(args[0]).toEqual({
      url: "data:image/png;base64,abc",
      meta: { _type: "gradio.FileData" },
    });
  });
});

describe("parseGradioResult", () => {
  it("reads the payload out of a completed stream", () => {
    const sse = 'event: complete\ndata: [{"url": "https://x/clip.mp4"}]\n\n';
    expect(parseGradioResult(sse)).toEqual([{ url: "https://x/clip.mp4" }]);
  });

  /**
   * The failure that made this a parser instead of a regex: `null` is
   * valid JSON, so anything that only checked for parseable data would
   * treat a failed job as a successful one.
   */
  it("treats an error event as a failure even though its body parses", () => {
    expect(() => parseGradioResult("event: error\ndata: null\n\n")).toThrow(/reported an error/);
  });

  it("passes along an error body when there is one", () => {
    expect(() => parseGradioResult('event: error\ndata: "out of quota"\n\n')).toThrow(/out of quota/);
  });

  it("complains rather than hanging when the stream just stops", () => {
    expect(() => parseGradioResult("event: heartbeat\n\n")).toThrow(/without finishing/);
  });
});

describe("bytesToBase64", () => {
  it("matches btoa for small input", () => {
    const bytes = new Uint8Array([104, 105]);
    expect(bytesToBase64(bytes)).toBe(btoa("hi"));
  });

  /**
   * The reason this helper exists. `String.fromCharCode(...bytes)` on a
   * buffer this size throws a call-stack error, and reward art is
   * comfortably big enough to hit it.
   */
  it("survives an image far larger than the argument-spread limit", () => {
    const bytes = new Uint8Array(500_000).fill(65);
    expect(() => bytesToBase64(bytes)).not.toThrow();
    expect(bytesToBase64(bytes).length).toBeGreaterThan(600_000);
  });
});
