import { useState } from "react";
import { useSettingsStore, useVoiceClient } from "../../store/StoreProvider";
import { useSelfVoicing } from "../../hooks/useSelfVoicing";
import { classifyVoicePerformance, measureTtsLatencySeconds, type VoicePerformance } from "../../services/hardwareCheck";
import { NARRATION_VOICES } from "../../services/voiceClient";
import { LOCAL_MODELS } from "../../services/openclawClient";

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
  const narrationVoiceId = useSettingsStore((s) => s.narrationVoiceId);
  const aiSuggestionsEnabled = useSettingsStore((s) => s.aiSuggestionsEnabled);
  const captureLoggingEnabled = useSettingsStore((s) => s.captureLoggingEnabled);
  const setSelfVoicingEnabled = useSettingsStore((s) => s.setSelfVoicingEnabled);
  const setSttEnabled = useSettingsStore((s) => s.setSttEnabled);
  const setNarrationVoiceId = useSettingsStore((s) => s.setNarrationVoiceId);
  const setAiSuggestionsEnabled = useSettingsStore((s) => s.setAiSuggestionsEnabled);
  const setCaptureLoggingEnabled = useSettingsStore((s) => s.setCaptureLoggingEnabled);
  const grok4Enabled = useSettingsStore((s) => s.grok4Enabled);
  const setGrok4Enabled = useSettingsStore((s) => s.setGrok4Enabled);
  const localModelId = useSettingsStore((s) => s.localModelId);
  const preferredModel = useSettingsStore((s) => s.preferredModel);
  const setPreferredModel = useSettingsStore((s) => s.setPreferredModel);
  const falKey = useSettingsStore((s) => s.falKey);
  const setFalKey = useSettingsStore((s) => s.setFalKey);
  const replicateKey = useSettingsStore((s) => s.replicateKey);
  const setReplicateKey = useSettingsStore((s) => s.setReplicateKey);
  const setLocalModelId = useSettingsStore((s) => s.setLocalModelId);
  const voiceClient = useVoiceClient();
  const selfVoicing = useSelfVoicing();

  const [performance, setPerformance] = useState<VoicePerformance | "checking" | null>(null);

  async function runPerformanceCheck() {
    setPerformance("checking");
    const seconds = await measureTtsLatencySeconds(voiceClient);
    setPerformance(classifyVoicePerformance(seconds));
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
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
            value={narrationVoiceId}
            onChange={(e) => setNarrationVoiceId(e.target.value)}
            aria-label="Narration voice"
            className="flex-1 rounded-lg border border-[var(--line)] bg-[var(--paper)] px-2.5 py-1.5 text-[0.8rem] text-[var(--ink)] outline-none"
          >
            {NARRATION_VOICES.map((v) => (
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
          AI model
        </div>
        <label className="flex items-start gap-2 text-[0.82rem] text-[var(--ink)]">
          <input
            type="checkbox"
            checked={grok4Enabled}
            onChange={(e) => setGrok4Enabled(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Use Grok 4.5 (cloud)
            <span className="block text-[0.72rem] text-[var(--ink-faint)]">
              Off by default — AI replies use a local model only. Turning
              this on lets OpenClaw reach for Grok 4.5 (Jeremy's own paid
              subscription) when it's the better fit.
            </span>
          </span>
        </label>
        {!grok4Enabled && (
          <div className="mt-2">
            <select
              value={localModelId}
              onChange={(e) => setLocalModelId(e.target.value)}
              aria-label="Local model"
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--paper)] px-2.5 py-1.5 text-[0.8rem] text-[var(--ink)] outline-none"
            >
              {LOCAL_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[0.72rem] text-[var(--ink-faint)]">
              Which installed Ollama model answers while Grok is off.
            </span>
          </div>
        )}
        {grok4Enabled && (
          <div className="mt-2">
            <input
              value={preferredModel}
              onChange={(e) => setPreferredModel(e.target.value)}
              placeholder="xai/grok-4.5"
              aria-label="Preferred model"
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--paper)] px-2.5 py-1.5 text-[0.8rem] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
            />
            <span className="mt-1 block text-[0.72rem] text-[var(--ink-faint)]">
              The model a reply should land on. If something else answers,
              it's asked again explicitly, and the badge on the report says
              which model actually replied. Leave empty for no preference.
            </span>
          </div>
        )}
      </div>

      <div className="mt-2 border-t border-dashed border-[var(--line)] pt-3">
        <div className="mb-1.5 text-[0.7rem] tracking-wide text-[var(--ink-faint)] uppercase">
          Updates
        </div>
        <p className="text-[0.75rem] text-[var(--ink-soft)]">
          This is an internal app. There is no online update check. A new
          build is a local rebuild and reinstall: <code>npm run tauri build</code>.
        </p>
      </div>

      <div className="mt-2 border-t border-dashed border-[var(--line)] pt-3">
        <div className="mb-1.5 text-[0.7rem] tracking-wide text-[var(--ink-faint)] uppercase">
          Animation
        </div>
        <p className="mb-2 text-[0.75rem] text-[var(--ink-soft)]">
          Animating reward art already works with no setup, using a free public
          model with a small shared daily limit. These are only worth filling in
          if that limit gets in the way.
        </p>
        <input
          type="password"
          value={falKey}
          onChange={(e) => setFalKey(e.target.value)}
          placeholder="fal.ai key (optional)"
          aria-label="fal.ai key"
          className="w-full rounded-lg border border-[var(--line)] bg-[var(--paper)] px-2.5 py-1.5 text-[0.8rem] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
        />
        <input
          type="password"
          value={replicateKey}
          onChange={(e) => setReplicateKey(e.target.value)}
          placeholder="Replicate token (optional)"
          aria-label="Replicate token"
          className="mt-1.5 w-full rounded-lg border border-[var(--line)] bg-[var(--paper)] px-2.5 py-1.5 text-[0.8rem] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
        />
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
    </div>
  );
}
