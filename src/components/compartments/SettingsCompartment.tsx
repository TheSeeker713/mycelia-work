import { useEffect, useState } from "react";
import { useRewardsClient, useSettingsStore, useVoiceClient } from "../../store/StoreProvider";
import { useSelfVoicing } from "../../hooks/useSelfVoicing";
import { classifyVoicePerformance, measureTtsLatencySeconds, type VoicePerformance } from "../../services/hardwareCheck";
import { PIPER_VOICES } from "../../services/voiceClient";

function RewardsSection() {
  const eighteenPlusEnabled = useSettingsStore((s) => s.eighteenPlusEnabled);
  const setEighteenPlusEnabled = useSettingsStore((s) => s.setEighteenPlusEnabled);
  const rewardsClient = useRewardsClient();
  const [assets, setAssets] = useState<string[] | null>(null);

  useEffect(() => {
    if (!eighteenPlusEnabled) return;
    rewardsClient.listAssets().then(setAssets);
  }, [eighteenPlusEnabled, rewardsClient]);

  return (
    <div className="mt-2 border-t border-dashed border-[var(--line)] pt-3">
      <div className="mb-1.5 text-[0.7rem] tracking-wide text-[var(--ink-faint)] uppercase">
        Rewards
      </div>
      <label className="flex items-start gap-2 text-[0.82rem] text-[var(--ink)]">
        <input
          type="checkbox"
          checked={eighteenPlusEnabled}
          onChange={(e) => setEighteenPlusEnabled(e.target.checked)}
          className="mt-0.5"
        />
        18+
      </label>
      {eighteenPlusEnabled && (
        <div className="mt-2">
          {!assets ? (
            <p className="text-[0.78rem] text-[var(--ink-faint)]">Loading…</p>
          ) : assets.length === 0 ? (
            <p className="text-[0.78rem] text-[var(--ink-faint)]">Nothing unlocked yet.</p>
          ) : (
            <p className="text-[0.78rem] text-[var(--ink-soft)]">{assets.length} unlocked.</p>
          )}
        </div>
      )}
    </div>
  );
}

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
  const piperVoiceId = useSettingsStore((s) => s.piperVoiceId);
  const aiSuggestionsEnabled = useSettingsStore((s) => s.aiSuggestionsEnabled);
  const captureLoggingEnabled = useSettingsStore((s) => s.captureLoggingEnabled);
  const setSelfVoicingEnabled = useSettingsStore((s) => s.setSelfVoicingEnabled);
  const setSttEnabled = useSettingsStore((s) => s.setSttEnabled);
  const setPiperVoiceId = useSettingsStore((s) => s.setPiperVoiceId);
  const setAiSuggestionsEnabled = useSettingsStore((s) => s.setAiSuggestionsEnabled);
  const setCaptureLoggingEnabled = useSettingsStore((s) => s.setCaptureLoggingEnabled);
  const rewardsUnlocked = useSettingsStore((s) => s.rewardsUnlocked);
  const voiceClient = useVoiceClient();
  const selfVoicing = useSelfVoicing();

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
      <label className="mb-3 flex items-start gap-2 text-[0.82rem] text-[var(--ink)]">
        <input
          type="checkbox"
          checked={aiSuggestionsEnabled}
          onChange={(e) => setAiSuggestionsEnabled(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          AI writing suggestions
          <span className="block text-[0.72rem] text-[var(--ink-faint)]">
            Ghost-text continuations while writing in zen mode — Tab to accept.
          </span>
        </span>
      </label>

      <div className="mt-1 border-t border-dashed border-[var(--line)] pt-3">
        <div className="mb-1.5 text-[0.7rem] tracking-wide text-[var(--ink-faint)] uppercase">
          Voice
        </div>
        <div className="flex items-center gap-2">
          <select
            value={piperVoiceId}
            onChange={(e) => setPiperVoiceId(e.target.value)}
            aria-label="Narration voice"
            className="flex-1 rounded-lg border border-[var(--line)] bg-[var(--paper)] px-2.5 py-1.5 text-[0.8rem] text-[var(--ink)] outline-none"
          >
            {PIPER_VOICES.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() =>
              selfVoicing.speaking
                ? selfVoicing.stop()
                : selfVoicing.speak("This is what I sound like.")
            }
            className="flex-shrink-0 rounded-full border border-[var(--line)] px-2.5 py-1 text-[0.7rem] text-[var(--ink-soft)]"
          >
            {selfVoicing.speaking ? "Stop" : "Preview"}
          </button>
        </div>
      </div>

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

      <div className="mt-2 border-t border-dashed border-[var(--line)] pt-3">
        <div className="mb-1.5 text-[0.7rem] tracking-wide text-[var(--ink-faint)] uppercase">
          Capture
        </div>
        <label className="flex items-start gap-2 text-[0.82rem] text-[var(--ink)]">
          <input
            type="checkbox"
            checked={captureLoggingEnabled}
            onChange={(e) => setCaptureLoggingEnabled(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Log capture-agent activity
            <span className="block text-[0.72rem] text-[var(--ink-faint)]">
              Every note/todo/milestone routed by the capture drawer — including declines
              and clarify questions — is saved locally on this machine only, never sent
              anywhere else.
            </span>
          </span>
        </label>
      </div>

      {rewardsUnlocked && <RewardsSection />}
    </div>
  );
}
