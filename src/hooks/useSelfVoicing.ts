import { useCallback, useEffect, useRef, useState } from "react";
import { useSettingsStore, useVoiceClient } from "../store/StoreProvider";

export interface SelfVoicing {
  /** Enqueues text to be spoken — a no-op while the setting is off, or for empty text. Fails soft on any voice-service error. */
  speak: (text: string) => void;
  /** Clears anything queued and stops whatever's currently playing. */
  stop: () => void;
  speaking: boolean;
}

/**
 * Self-voicing per CLAUDE.md's firm accessibility rule: the app narrates
 * its own UI with natural-voice TTS (Piper, via `voiceClient`), not
 * Windows Narrator, not layered on top of it. One utterance plays at a
 * time, queued in call order — predictable, not overlapping chaos.
 */
export function useSelfVoicing(): SelfVoicing {
  const enabled = useSettingsStore((s) => s.selfVoicingEnabled);
  const voiceId = useSettingsStore((s) => s.piperVoiceId);
  const client = useVoiceClient();
  const [speaking, setSpeaking] = useState(false);

  const queueRef = useRef<string[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const processingRef = useRef(false);
  const stoppedRef = useRef(false);

  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;

    while (queueRef.current.length > 0 && !stoppedRef.current) {
      const text = queueRef.current.shift() as string;
      const blob = await client.speak(text, voiceId);
      if (!blob || stoppedRef.current) continue;

      const url = URL.createObjectURL(blob);
      setSpeaking(true);
      try {
        await new Promise<void>((resolve) => {
          const audio = new Audio(url);
          audioRef.current = audio;
          audio.onended = () => resolve();
          audio.onerror = () => resolve();
          // play() isn't guaranteed to return a real Promise in every
          // environment (jsdom's stub returns undefined) — guard before
          // chaining .catch(), which would otherwise throw synchronously.
          audio.play()?.catch(() => resolve());
        });
      } finally {
        URL.revokeObjectURL(url);
      }
    }

    audioRef.current = null;
    setSpeaking(false);
    processingRef.current = false;
  }, [client, voiceId]);

  const speak = useCallback(
    (text: string) => {
      if (!enabled) return;
      const trimmed = text.trim();
      if (!trimmed) return;
      stoppedRef.current = false;
      queueRef.current.push(trimmed);
      processQueue();
    },
    [enabled, processQueue],
  );

  const stop = useCallback(() => {
    stoppedRef.current = true;
    queueRef.current = [];
    audioRef.current?.pause();
    setSpeaking(false);
  }, []);

  useEffect(() => stop, [stop]);

  return { speak, stop, speaking };
}
