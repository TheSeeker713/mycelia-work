import { create } from "zustand";
import type { Repositories } from "../data";
import { DEFAULT_VOICE_ID } from "../services/voiceClient";
import {
  DEFAULT_LOCAL_MODEL_ID,
  GROK4_ENABLED_KEY,
  LOCAL_MODEL_ID_KEY,
  PREFERRED_MODEL_KEY,
} from "../services/openclawClient";

/** Both accessibility features default ON — CLAUDE.md: introduced during onboarding with an immediate opt-out, not opt-in. */
const SELF_VOICING_KEY = "self_voicing_enabled";
const STT_KEY = "stt_enabled";
const ONBOARDING_SEEN_KEY = "accessibility_onboarding_seen";
const NARRATION_VOICE_ID_KEY = "narration_voice_id";
/** Defaults ON like the other AI/accessibility features (introduced with an opt-out, not opt-in) — Phase 8 ghost-text suggestions. */
const AI_SUGGESTIONS_KEY = "ai_suggestions_enabled";
/** Defaults ON, disclosed in Settings — Phase 9 capture-agent logging, per the design doc's "configurable, disclosed plainly" requirement. */
const CAPTURE_LOGGING_KEY = "capture_logging_enabled";
/**
 * The standalone Journal's own "Muse" AI-suggest toggle (Phase 16.5) —
 * independent of `aiSuggestionsEnabled` above (that one's Notes' zen
 * mode), not a mirror of it, per the design: a deliberate per-editor,
 * in-header control. Only defaults from `aiSuggestionsEnabled`'s value
 * on the very first read (no stored key yet) so a user who's already
 * opted into AI suggestions elsewhere isn't surprised by Muse starting
 * off — after that, the two are fully decoupled.
 */
const JOURNAL_MUSE_KEY = "journal_muse_enabled";
// GROK4_ENABLED_KEY (defaults OFF, per Jeremy's explicit instruction) and
// LOCAL_MODEL_ID_KEY are imported above, not declared here —
// openclawClient.ts owns them since it's the module that actually reads
// the raw persisted values.

export interface SettingsState {
  loaded: boolean;
  selfVoicingEnabled: boolean;
  sttEnabled: boolean;
  accessibilityOnboardingSeen: boolean;
  narrationVoiceId: string;
  aiSuggestionsEnabled: boolean;
  captureLoggingEnabled: boolean;
  grok4Enabled: boolean;
  localModelId: string;
  /** Cloud model a Grok-on request should ideally land on. Empty means no preference. */
  preferredModel: string;
  museEnabled: boolean;
  load: () => Promise<void>;
  setSelfVoicingEnabled: (enabled: boolean) => Promise<void>;
  setSttEnabled: (enabled: boolean) => Promise<void>;
  markAccessibilityOnboardingSeen: () => Promise<void>;
  setNarrationVoiceId: (voiceId: string) => Promise<void>;
  setAiSuggestionsEnabled: (enabled: boolean) => Promise<void>;
  setCaptureLoggingEnabled: (enabled: boolean) => Promise<void>;
  setGrok4Enabled: (enabled: boolean) => Promise<void>;
  setLocalModelId: (modelId: string) => Promise<void>;
  setPreferredModel: (modelId: string) => Promise<void>;
  setMuseEnabled: (enabled: boolean) => Promise<void>;
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
    localModelId: DEFAULT_LOCAL_MODEL_ID,
    preferredModel: "",
    museEnabled: true,

    async load() {
      const all = await repos.settings.getAll();
      const aiSuggestionsEnabled = parseBool(all[AI_SUGGESTIONS_KEY] ?? null, true);
      set({
        selfVoicingEnabled: parseBool(all[SELF_VOICING_KEY] ?? null, true),
        sttEnabled: parseBool(all[STT_KEY] ?? null, true),
        accessibilityOnboardingSeen: parseBool(all[ONBOARDING_SEEN_KEY] ?? null, false),
        narrationVoiceId: all[NARRATION_VOICE_ID_KEY] ?? DEFAULT_VOICE_ID,
        aiSuggestionsEnabled,
        captureLoggingEnabled: parseBool(all[CAPTURE_LOGGING_KEY] ?? null, true),
        grok4Enabled: parseBool(all[GROK4_ENABLED_KEY] ?? null, false),
        localModelId: all[LOCAL_MODEL_ID_KEY] ?? DEFAULT_LOCAL_MODEL_ID,
        preferredModel: all[PREFERRED_MODEL_KEY] ?? "",
        // No stored key yet -> default from aiSuggestionsEnabled; once set, fully independent.
        museEnabled: parseBool(all[JOURNAL_MUSE_KEY] ?? null, aiSuggestionsEnabled),
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

    async setLocalModelId(modelId) {
      await repos.settings.set(LOCAL_MODEL_ID_KEY, modelId);
      set({ localModelId: modelId });
    },

    async setPreferredModel(modelId) {
      await repos.settings.set(PREFERRED_MODEL_KEY, modelId);
      set({ preferredModel: modelId });
    },

    async setMuseEnabled(enabled) {
      await repos.settings.set(JOURNAL_MUSE_KEY, String(enabled));
      set({ museEnabled: enabled });
    },
  }));
}

export type SettingsStore = ReturnType<typeof createSettingsStore>;
