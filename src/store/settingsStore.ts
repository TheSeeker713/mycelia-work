import { create } from "zustand";
import type { Repositories } from "../data";
import { DEFAULT_VOICE_ID } from "../services/voiceClient";
import { GROK4_ENABLED_KEY } from "../services/openclawClient";

/** Both accessibility features default ON — CLAUDE.md: introduced during onboarding with an immediate opt-out, not opt-in. */
const SELF_VOICING_KEY = "self_voicing_enabled";
const STT_KEY = "stt_enabled";
const ONBOARDING_SEEN_KEY = "accessibility_onboarding_seen";
const NARRATION_VOICE_ID_KEY = "narration_voice_id";
/** Defaults ON like the other AI/accessibility features (introduced with an opt-out, not opt-in) — Phase 8 ghost-text suggestions. */
const AI_SUGGESTIONS_KEY = "ai_suggestions_enabled";
/** Defaults ON, disclosed in Settings — Phase 9 capture-agent logging, per the design doc's "configurable, disclosed plainly" requirement. */
const CAPTURE_LOGGING_KEY = "capture_logging_enabled";
// GROK4_ENABLED_KEY (defaults OFF, per Jeremy's explicit instruction) is
// imported above, not declared here — openclawClient.ts owns it since
// it's the module that actually reads the raw persisted value.

export interface SettingsState {
  loaded: boolean;
  selfVoicingEnabled: boolean;
  sttEnabled: boolean;
  accessibilityOnboardingSeen: boolean;
  narrationVoiceId: string;
  aiSuggestionsEnabled: boolean;
  captureLoggingEnabled: boolean;
  grok4Enabled: boolean;
  load: () => Promise<void>;
  setSelfVoicingEnabled: (enabled: boolean) => Promise<void>;
  setSttEnabled: (enabled: boolean) => Promise<void>;
  markAccessibilityOnboardingSeen: () => Promise<void>;
  setNarrationVoiceId: (voiceId: string) => Promise<void>;
  setAiSuggestionsEnabled: (enabled: boolean) => Promise<void>;
  setCaptureLoggingEnabled: (enabled: boolean) => Promise<void>;
  setGrok4Enabled: (enabled: boolean) => Promise<void>;
}

function parseBool(value: string | null, defaultValue: boolean): boolean {
  if (value === null) return defaultValue;
  return value === "true";
}

export function createSettingsStore(repos: Repositories) {
  return create<SettingsState>((set) => ({
    loaded: false,
    selfVoicingEnabled: true,
    sttEnabled: true,
    accessibilityOnboardingSeen: false,
    narrationVoiceId: DEFAULT_VOICE_ID,
    aiSuggestionsEnabled: true,
    captureLoggingEnabled: true,
    grok4Enabled: false,

    async load() {
      const all = await repos.settings.getAll();
      set({
        selfVoicingEnabled: parseBool(all[SELF_VOICING_KEY] ?? null, true),
        sttEnabled: parseBool(all[STT_KEY] ?? null, true),
        accessibilityOnboardingSeen: parseBool(all[ONBOARDING_SEEN_KEY] ?? null, false),
        narrationVoiceId: all[NARRATION_VOICE_ID_KEY] ?? DEFAULT_VOICE_ID,
        aiSuggestionsEnabled: parseBool(all[AI_SUGGESTIONS_KEY] ?? null, true),
        captureLoggingEnabled: parseBool(all[CAPTURE_LOGGING_KEY] ?? null, true),
        grok4Enabled: parseBool(all[GROK4_ENABLED_KEY] ?? null, false),
        loaded: true,
      });
    },

    async setSelfVoicingEnabled(enabled) {
      await repos.settings.set(SELF_VOICING_KEY, String(enabled));
      set({ selfVoicingEnabled: enabled });
    },

    async setSttEnabled(enabled) {
      await repos.settings.set(STT_KEY, String(enabled));
      set({ sttEnabled: enabled });
    },

    async markAccessibilityOnboardingSeen() {
      await repos.settings.set(ONBOARDING_SEEN_KEY, "true");
      set({ accessibilityOnboardingSeen: true });
    },

    async setNarrationVoiceId(voiceId) {
      await repos.settings.set(NARRATION_VOICE_ID_KEY, voiceId);
      set({ narrationVoiceId: voiceId });
    },

    async setAiSuggestionsEnabled(enabled) {
      await repos.settings.set(AI_SUGGESTIONS_KEY, String(enabled));
      set({ aiSuggestionsEnabled: enabled });
    },

    async setCaptureLoggingEnabled(enabled) {
      await repos.settings.set(CAPTURE_LOGGING_KEY, String(enabled));
      set({ captureLoggingEnabled: enabled });
    },

    async setGrok4Enabled(enabled) {
      await repos.settings.set(GROK4_ENABLED_KEY, String(enabled));
      set({ grok4Enabled: enabled });
    },
  }));
}

export type SettingsStore = ReturnType<typeof createSettingsStore>;
