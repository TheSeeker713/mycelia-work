import { create } from "zustand";
import type { Repositories } from "../data";
import { DEFAULT_PIPER_VOICE_ID } from "../services/voiceClient";

/** Both accessibility features default ON — CLAUDE.md: introduced during onboarding with an immediate opt-out, not opt-in. */
const SELF_VOICING_KEY = "self_voicing_enabled";
const STT_KEY = "stt_enabled";
const ONBOARDING_SEEN_KEY = "accessibility_onboarding_seen";
const PIPER_VOICE_ID_KEY = "piper_voice_id";
/** Both default OFF/locked — the hidden-unlock flow and the 18+ toggle inside it, per Jeremy's explicit spec (2026-08-04). */
const REWARDS_UNLOCKED_KEY = "rewards_unlocked";
const EIGHTEEN_PLUS_KEY = "eighteen_plus_enabled";
/** Defaults ON like the other AI/accessibility features (introduced with an opt-out, not opt-in) — Phase 8 ghost-text suggestions. */
const AI_SUGGESTIONS_KEY = "ai_suggestions_enabled";
/** Defaults ON, disclosed in Settings — Phase 9 capture-agent logging, per the design doc's "configurable, disclosed plainly" requirement. */
const CAPTURE_LOGGING_KEY = "capture_logging_enabled";

export interface SettingsState {
  loaded: boolean;
  selfVoicingEnabled: boolean;
  sttEnabled: boolean;
  accessibilityOnboardingSeen: boolean;
  piperVoiceId: string;
  rewardsUnlocked: boolean;
  eighteenPlusEnabled: boolean;
  aiSuggestionsEnabled: boolean;
  captureLoggingEnabled: boolean;
  load: () => Promise<void>;
  setSelfVoicingEnabled: (enabled: boolean) => Promise<void>;
  setSttEnabled: (enabled: boolean) => Promise<void>;
  markAccessibilityOnboardingSeen: () => Promise<void>;
  setPiperVoiceId: (voiceId: string) => Promise<void>;
  setRewardsUnlocked: (unlocked: boolean) => Promise<void>;
  setEighteenPlusEnabled: (enabled: boolean) => Promise<void>;
  setAiSuggestionsEnabled: (enabled: boolean) => Promise<void>;
  setCaptureLoggingEnabled: (enabled: boolean) => Promise<void>;
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
    piperVoiceId: DEFAULT_PIPER_VOICE_ID,
    rewardsUnlocked: false,
    eighteenPlusEnabled: false,
    aiSuggestionsEnabled: true,
    captureLoggingEnabled: true,

    async load() {
      const all = await repos.settings.getAll();
      set({
        selfVoicingEnabled: parseBool(all[SELF_VOICING_KEY] ?? null, true),
        sttEnabled: parseBool(all[STT_KEY] ?? null, true),
        accessibilityOnboardingSeen: parseBool(all[ONBOARDING_SEEN_KEY] ?? null, false),
        piperVoiceId: all[PIPER_VOICE_ID_KEY] ?? DEFAULT_PIPER_VOICE_ID,
        rewardsUnlocked: parseBool(all[REWARDS_UNLOCKED_KEY] ?? null, false),
        eighteenPlusEnabled: parseBool(all[EIGHTEEN_PLUS_KEY] ?? null, false),
        aiSuggestionsEnabled: parseBool(all[AI_SUGGESTIONS_KEY] ?? null, true),
        captureLoggingEnabled: parseBool(all[CAPTURE_LOGGING_KEY] ?? null, true),
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

    async setPiperVoiceId(voiceId) {
      await repos.settings.set(PIPER_VOICE_ID_KEY, voiceId);
      set({ piperVoiceId: voiceId });
    },

    async setRewardsUnlocked(unlocked) {
      await repos.settings.set(REWARDS_UNLOCKED_KEY, String(unlocked));
      set({ rewardsUnlocked: unlocked });
    },

    async setEighteenPlusEnabled(enabled) {
      await repos.settings.set(EIGHTEEN_PLUS_KEY, String(enabled));
      set({ eighteenPlusEnabled: enabled });
    },

    async setAiSuggestionsEnabled(enabled) {
      await repos.settings.set(AI_SUGGESTIONS_KEY, String(enabled));
      set({ aiSuggestionsEnabled: enabled });
    },

    async setCaptureLoggingEnabled(enabled) {
      await repos.settings.set(CAPTURE_LOGGING_KEY, String(enabled));
      set({ captureLoggingEnabled: enabled });
    },
  }));
}

export type SettingsStore = ReturnType<typeof createSettingsStore>;
