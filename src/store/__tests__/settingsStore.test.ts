import { beforeEach, describe, expect, it } from "vitest";
import { initDatabase, type Repositories } from "../../data";
import { createTestExecutor } from "../../data/__tests__/testExecutor";
import { DEFAULT_PIPER_VOICE_ID } from "../../services/voiceClient";
import { createSettingsStore, type SettingsStore } from "../settingsStore";

let repos: Repositories;
let useSettings: SettingsStore;

beforeEach(async () => {
  repos = await initDatabase(createTestExecutor());
  useSettings = createSettingsStore(repos);
});

describe("settingsStore", () => {
  it("defaults both accessibility features to enabled before load", () => {
    expect(useSettings.getState().selfVoicingEnabled).toBe(true);
    expect(useSettings.getState().sttEnabled).toBe(true);
    expect(useSettings.getState().loaded).toBe(false);
  });

  it("load reads persisted values, defaulting to enabled when nothing's been saved yet", async () => {
    await useSettings.getState().load();
    expect(useSettings.getState().loaded).toBe(true);
    expect(useSettings.getState().selfVoicingEnabled).toBe(true);
    expect(useSettings.getState().sttEnabled).toBe(true);
    expect(useSettings.getState().accessibilityOnboardingSeen).toBe(false);
  });

  it("setSelfVoicingEnabled persists and updates state, surviving a reload", async () => {
    await useSettings.getState().setSelfVoicingEnabled(false);
    expect(useSettings.getState().selfVoicingEnabled).toBe(false);

    const freshStore = createSettingsStore(repos);
    await freshStore.getState().load();
    expect(freshStore.getState().selfVoicingEnabled).toBe(false);
  });

  it("setSttEnabled persists independently of self-voicing", async () => {
    await useSettings.getState().setSttEnabled(false);
    expect(useSettings.getState().sttEnabled).toBe(false);
    expect(useSettings.getState().selfVoicingEnabled).toBe(true);
  });

  it("markAccessibilityOnboardingSeen persists across reload", async () => {
    await useSettings.getState().markAccessibilityOnboardingSeen();

    const freshStore = createSettingsStore(repos);
    await freshStore.getState().load();
    expect(freshStore.getState().accessibilityOnboardingSeen).toBe(true);
  });

  it("defaults piperVoiceId to the default voice before and after load", async () => {
    expect(useSettings.getState().piperVoiceId).toBe(DEFAULT_PIPER_VOICE_ID);
    await useSettings.getState().load();
    expect(useSettings.getState().piperVoiceId).toBe(DEFAULT_PIPER_VOICE_ID);
  });

  it("setPiperVoiceId persists the choice across reload", async () => {
    await useSettings.getState().setPiperVoiceId("en_US-amy-medium");
    expect(useSettings.getState().piperVoiceId).toBe("en_US-amy-medium");

    const freshStore = createSettingsStore(repos);
    await freshStore.getState().load();
    expect(freshStore.getState().piperVoiceId).toBe("en_US-amy-medium");
  });

  it("defaults rewardsUnlocked and eighteenPlusEnabled to locked/off", async () => {
    expect(useSettings.getState().rewardsUnlocked).toBe(false);
    expect(useSettings.getState().eighteenPlusEnabled).toBe(false);
    await useSettings.getState().load();
    expect(useSettings.getState().rewardsUnlocked).toBe(false);
    expect(useSettings.getState().eighteenPlusEnabled).toBe(false);
  });

  it("setRewardsUnlocked persists across reload", async () => {
    await useSettings.getState().setRewardsUnlocked(true);
    expect(useSettings.getState().rewardsUnlocked).toBe(true);

    const freshStore = createSettingsStore(repos);
    await freshStore.getState().load();
    expect(freshStore.getState().rewardsUnlocked).toBe(true);
  });

  it("setEighteenPlusEnabled persists independently of rewardsUnlocked", async () => {
    await useSettings.getState().setEighteenPlusEnabled(true);
    expect(useSettings.getState().eighteenPlusEnabled).toBe(true);
    expect(useSettings.getState().rewardsUnlocked).toBe(false);
  });

  it("defaults aiSuggestionsEnabled to on before and after load", async () => {
    expect(useSettings.getState().aiSuggestionsEnabled).toBe(true);
    await useSettings.getState().load();
    expect(useSettings.getState().aiSuggestionsEnabled).toBe(true);
  });

  it("setAiSuggestionsEnabled persists the choice across reload", async () => {
    await useSettings.getState().setAiSuggestionsEnabled(false);
    expect(useSettings.getState().aiSuggestionsEnabled).toBe(false);

    const freshStore = createSettingsStore(repos);
    await freshStore.getState().load();
    expect(freshStore.getState().aiSuggestionsEnabled).toBe(false);
  });
});
