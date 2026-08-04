import { useCallback, useRef } from "react";
import { useSettingsStore } from "../store/StoreProvider";
import clockInUrl from "../assets/audio/clock-in.wav?url";
import breakStartUrl from "../assets/audio/break-start.wav?url";
import breakResumeUrl from "../assets/audio/break-resume.wav?url";
import clockOutUrl from "../assets/audio/clock-out.wav?url";
import pleaseWaitUrl from "../assets/audio/please-wait.wav?url";

export type VoiceCueId = "clock_in" | "break_start" | "break_resume" | "clock_out" | "please_wait";

const CUE_FILES: Record<VoiceCueId, string> = {
  clock_in: clockInUrl,
  break_start: breakStartUrl,
  break_resume: breakResumeUrl,
  clock_out: clockOutUrl,
  please_wait: pleaseWaitUrl,
};

export interface VoiceCues {
  play: (id: VoiceCueId) => void;
}

/**
 * Instant playback of the fixed, pre-recorded cues (scripts/generate-voice-lines.mjs)
 * — no network call, no live TTS synthesis, genuinely zero-latency.
 * Separate from `useSelfVoicing`'s queue on purpose: these fire on quick
 * user actions (clock in/out) where queuing behind a stale cue would be
 * wrong — a new cue interrupts whatever's still playing instead.
 */
export function useVoiceCues(): VoiceCues {
  const enabled = useSettingsStore((s) => s.selfVoicingEnabled);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const play = useCallback(
    (id: VoiceCueId) => {
      if (!enabled) return;
      audioRef.current?.pause();
      const audio = new Audio(CUE_FILES[id]);
      audioRef.current = audio;
      // play() isn't guaranteed to return a real Promise in every
      // environment (jsdom's stub returns undefined) — guard before
      // chaining .catch(), which would otherwise throw synchronously.
      audio.play()?.catch(() => {
        // Autoplay/permissions can reject this in some contexts — a
        // missed cue isn't worth surfacing an error over.
      });
    },
    [enabled],
  );

  return { play };
}
