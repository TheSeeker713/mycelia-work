/**
 * Turning a still reward image into a short animation.
 *
 * No open video model runs usefully on this machine, so this one AI
 * feature is genuinely cloud-only — the opposite of everything else in
 * the app. That makes provider choice a real risk rather than a detail:
 * free tiers move, models get delisted, and rate limits bite. So this
 * is a connector list rather than one hardcoded service, tried in
 * order, and adding another is a new entry rather than a rewrite.
 *
 * Researched 2026-08-09. Hugging Face is three products now: the
 * rate-limited serverless Inference API (shared GPU pool, monthly
 * credit allowance, meant for prototyping), dedicated Inference
 * Endpoints, and an OpenAI-compatible Inference Providers gateway.
 * The free serverless tier is the default here precisely because it
 * costs nothing, and the fallbacks exist because it will sometimes
 * refuse.
 *
 * No key is ever hardcoded. Each connector reads its own key from
 * settings, and one with no key configured is skipped rather than
 * attempted and failed.
 */

export type VideoGenProviderId = "huggingface" | "fal" | "replicate";

export interface VideoGenRequest {
  /** The still image, base64 without a data: prefix. */
  imageBase64: string;
  /** Steers the motion. Kept short — these models don't reward essays. */
  prompt: string;
}

export interface VideoGenResult {
  /** The finished clip as a blob URL or data URI, ready for a <video> src. */
  videoUrl: string;
  provider: VideoGenProviderId;
}

export interface VideoGenConnector {
  id: VideoGenProviderId;
  label: string;
  /** Settings key holding this provider's API token. */
  apiKeySetting: string;
  /** Whether this connector can even be attempted right now. */
  isConfigured(apiKey: string | null): boolean;
  generate(request: VideoGenRequest, apiKey: string): Promise<VideoGenResult>;
}

/** Every provider's failure is reported the same way, so the caller can just try the next one. */
export class VideoGenError extends Error {
  constructor(
    public provider: VideoGenProviderId,
    message: string,
  ) {
    super(message);
    this.name = "VideoGenError";
  }
}

async function blobToObjectUrl(res: Response): Promise<string> {
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/**
 * Hugging Face's serverless Inference API. Free and rate-limited,
 * which is exactly why it's first: when it works it costs nothing, and
 * when it's throttled the next connector takes over.
 *
 * The model id is configurable rather than fixed, because which
 * image-to-video models are actually served changes often enough that
 * hardcoding one guarantees this breaks eventually. LTX-Video is the
 * default because it's the one with a real, current image-to-video
 * pipeline on the Hub.
 */
export const huggingFaceConnector: VideoGenConnector = {
  id: "huggingface",
  label: "Hugging Face (free, rate-limited)",
  apiKeySetting: "videogen_hf_token",
  isConfigured: (apiKey) => !!apiKey,
  async generate({ imageBase64, prompt }, apiKey) {
    const model = "Lightricks/LTX-Video";
    const res = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs: { image: imageBase64, prompt } }),
    });
    if (res.status === 429) {
      throw new VideoGenError("huggingface", "Rate limited — the free tier is shared");
    }
    if (!res.ok) {
      throw new VideoGenError("huggingface", `Hugging Face returned ${res.status}`);
    }
    return { videoUrl: await blobToObjectUrl(res), provider: "huggingface" };
  },
};

/** Paid but reliable, and the usual answer when Hugging Face's free pool is busy. */
export const falConnector: VideoGenConnector = {
  id: "fal",
  label: "fal.ai",
  apiKeySetting: "videogen_fal_key",
  isConfigured: (apiKey) => !!apiKey,
  async generate({ imageBase64, prompt }, apiKey) {
    const res = await fetch("https://fal.run/fal-ai/ltx-video/image-to-video", {
      method: "POST",
      headers: {
        Authorization: `Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ image_url: `data:image/webp;base64,${imageBase64}`, prompt }),
    });
    if (!res.ok) throw new VideoGenError("fal", `fal.ai returned ${res.status}`);
    const data = (await res.json()) as { video?: { url?: string } };
    const url = data.video?.url;
    if (!url) throw new VideoGenError("fal", "fal.ai returned no video URL");
    return { videoUrl: url, provider: "fal" };
  },
};

/** Last resort. Replicate's prediction API is polling-based, so this one waits. */
export const replicateConnector: VideoGenConnector = {
  id: "replicate",
  label: "Replicate",
  apiKeySetting: "videogen_replicate_token",
  isConfigured: (apiKey) => !!apiKey,
  async generate({ imageBase64, prompt }, apiKey) {
    const res = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Prefer: "wait",
      },
      body: JSON.stringify({
        input: { image: `data:image/webp;base64,${imageBase64}`, prompt },
      }),
    });
    if (!res.ok) throw new VideoGenError("replicate", `Replicate returned ${res.status}`);
    const data = (await res.json()) as { output?: string | string[] };
    const url = Array.isArray(data.output) ? data.output[0] : data.output;
    if (!url) throw new VideoGenError("replicate", "Replicate returned no output");
    return { videoUrl: url, provider: "replicate" };
  },
};

/** Free first, then the paid fallbacks. */
export const VIDEO_GEN_CONNECTORS: readonly VideoGenConnector[] = [
  huggingFaceConnector,
  falConnector,
  replicateConnector,
];

/**
 * Tries each configured connector in order and returns the first
 * success. A connector with no key is skipped silently — not having
 * signed up for fal.ai isn't an error worth reporting.
 */
export async function generateVideo(
  request: VideoGenRequest,
  apiKeys: Partial<Record<string, string | null>>,
  connectors: readonly VideoGenConnector[] = VIDEO_GEN_CONNECTORS,
): Promise<VideoGenResult> {
  const errors: string[] = [];
  let anyConfigured = false;

  for (const connector of connectors) {
    const key = apiKeys[connector.apiKeySetting] ?? null;
    if (!connector.isConfigured(key)) continue;
    anyConfigured = true;
    try {
      return await connector.generate(request, key as string);
    } catch (err) {
      errors.push(`${connector.label}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (!anyConfigured) {
    throw new Error(
      "No video provider is set up yet. Add a Hugging Face token in Settings to use the free tier.",
    );
  }
  throw new Error(`Every video provider failed. ${errors.join("; ")}`);
}
