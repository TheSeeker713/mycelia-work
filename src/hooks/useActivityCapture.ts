import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useRepositories, useSettingsStore } from "../store/StoreProvider";
import {
  SAMPLE_INTERVAL_MS,
  shouldRecordSample,
  type ActivitySample,
} from "../services/activityCapture";

/**
 * Polls the Rust foreground sample on an interval and writes
 * activity_events. Deliberately not an AI job.
 */
export function useActivityCapture() {
  const repos = useRepositories();
  const enabled = useSettingsStore((s) => s.activityCaptureEnabled);
  const paused = useSettingsStore((s) => s.activityCapturePaused);
  const excludeApps = useSettingsStore((s) => s.activityExcludeApps);
  const idleThreshold = useSettingsStore((s) => s.activityIdleThresholdSecs);
  const setActivityCapturePaused = useSettingsStore((s) => s.setActivityCapturePaused);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<boolean>("activity-capture-pause", (event) => {
      void setActivityCapturePaused(event.payload);
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {
        // jsdom / tests have no Tauri event bus.
      });
    return () => unlisten?.();
  }, [setActivityCapturePaused]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    async function tick() {
      if (cancelled) return;
      try {
        const sample = await invoke<ActivitySample>("sample_foreground_activity");
        if (cancelled) return;
        if (
          shouldRecordSample(sample, {
            enabled: true,
            paused,
            excludeApps,
          })
        ) {
          await repos.activityEvents.insert({
            app: sample.app,
            title: sample.title,
            url: sample.url,
            idle: sample.idle || sample.idle_seconds >= idleThreshold,
          });
        }
      } catch {
        // Fail-soft — a missing command in tests or a probe miss just skips a beat.
      }
    }

    void tick();
    const id = setInterval(() => void tick(), SAMPLE_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [enabled, paused, excludeApps, idleThreshold, repos]);
}
