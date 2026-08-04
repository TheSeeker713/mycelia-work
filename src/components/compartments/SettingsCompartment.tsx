import { useState } from "react";
import { useSettingsStore, useVoiceClient } from "../../store/StoreProvider";
import { classifyVoicePerformance, measureTtsLatencySeconds, type VoicePerformance } from "../../services/hardwareCheck";

const PERFORMANCE_LABEL: Record<VoicePerformance | "checking", string> = {
  checking: "Checking…",
  fast: "Fast — feels instant on this machine",
  slow: "Slower than expected on this machine",
  unavailable: "Voice service isn't reachable right now",
};

/**
 * Settings → pull-out panel → toggle, per CLAUDE.md. Lives as a
 * compartment tab like everything else in the pocket shell rather than
 * a separate interaction pattern — a real "pull-down" treatment is a
 * later design pass, not blocking these toggles from existing.
 */
export function SettingsCompartment() {
  const selfVoicingEnabled = useSettingsStore((s) => s.selfVoicingEnabled);
  const sttEnabled = useSettingsStore((s) => s.sttEnabled);
  const setSelfVoicingEnabled = useSettingsStore((s) => s.setSelfVoicingEnabled);
  const setSttEnabled = useSettingsStore((s) => s.setSttEnabled);
  const voiceClient = useVoiceClient();

  const [performance, setPerformance] = useState<VoicePerformance | "checking" | null>(null);

  async function runPerformanceCheck() {
    setPerformance("checking");
    const seconds = await measureTtsLatencySeconds(voiceClient);
    setPerformance(classifyVoicePerformance(seconds));
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 text-[0.78rem] font-semibold text-[var(--ink)]">Settings</div>

      <div className="mb-2 text-[0.7rem] tracking-wide text-[var(--ink-faint)] uppercase">
        Accessibility
      </div>
      <label className="mb-2 flex items-start gap-2 text-[0.82rem] text-[var(--ink)]">
        <input
          type="checkbox"
          checked={selfVoicingEnabled}
          onChange={(e) => setSelfVoicingEnabled(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          Speak the app aloud
          <span className="block text-[0.72rem] text-[var(--ink-faint)]">
            Natural-voice narration for AI responses and check-ins — never Windows Narrator.
          </span>
        </span>
      </label>
      <label className="mb-3 flex items-start gap-2 text-[0.82rem] text-[var(--ink)]">
        <input
          type="checkbox"
          checked={sttEnabled}
          onChange={(e) => setSttEnabled(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          Let me dictate instead of typing
          <span className="block text-[0.72rem] text-[var(--ink-faint)]">
            Adds a microphone icon to every text field in the app.
          </span>
        </span>
      </label>

      <div className="mt-2 border-t border-dashed border-[var(--line)] pt-3">
        <div className="mb-1.5 text-[0.7rem] tracking-wide text-[var(--ink-faint)] uppercase">
          Voice performance
        </div>
        {performance && (
          <p className="mb-1.5 text-[0.78rem] text-[var(--ink-soft)]">
            {PERFORMANCE_LABEL[performance]}
            {performance === "slow" &&
              " — consider a cloud text-to-speech/transcription service instead of the local one for a smoother experience."}
          </p>
        )}
        <button
          type="button"
          onClick={runPerformanceCheck}
          disabled={performance === "checking"}
          className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[0.7rem] text-[var(--ink-soft)]"
        >
          {performance ? "Re-test" : "Test voice performance"}
        </button>
      </div>
    </div>
  );
}
