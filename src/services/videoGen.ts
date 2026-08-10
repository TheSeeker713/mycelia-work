/**
 * Turning a still reward image into a short animation.
 *
 * No open video model runs usefully on this machine, so this one AI
 * feature is genuinely cloud-only, the opposite of everything else in
 * the app. The first version of this file got that half right and half
 * wrong: it built a connector list, then made every entry require an
 * API key, so the feature was dead on arrival for anyone who hadn't
 * signed up somewhere. Animating a badge you earned shouldn't require
 * an account.
 *
 * Public Gradio Spaces fix that. Every public Space is an HTTP API at
 * `https://{host}/gradio_api/call/{api_name}`, callable with no token,
 * no login, no signup. Verified live on 2026-08-09 by generating an
 * actual 52KB mp4 from a throwaway PNG with no credentials of any kind,
 * and by confirming the Space answers a `tauri://localhost` preflight
 * with permissive CORS, so the webview can call it directly.
 *
 * The quota is real but workable: unauthenticated callers share an
 * IP-based pool of about two minutes of daily ZeroGPU time. That's a
 * couple of clips a day, which matches how often anyone actually wants
 * to animate a badge.
 *
 * Keys are now strictly an upgrade path. fal.ai and Replicate stay in
 * the list for the day a free Space is down and something has to work,
 * but a connector with no key is skipped rather than attempted, and
 * nothing about the default path asks for one.
 */

export type VideoGenProviderId = "hf-wan22-primary" | "hf-wan22-backup" | "fal" | "replicate";

export interface VideoGenRequest {
  /** The still image, base64 without a data: prefix. */
  imageBase64: string;
  /** Steers the motion. Kept short, these models don't reward essays. */
  prompt: string;
}

export interface VideoGenResult {
  /** The finished clip, ready for a <video> src. */
  videoUrl: string;
  provider: VideoGenProviderId;
}

export interface VideoGenConnector {
  id: VideoGenProviderId;
  label: string;
  /**
   * Settings key holding this provider's API token, or null when the
   * provider needs nothing at all. Null is the whole point of this
   * module: it's what makes the default path work with no setup.
   */
  apiKeySetting: string | null;
  /** Whether this connector can even be attempted right now. */
  isConfigured(apiKey: string | null): boolean;
  generate(request: VideoGenRequest, apiKey: string | null): Promise<VideoGenResult>;
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

/**
 * Generous, because these are queued jobs on shared hardware. A clip
 * that took 40 seconds on an idle Space can take minutes behind other
 * people's requests, and giving up early wastes the GPU time already
 * spent rather than saving anything.
 */
const SPACE_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Pulls the payload out of a Gradio result stream.
 *
 * The format is Server-Sent Events, and the failure case is the reason
 * this is a real parser rather than a regex: a failed job answers with
 * `event: error` and a `data: null` body, which is valid JSON and would
 * sail straight through anything that only checked for parseable data.
 * The event name is the only thing that distinguishes success here.
 */
export function parseGradioResult(sse: string): unknown[] {
  let event = "";
  for (const line of sse.split(/\r?\n/)) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
      continue;
    }
    if (!line.startsWith("data:")) continue;

    const payload = line.slice("data:".length).trim();
    if (event === "error") {
      // Gradio sends `null` for most GPU-side failures, so there's
      // usually nothing more specific to pass along than this.
      const detail = payload && payload !== "null" ? `: ${payload}` : "";
      throw new Error(`the Space reported an error${detail}`);
    }
    if (event === "complete") {
      const parsed: unknown = JSON.parse(payload);
      if (!Array.isArray(parsed)) throw new Error("the Space returned an unexpected result shape");
      return parsed;
    }
  }
  throw new Error("the Space closed the stream without finishing");
}

/**
 * One call to a public Space: POST the arguments, get an event id back,
 * then read the result stream. Two requests rather than one because
 * Gradio queues everything, and the queue is exactly why the wait can
 * be long.
 */
async function callGradioSpace(
  provider: VideoGenProviderId,
  host: string,
  apiName: string,
  data: unknown[],
): Promise<unknown[]> {
  const endpoint = `https://${host}/gradio_api/call/${apiName}`;
  const signal = AbortSignal.timeout(SPACE_TIMEOUT_MS);

  const submitted = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data }),
    signal,
  });
  if (submitted.status === 429) {
    throw new VideoGenError(provider, "out of free GPU time for today");
  }
  if (!submitted.ok) {
    throw new VideoGenError(provider, `the Space returned ${submitted.status}`);
  }

  const { event_id: eventId } = (await submitted.json()) as { event_id?: string };
  if (!eventId) throw new VideoGenError(provider, "the Space accepted the job but gave no event id");

  const stream = await fetch(`${endpoint}/${eventId}`, { signal });
  if (!stream.ok) throw new VideoGenError(provider, `the result stream returned ${stream.status}`);

  try {
    return parseGradioResult(await stream.text());
  } catch (err) {
    throw new VideoGenError(provider, err instanceof Error ? err.message : String(err));
  }
}

/** The first file-shaped thing in a Gradio result, which is where the clip lives. */
function firstVideoUrl(result: unknown[]): string | null {
  for (const entry of result) {
    if (entry && typeof entry === "object" && "url" in entry) {
      const url = (entry as { url?: unknown }).url;
      if (typeof url === "string" && url) return url;
    }
  }
  return null;
}

/**
 * Shared generation settings for the Wan2.2 Spaces, taken from the
 * Space's own function defaults rather than invented. Getting these
 * wrong is silent: the first live attempt passed `quality: 80`,
 * `scheduler: "unipc"` and a string frame multiplier, and the job came
 * back as a bare `event: error` with no hint that the arguments were
 * the problem.
 */
const WAN_DEFAULTS = {
  steps: 4,
  negativePrompt: "",
  durationSeconds: 2,
  guidanceScale: 1,
  guidanceScale2: 1,
  seed: 42,
  randomizeSeed: true,
  quality: 5,
  scheduler: "UniPCMultistep",
  flowShift: 6.0,
  frameMultiplier: 16,
  safeMode: false,
  videoComponent: true,
} as const;

function wanImage(imageBase64: string) {
  return { url: `data:image/png;base64,${imageBase64}`, meta: { _type: "gradio.FileData" } };
}

/**
 * A public Wan2.2 image-to-video Space.
 *
 * Each Space carries its own argument builder rather than sharing one,
 * which looks like duplication until you compare the two signatures:
 * the primary takes 17 positional arguments ending
 * `safe_mode, lora_groups, video_component`, and the backup takes 16,
 * ending `video_component, safe_mode`, with no `lora_groups` at all.
 * The API is positional, so one shared array would quietly pass a
 * boolean where a list belongs and fail with the same unhelpful
 * `event: error`. Forks drift; the builder is where that's contained.
 */
function wanSpaceConnector(
  id: VideoGenProviderId,
  label: string,
  host: string,
  buildArgs: (request: VideoGenRequest) => unknown[],
): VideoGenConnector {
  return {
    id,
    label,
    apiKeySetting: null,
    isConfigured: () => true,
    async generate(request) {
      const result = await callGradioSpace(id, host, "generate_video", buildArgs(request));
      const url = firstVideoUrl(result);
      if (!url) throw new VideoGenError(id, "finished but returned no video");
      return { videoUrl: url, provider: id };
    },
  };
}

/** 17 positional arguments, `lora_groups` second from last. */
export const hfSpacePrimaryConnector = wanSpaceConnector(
  "hf-wan22-primary",
  "Wan2.2 on Hugging Face (free)",
  "cinderholm-wan2-2-i2v-v3.hf.space",
  ({ imageBase64, prompt }) => [
    wanImage(imageBase64),
    null,
    prompt,
    WAN_DEFAULTS.steps,
    WAN_DEFAULTS.negativePrompt,
    WAN_DEFAULTS.durationSeconds,
    WAN_DEFAULTS.guidanceScale,
    WAN_DEFAULTS.guidanceScale2,
    WAN_DEFAULTS.seed,
    WAN_DEFAULTS.randomizeSeed,
    WAN_DEFAULTS.quality,
    WAN_DEFAULTS.scheduler,
    WAN_DEFAULTS.flowShift,
    WAN_DEFAULTS.frameMultiplier,
    WAN_DEFAULTS.safeMode,
    null,
    WAN_DEFAULTS.videoComponent,
  ],
);

/** 16 positional arguments, no `lora_groups`, last two swapped. */
export const hfSpaceBackupConnector = wanSpaceConnector(
  "hf-wan22-backup",
  "Wan2.2 mirror on Hugging Face (free)",
  "kulkas2pintu-wan555.hf.space",
  ({ imageBase64, prompt }) => [
    wanImage(imageBase64),
    null,
    prompt,
    WAN_DEFAULTS.steps,
    WAN_DEFAULTS.negativePrompt,
    WAN_DEFAULTS.durationSeconds,
    WAN_DEFAULTS.guidanceScale,
    WAN_DEFAULTS.guidanceScale2,
    WAN_DEFAULTS.seed,
    WAN_DEFAULTS.randomizeSeed,
    WAN_DEFAULTS.quality,
    WAN_DEFAULTS.scheduler,
    WAN_DEFAULTS.flowShift,
    WAN_DEFAULTS.frameMultiplier,
    WAN_DEFAULTS.videoComponent,
    WAN_DEFAULTS.safeMode,
  ],
);

/** Optional. Only ever attempted if a key has been added in Settings. */
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
      body: JSON.stringify({ image_url: `data:image/png;base64,${imageBase64}`, prompt }),
    });
    if (!res.ok) throw new VideoGenError("fal", `fal.ai returned ${res.status}`);
    const data = (await res.json()) as { video?: { url?: string } };
    const url = data.video?.url;
    if (!url) throw new VideoGenError("fal", "fal.ai returned no video URL");
    return { videoUrl: url, provider: "fal" };
  },
};

/** Optional, and last. Replicate's prediction API is polling-based, so this one waits. */
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
        input: { image: `data:image/png;base64,${imageBase64}`, prompt },
      }),
    });
    if (!res.ok) throw new VideoGenError("replicate", `Replicate returned ${res.status}`);
    const data = (await res.json()) as { output?: string | string[] };
    const url = Array.isArray(data.output) ? data.output[0] : data.output;
    if (!url) throw new VideoGenError("replicate", "Replicate returned no output");
    return { videoUrl: url, provider: "replicate" };
  },
};

/**
 * Free and keyless first, paid only as a rescue. The two Spaces are
 * separate entries rather than one with a retry because they're
 * genuinely different deployments: when the first is down or out of
 * quota, the second is a different host with its own pool.
 */
export const VIDEO_GEN_CONNECTORS: readonly VideoGenConnector[] = [
  hfSpacePrimaryConnector,
  hfSpaceBackupConnector,
  falConnector,
  replicateConnector,
];

/** Settings keys any connector might read, for callers assembling the key map. */
export const VIDEO_GEN_KEY_SETTINGS: readonly string[] = VIDEO_GEN_CONNECTORS.map(
  (c) => c.apiKeySetting,
).filter((k): k is string => k !== null);

/**
 * Browser-safe base64 for arbitrary bytes.
 *
 * The obvious `String.fromCharCode(...bytes)` throws on anything large:
 * spreading a few hundred thousand elements into an argument list blows
 * the call stack, and reward art is comfortably big enough to do it.
 * Chunking keeps each call small.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Tries each usable connector in order and returns the first success.
 * A keyed connector with no key is skipped silently, since not having
 * signed up for fal.ai isn't an error worth reporting.
 */
export async function generateVideo(
  request: VideoGenRequest,
  apiKeys: Partial<Record<string, string | null>> = {},
  connectors: readonly VideoGenConnector[] = VIDEO_GEN_CONNECTORS,
): Promise<VideoGenResult> {
  const errors: string[] = [];
  let anyAttempted = false;

  for (const connector of connectors) {
    const key = connector.apiKeySetting ? (apiKeys[connector.apiKeySetting] ?? null) : null;
    if (!connector.isConfigured(key)) continue;
    anyAttempted = true;
    try {
      return await connector.generate(request, key);
    } catch (err) {
      errors.push(`${connector.label}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (!anyAttempted) {
    throw new Error("No video provider is available.");
  }
  throw new Error(`Couldn't animate that one. ${errors.join("; ")}`);
}
