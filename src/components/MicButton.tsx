import { useSpeechToText } from "../hooks/useSpeechToText";

/**
 * Universal speech-to-text entry point — per CLAUDE.md, meant to show up
 * on every text input in the app, not one feature's drawer. Renders
 * nothing when the STT setting is off, so a disabled feature doesn't
 * leave a dead button sitting around.
 */
export function MicButton({ onTranscribed }: { onTranscribed: (text: string) => void }) {
  const stt = useSpeechToText();

  if (!stt.available) return null;

  async function handleClick() {
    if (stt.recording) {
      const text = await stt.stop();
      if (text) onTranscribed(text);
      return;
    }
    await stt.start();
  }

  const label = stt.transcribing
    ? "Transcribing…"
    : stt.recording
      ? "Stop recording"
      : "Dictate with your voice";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={stt.transcribing}
      aria-label={label}
      title={stt.error ?? label}
      className="flex-shrink-0 rounded-full border px-2 py-1.5 text-[0.85rem]"
      style={{
        borderColor: stt.recording ? "var(--rust)" : "var(--line)",
        color: stt.recording ? "var(--rust)" : "var(--ink-soft)",
      }}
    >
      {stt.transcribing ? "…" : "🎤"}
    </button>
  );
}
