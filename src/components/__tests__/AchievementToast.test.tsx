import { useEffect } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AchievementToastStack } from "../AchievementToast";
import { StoreProvider, useGamificationStore } from "../../store/StoreProvider";
import { initDatabase, type Repositories } from "../../data";
import { createTestExecutor } from "../../data/__tests__/testExecutor";
import type { VoiceClient } from "../../services/voiceClient";

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

function Harness() {
  const load = useGamificationStore((s) => s.load);
  const recordClockIn = useGamificationStore((s) => s.recordClockIn);
  const recordProjectFinished = useGamificationStore((s) => s.recordProjectFinished);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <button onClick={() => recordClockIn()}>clock-in</button>
      <button onClick={() => recordProjectFinished()}>finish-project</button>
      <AchievementToastStack />
    </>
  );
}

function renderHarness() {
  return render(
    <StoreProvider repositories={repos} voiceClient={voiceClient}>
      <Harness />
    </StoreProvider>,
  );
}

describe("AchievementToastStack", () => {
  it("renders nothing when there are no pending toasts", async () => {
    renderHarness();
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  });

  it("shows a sticker toast after an action that earns one", async () => {
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByText("finish-project"));

    expect(await screen.findByText("Sticker earned")).toBeInTheDocument();
    expect(screen.getByText("Project Finished")).toBeInTheDocument();
  });

  it("dismisses on its own after the auto-dismiss window", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderHarness();

      await user.click(screen.getByText("finish-project"));
      expect(await screen.findByText("Sticker earned")).toBeInTheDocument();

      vi.advanceTimersByTime(4600);
      await waitFor(() => expect(screen.queryByText("Sticker earned")).not.toBeInTheDocument());
    } finally {
      vi.useRealTimers();
    }
  });

  it("an ordinary clock-in never speaks (no welcome-back toast, no voice line)", async () => {
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByText("clock-in"));
    await waitFor(() => expect(screen.getByText("clock-in")).toBeInTheDocument());

    expect(screen.queryByText("Welcome back")).not.toBeInTheDocument();
    expect(voiceClient.speak).not.toHaveBeenCalled();
  });

  it("a qualifying gap shows the welcome-back toast and speaks its voice line", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.setSystemTime(new Date("2026-08-06T09:00:00"));
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderHarness();

      await user.click(screen.getByText("clock-in"));
      await waitFor(() => expect(screen.getByText("clock-in")).toBeInTheDocument());

      vi.setSystemTime(new Date("2026-08-11T09:00:00")); // 5-day gap
      await user.click(screen.getByText("clock-in"));

      expect(await screen.findByText("Welcome back")).toBeInTheDocument();
      expect(voiceClient.speak).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
