import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsCompartment } from "../SettingsCompartment";
import { StoreProvider } from "../../../store/StoreProvider";
import { initDatabase, type Repositories } from "../../../data";
import { createTestExecutor } from "../../../data/__tests__/testExecutor";
import { DEFAULT_VOICE_ID, type VoiceClient } from "../../../services/voiceClient";

let repos: Repositories;
let voiceClient: VoiceClient;

beforeEach(async () => {
  repos = await initDatabase(createTestExecutor());
  voiceClient = {
    speak: vi.fn().mockResolvedValue(new Blob(["wav"])),
    transcribe: vi.fn(),
    isTtsAvailable: vi.fn(),
    isSttAvailable: vi.fn(),
  };
});

function renderSettings() {
  return render(
    <StoreProvider repositories={repos} voiceClient={voiceClient}>
      <SettingsCompartment />
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

  it("toggling AI writing suggestions off persists it independently", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByLabelText(/AI writing suggestions/));
    expect(await repos.settings.get("ai_suggestions_enabled")).toBe("false");
    expect(await repos.settings.get("self_voicing_enabled")).toBeNull();
  });

  it("toggling capture-agent logging off persists it independently", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByLabelText(/Log capture-agent activity/));
    expect(await repos.settings.get("capture_logging_enabled")).toBe("false");
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
    expect(screen.getByLabelText("Narration voice")).toHaveValue(DEFAULT_VOICE_ID);
  });

  it("the voice picker offers only the locked-in Heart voice", () => {
    renderSettings();
    const picker = screen.getByLabelText("Narration voice") as HTMLSelectElement;
    expect(Array.from(picker.options).map((o) => o.value)).toEqual(["af_heart"]);
    expect(Array.from(picker.options).map((o) => o.textContent)).toEqual(["Heart"]);
  });

  it("Preview speaks a sample line using the currently selected voice", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByText("Preview"));

    await waitFor(() =>
      expect(voiceClient.speak).toHaveBeenCalledWith("This is what I sound like.", DEFAULT_VOICE_ID),
    );
  });

  it("no Rewards/18+ hidden-unlock UI exists anymore", () => {
    renderSettings();
    expect(screen.queryByText("Rewards")).not.toBeInTheDocument();
    expect(screen.queryByText("18+")).not.toBeInTheDocument();
  });
});
