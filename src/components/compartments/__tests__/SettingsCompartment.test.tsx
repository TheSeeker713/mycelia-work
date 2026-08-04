import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsCompartment } from "../SettingsCompartment";
import { StoreProvider, useSettingsStore } from "../../../store/StoreProvider";
import { initDatabase, type Repositories } from "../../../data";
import { createTestExecutor } from "../../../data/__tests__/testExecutor";
import { DEFAULT_PIPER_VOICE_ID, type VoiceClient } from "../../../services/voiceClient";
import type { RewardsClient } from "../../../services/rewardsClient";

let repos: Repositories;
let voiceClient: VoiceClient;
let rewardsClient: RewardsClient;

beforeEach(async () => {
  repos = await initDatabase(createTestExecutor());
  voiceClient = {
    speak: vi.fn().mockResolvedValue(new Blob(["wav"])),
    transcribe: vi.fn(),
    isTtsAvailable: vi.fn(),
    isSttAvailable: vi.fn(),
  };
  rewardsClient = {
    verifyPassword: vi.fn(),
    listAssets: vi.fn().mockResolvedValue([]),
    readAsset: vi.fn(),
  };
});

function renderSettings() {
  return render(
    <StoreProvider repositories={repos} voiceClient={voiceClient} rewardsClient={rewardsClient}>
      <SettingsCompartment />
    </StoreProvider>,
  );
}

/** Unlocks rewards first (same store instance, since it's a real render), then re-renders SettingsCompartment on top. */
function renderSettingsWithRewardsUnlocked() {
  function Wrapper() {
    const setRewardsUnlocked = useSettingsStore((s) => s.setRewardsUnlocked);
    const rewardsUnlocked = useSettingsStore((s) => s.rewardsUnlocked);
    return (
      <>
        {!rewardsUnlocked && (
          <button onClick={() => setRewardsUnlocked(true)}>unlock-for-test</button>
        )}
        <SettingsCompartment />
      </>
    );
  }
  return render(
    <StoreProvider repositories={repos} voiceClient={voiceClient} rewardsClient={rewardsClient}>
      <Wrapper />
    </StoreProvider>,
  );
}

describe("SettingsCompartment", () => {
  it("toggling self-voicing off persists it", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByLabelText(/Speak the app aloud/));
    expect(await repos.settings.get("self_voicing_enabled")).toBe("false");
  });

  it("toggling STT off persists it independently", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByLabelText(/Let me dictate instead of typing/));
    expect(await repos.settings.get("stt_enabled")).toBe("false");
    expect(await repos.settings.get("self_voicing_enabled")).toBeNull();
  });

  it("running the voice performance check reports fast on a quick response", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByText("Test voice performance"));

    await waitFor(() =>
      expect(screen.getByText(/Fast — feels instant on this machine/)).toBeInTheDocument(),
    );
    expect(voiceClient.speak).toHaveBeenCalled();
  });

  it("reports unavailable and suggests nothing extra when the voice service can't be reached", async () => {
    voiceClient.speak = vi.fn().mockResolvedValue(null);
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByText("Test voice performance"));

    await waitFor(() =>
      expect(screen.getByText(/isn't reachable right now/)).toBeInTheDocument(),
    );
  });

  it("defaults the voice picker to the default voice", () => {
    renderSettings();
    expect(screen.getByLabelText("Narration voice")).toHaveValue(DEFAULT_PIPER_VOICE_ID);
  });

  it("changing the voice picker persists the choice", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.selectOptions(screen.getByLabelText("Narration voice"), "en_US-amy-medium");

    expect(await repos.settings.get("piper_voice_id")).toBe("en_US-amy-medium");
  });

  it("Preview speaks a sample line using the currently selected voice", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.selectOptions(screen.getByLabelText("Narration voice"), "en_US-amy-medium");
    await user.click(screen.getByText("Preview"));

    await waitFor(() =>
      expect(voiceClient.speak).toHaveBeenCalledWith(
        "This is what I sound like.",
        "en_US-amy-medium",
      ),
    );
  });

  it("the Rewards section stays hidden while locked", () => {
    renderSettings();
    expect(screen.queryByText("Rewards")).not.toBeInTheDocument();
    expect(screen.queryByText("18+")).not.toBeInTheDocument();
  });

  it("Rewards appears once unlocked, 18+ off by default", async () => {
    const user = userEvent.setup();
    renderSettingsWithRewardsUnlocked();

    await user.click(screen.getByText("unlock-for-test"));

    expect(await screen.findByText("Rewards")).toBeInTheDocument();
    const toggle = screen.getByLabelText("18+") as HTMLInputElement;
    expect(toggle.checked).toBe(false);
  });

  it("turning 18+ on lists local reward assets via the rewards client", async () => {
    rewardsClient.listAssets = vi.fn().mockResolvedValue(["sticker-1.png", "sticker-2.png"]);
    const user = userEvent.setup();
    renderSettingsWithRewardsUnlocked();
    await user.click(screen.getByText("unlock-for-test"));
    await screen.findByText("Rewards");

    await user.click(screen.getByLabelText("18+"));

    expect(await screen.findByText("2 unlocked.")).toBeInTheDocument();
    expect(rewardsClient.listAssets).toHaveBeenCalled();
  });

  it("turning 18+ on with an empty local folder says plainly that nothing's unlocked yet", async () => {
    const user = userEvent.setup();
    renderSettingsWithRewardsUnlocked();
    await user.click(screen.getByText("unlock-for-test"));
    await screen.findByText("Rewards");

    await user.click(screen.getByLabelText("18+"));

    expect(await screen.findByText("Nothing unlocked yet.")).toBeInTheDocument();
  });
});
