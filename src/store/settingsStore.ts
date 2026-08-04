import { create } from "zustand";
import type { Repositories } from "../data";

/** Both accessibility features default ON — CLAUDE.md: introduced during onboarding with an immediate opt-out, not opt-in. */
const SELF_VOICING_KEY = "self_voicing_enabled";
const STT_KEY = "stt_enabled";
const ONBOARDING_SEEN_KEY = "accessibility_onboarding_seen";

export interface SettingsState {
  loaded: boolean;
  selfVoicingEnabled: boolean;
  sttEnabled: boolean;
  accessibilityOnboardingSeen: boolean;
  load: () => Promise<void>;
  setSelfVoicingEnabled: (enabled: boolean) => Promise<void>;
  setSttEnabled: (enabled: boolean) => Promise<void>;
  markAccessibilityOnboardingSeen: () => Promise<void>;
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

    async load() {
      const all = await repos.settings.getAll();
      set({
        selfVoicingEnabled: parseBool(all[SELF_VOICING_KEY] ?? null, true),
        sttEnabled: parseBool(all[STT_KEY] ?? null, true),
        accessibilityOnboardingSeen: parseBool(all[ONBOARDING_SEEN_KEY] ?? null, false),
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
  }));
}

export type SettingsStore = ReturnType<typeof createSettingsStore>;
