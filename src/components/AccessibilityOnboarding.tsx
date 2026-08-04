import { useSettingsStore } from "../store/StoreProvider";

/**
 * Shown once, ever, before the general coach mark — self-voicing and
 * speech-to-text are introduced explicitly as accessibility features
 * with an immediate opt-out right here, per CLAUDE.md. Both default on;
 * unchecking either just calls the same setters Settings uses, so
 * there's nothing special about "declining" versus changing your mind
 * in Settings later.
 */
export function AccessibilityOnboarding({ onDone }: { onDone: () => void }) {
  const selfVoicingEnabled = useSettingsStore((s) => s.selfVoicingEnabled);
  const sttEnabled = useSettingsStore((s) => s.sttEnabled);
  const setSelfVoicingEnabled = useSettingsStore((s) => s.setSelfVoicingEnabled);
  const setSttEnabled = useSettingsStore((s) => s.setSttEnabled);
  const markSeen = useSettingsStore((s) => s.markAccessibilityOnboardingSeen);

  async function handleContinue() {
    await markSeen();
    onDone();
  }

  return (
    <div
      role="dialog"
      aria-label="Accessibility features"
      className="absolute inset-3 flex flex-col justify-center rounded-[14px] border p-4"
      style={{ background: "var(--paper-card)", borderColor: "var(--line)" }}
    >
      <div className="mb-2 text-[0.72rem] tracking-wide text-[var(--ink-faint)] uppercase">
        Before you start
      </div>
      <p className="mb-3 text-[0.82rem] leading-relaxed text-[var(--ink)]">
        Mycelia Time can speak its own interface aloud in a natural voice
        — never Windows' built-in Narrator — and let you dictate instead
        of typing anywhere in the app. Both are on by default; turn
        either off now, or any time later in Settings.
      </p>

      <label className="mb-2 flex items-start gap-2 text-[0.82rem] text-[var(--ink)]">
        <input
          type="checkbox"
          checked={selfVoicingEnabled}
          onChange={(e) => setSelfVoicingEnabled(e.target.checked)}
          className="mt-0.5"
        />
        Speak the app aloud
      </label>
      <label className="mb-4 flex items-start gap-2 text-[0.82rem] text-[var(--ink)]">
        <input
          type="checkbox"
          checked={sttEnabled}
          onChange={(e) => setSttEnabled(e.target.checked)}
          className="mt-0.5"
        />
        Let me dictate instead of typing
      </label>

      <button
        type="button"
        onClick={handleContinue}
        className="self-start rounded-lg bg-[var(--moss)] px-3 py-1.5 text-[0.78rem] text-white"
      >
        Continue
      </button>
    </div>
  );
}
