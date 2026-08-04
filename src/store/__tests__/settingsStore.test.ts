import { beforeEach, describe, expect, it } from "vitest";
import { initDatabase, type Repositories } from "../../data";
import { createTestExecutor } from "../../data/__tests__/testExecutor";
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
});
