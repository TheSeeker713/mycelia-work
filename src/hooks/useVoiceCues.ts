import { useCallback, useRef } from "react";
import { useSettingsStore } from "../store/StoreProvider";
import { DEFAULT_VOICE_ID } from "../services/voiceClient";
import pleaseWaitAfHeart200 from "../assets/audio/please-wait-af_heart_200.wav?url";
import pleaseWaitAfHeart150 from "../assets/audio/please-wait-af_heart_150.wav?url";
import pleaseWaitAfHeart100 from "../assets/audio/please-wait-af_heart_100.wav?url";
import pleaseWaitAfSarah from "../assets/audio/please-wait-af_sarah.wav?url";
import pleaseWaitAfSky from "../assets/audio/please-wait-af_sky.wav?url";
import pleaseWaitAfNova from "../assets/audio/please-wait-af_nova.wav?url";
import pleaseWaitAfKore from "../assets/audio/please-wait-af_kore.wav?url";
import pleaseWaitAmAdam from "../assets/audio/please-wait-am_adam.wav?url";
import pleaseWaitAmMichael from "../assets/audio/please-wait-am_michael.wav?url";
import pleaseWaitAmOnyx from "../assets/audio/please-wait-am_onyx.wav?url";
import pleaseWaitAmLiam from "../assets/audio/please-wait-am_liam.wav?url";
import pleaseWaitAmEcho from "../assets/audio/please-wait-am_echo.wav?url";

export type VoiceCueId = "please_wait";

/** One "please wait" file per `NARRATION_VOICES` entry (scripts/generate-voice-lines.mjs) — kept as explicit imports (not a dynamic path) so Vite's asset pipeline hashes/bundles each one correctly. */
const PLEASE_WAIT_FILES: Record<string, string> = {
  af_heart_200: pleaseWaitAfHeart200,
  af_heart_150: pleaseWaitAfHeart150,
  af_heart_100: pleaseWaitAfHeart100,
  af_sarah: pleaseWaitAfSarah,
  af_sky: pleaseWaitAfSky,
  af_nova: pleaseWaitAfNova,
  af_kore: pleaseWaitAfKore,
  am_adam: pleaseWaitAmAdam,
  am_michael: pleaseWaitAmMichael,
  am_onyx: pleaseWaitAmOnyx,
  am_liam: pleaseWaitAmLiam,
  am_echo: pleaseWaitAmEcho,
};

export interface VoiceCues {
  play: (id: VoiceCueId) => void;
}

/**
 * Instant playback of the pre-recorded "please wait" cue — no network
 * call, no live TTS synthesis, genuinely zero-latency. It covers a real
 * network-call wait (check-in conversation turns); routing it through
 * live self-voicing would add a second network round-trip in front of
 * the one it's meant to cover. Every other cue (clock in/out, breaks)
 * moved to live self-voicing (`useSelfVoicing`) once the narration
 * engine (Kokoro) became something worth actually hearing.
 *
 * Picks the file matching whichever narration voice is currently
 * selected (Phase 16.6 — one file per roster entry, not a single fixed
 * voice), falling back to the default voice's file if a specific
 * combination's asset is somehow missing.
 */
export function useVoiceCues(): VoiceCues {
  const enabled = useSettingsStore((s) => s.selfVoicingEnabled);
  const narrationVoiceId = useSettingsStore((s) => s.narrationVoiceId);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const play = useCallback(
    (id: VoiceCueId) => {
      if (!enabled) return;
      if (id !== "please_wait") return;
      const src =
        PLEASE_WAIT_FILES[narrationVoiceId] ??
        PLEASE_WAIT_FILES[DEFAULT_VOICE_ID] ??
        Object.values(PLEASE_WAIT_FILES)[0];
      audioRef.current?.pause();
      const audio = new Audio(src);
      audioRef.current = audio;
      // play() isn't guaranteed to return a real Promise in every
      // environment (jsdom's stub returns undefined) — guard before
      // chaining .catch(), which would otherwise throw synchronously.
      audio.play()?.catch(() => {
        // Autoplay/permissions can reject this in some contexts — a
        // missed cue isn't worth surfacing an error over.
      });
    },
    [enabled, narrationVoiceId],
  );

  return { play };
}
