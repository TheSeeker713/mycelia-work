export const ACTIVITY_ENABLED_KEY = "activity_capture_enabled";
export const ACTIVITY_PAUSED_KEY = "activity_capture_paused";
export const ACTIVITY_IDLE_THRESHOLD_KEY = "activity_idle_threshold_secs";
export const ACTIVITY_EXCLUDE_KEY = "activity_exclude_apps";
export const DEFAULT_IDLE_THRESHOLD_SECS = 120;
export const SAMPLE_INTERVAL_MS = 5_000;

export interface ActivitySample {
  app: string;
  title: string;
  url: string | null;
  idle: boolean;
  idle_seconds: number;
}

/** Sampling is local metadata. It must never go through aiQueue. */
export function shouldRecordSample(
  sample: ActivitySample,
  opts: { enabled: boolean; paused: boolean; excludeApps: string },
): boolean {
  if (!opts.enabled || opts.paused) return false;
  if (!sample.app.trim() && !sample.title.trim()) return false;
  const needles = opts.excludeApps
    .split(/[,;\n]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const hay = `${sample.app} ${sample.title}`.toLowerCase();
  return !needles.some((n) => hay.includes(n));
}
