import { useCallback, useRef } from "react";
import { useSettingsStore } from "../store/StoreProvider";
import pleaseWaitUrl from "../assets/audio/please-wait.wav?url";

export type VoiceCueId = "please_wait";

const CUE_FILES: Record<VoiceCueId, string> = {
  please_wait: pleaseWaitUrl,
};

export interface VoiceCues {
  play: (id: VoiceCueId) => void;
}

/**
 * Instant playback of the fixed, pre-recorded "please wait" cue
 * (scripts/generate-voice-lines.mjs) — no network call, no live TTS
 * synthesis, genuinely zero-latency. It covers a real network-call wait
 * (check-in conversation turns); routing it through live self-voicing
 * would add a second network round-trip in front of the one it's meant
 * to cover. Every other cue (clock in/out, breaks) moved to live
 * self-voicing (`useSelfVoicing`) once the narration engine (Kokoro)
 * became something worth actually hearing.
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
