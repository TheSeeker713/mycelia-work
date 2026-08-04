import { useCallback, useRef, useState } from "react";
import { useSettingsStore, useVoiceClient } from "../store/StoreProvider";

export interface SpeechToText {
  /** The `sttEnabled` setting — a mic icon should hide/disable itself when this is false. */
  available: boolean;
  recording: boolean;
  transcribing: boolean;
  error: string | null;
  start: () => Promise<void>;
  /** Stops recording, transcribes what was captured, and resolves with the text — `null` on any failure (mic denied, transcription unreachable). */
  stop: () => Promise<string | null>;
}

/**
 * Universal speech-to-text — per CLAUDE.md, available anywhere in the
 * app a user needs to type, not owned by one feature's drawer. Records
 * via MediaRecorder, transcribes via faster-whisper (`voiceClient`).
 */
export function useSpeechToText(): SpeechToText {
  const available = useSettingsStore((s) => s.sttEnabled);
  const client = useVoiceClient();
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const start = useCallback(async () => {
    if (!available || recorderRef.current) return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Microphone access failed.");
    }
  }, [available]);

  const stop = useCallback(async (): Promise<string | null> => {
    const recorder = recorderRef.current;
    if (!recorder) return null;

    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: "audio/webm" }));
      recorder.stop();
    });

    streamRef.current?.getTracks().forEach((t) => t.stop());
    recorderRef.current = null;
    streamRef.current = null;
    setRecording(false);

    setTranscribing(true);
    const text = await client.transcribe(blob);
    setTranscribing(false);
    if (text === null) setError("Couldn't reach the local transcription service.");
    return text;
  }, [client]);

  return { available, recording, transcribing, error, start, stop };
}
