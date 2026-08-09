import { useEffect } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExitConfirmDialog } from "../ExitConfirmDialog";
import { StoreProvider, useJournalsStore, useSettingsStore } from "../../store/StoreProvider";
import { initDatabase, type Repositories } from "../../data";
import { createTestExecutor } from "../../data/__tests__/testExecutor";
import type { OpenClawClient } from "../../services/openclawClient";
import type { WindowControls } from "../../hooks/useWindowControls";

let repos: Repositories;
let openClawClient: OpenClawClient;
let controls: WindowControls;

function fakeControls(): WindowControls {
  return {
    pinned: false,
    togglePin: vi.fn().mockResolvedValue(undefined),
    minimizeToTray: vi.fn().mockResolvedValue(undefined),
    emergencyExit: vi.fn().mockResolvedValue(undefined),
    fullscreen: false,
    enterFullscreen: vi.fn().mockResolvedValue(undefined),
    exitFullscreen: vi.fn().mockResolvedValue(undefined),
  };
}

beforeEach(async () => {
  repos = await initDatabase(createTestExecutor());
  // Grok on so generation routes through the fake OpenClawClient below
  // rather than a real (network-calling) Ollama client — this suite is
  // about the exit flow's control flow, not report generation itself.
  await repos.settings.set("grok4_enabled", "true");
  openClawClient = {
    runOnce: vi.fn(),
    ensureDaemon: vi.fn(),
    call: vi.fn(),
    releaseDaemon: vi.fn(),
    cancelActiveCall: vi.fn().mockResolvedValue(undefined),
  };
  controls = fakeControls();
});

/** Disables self-voicing first, matching useSelfVoicing's own test pattern — keeps these tests about the exit flow's control flow, not audio playback. */
function DisableVoicing({ children }: { children: React.ReactNode }) {
  const setSelfVoicingEnabled = useSettingsStore((s) => s.setSelfVoicingEnabled);
  useEffect(() => {
    void setSelfVoicingEnabled(false);
  }, [setSelfVoicingEnabled]);
  return <>{children}</>;
}

function renderDialog(onCancel = vi.fn()) {
  render(
    <StoreProvider repositories={repos} openClawClient={openClawClient}>
      <DisableVoicing>
        <ExitConfirmDialog controls={controls} onCancel={onCancel} />
      </DisableVoicing>
    </StoreProvider>,
  );
  return { onCancel };
}

describe("ExitConfirmDialog", () => {
  it("with nothing in flight, shows the plain confirmation", async () => {
    renderDialog();
    expect(await screen.findByText("Are you sure you want to exit?")).toBeInTheDocument();
    expect(screen.queryByText("Wait, then exit")).not.toBeInTheDocument();
  });

  it("Exit closes the window when nothing is in flight", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(await screen.findByText("Exit"));

    await waitFor(() => expect(controls.emergencyExit).toHaveBeenCalledTimes(1));
  });

  it("Cancel backs out without touching the window", async () => {
    const user = userEvent.setup();
    const { onCancel } = renderDialog();

    await user.click(await screen.findByText("Cancel"));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(controls.emergencyExit).not.toHaveBeenCalled();
    expect(controls.minimizeToTray).not.toHaveBeenCalled();
  });

  it("Close to tray instead hides the window and dismisses the dialog", async () => {
    const user = userEvent.setup();
    const { onCancel } = renderDialog();

    await user.click(await screen.findByText("Close to tray instead"));

    expect(controls.minimizeToTray).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(controls.emergencyExit).not.toHaveBeenCalled();
  });

  function GenerateOnMount() {
    const generateSessionJournal = useJournalsStore((s) => s.generateSessionJournal);
    useEffect(() => {
      (async () => {
        const task = await repos.tasks.create({ title: "Write the devlog entry" });
        const session = await repos.taskSessions.clockIn(task.id);
        await generateSessionJournal(task, session.id);
      })();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
  }

  it("shows what's generating and offers a real wait-or-exit-now choice while a journal is in flight", async () => {
    let resolveRunOnce: (v: { text: string; model: string }) => void = () => {};
    openClawClient.runOnce = vi.fn(
      () => new Promise<{ text: string; model: string }>((resolve) => { resolveRunOnce = resolve; }),
    );
    const user = userEvent.setup();
    render(
      <StoreProvider repositories={repos} openClawClient={openClawClient}>
        <DisableVoicing>
          <GenerateOnMount />
          <ExitConfirmDialog controls={controls} onCancel={vi.fn()} />
        </DisableVoicing>
      </StoreProvider>,
    );

    expect(await screen.findByText(/Writing a work journal entry/)).toBeInTheDocument();
    expect(screen.getByText("Wait, then exit")).toBeInTheDocument();
    expect(screen.getByText("Exit now anyway")).toBeInTheDocument();

    resolveRunOnce({ text: "Done.", model: "test" });
    await user.click(screen.getByText("Cancel"));
  });

  it("Exit now anyway cancels the call, discards the draft, and exits — a real delete, not an abandoned row", async () => {
    let resolveRunOnce: (v: { text: string; model: string }) => void = () => {};
    openClawClient.runOnce = vi.fn(
      () => new Promise<{ text: string; model: string }>((resolve) => { resolveRunOnce = resolve; }),
    );
    const user = userEvent.setup();
    render(
      <StoreProvider repositories={repos} openClawClient={openClawClient}>
        <DisableVoicing>
          <GenerateOnMount />
          <ExitConfirmDialog controls={controls} onCancel={vi.fn()} />
        </DisableVoicing>
      </StoreProvider>,
    );
    await screen.findByText("Exit now anyway");

    await user.click(screen.getByText("Exit now anyway"));

    await waitFor(() => expect(openClawClient.cancelActiveCall).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(controls.emergencyExit).toHaveBeenCalledTimes(1));
    const remaining = await repos.journals.listRecent(10);
    expect(remaining).toHaveLength(0);

    // Deliberately left unresolved: the real cancellation kills the Rust
    // subprocess so this promise never actually settles in production
    // either — resolving it here would just re-run generation against a
    // row this test already deleted on purpose.
    void resolveRunOnce;
  });

  it("Wait, then exit holds until generation resolves, then exits on its own", async () => {
    let resolveRunOnce: (v: { text: string; model: string }) => void = () => {};
    openClawClient.runOnce = vi.fn(
      () => new Promise<{ text: string; model: string }>((resolve) => { resolveRunOnce = resolve; }),
    );
    const user = userEvent.setup();
    render(
      <StoreProvider repositories={repos} openClawClient={openClawClient}>
        <DisableVoicing>
          <GenerateOnMount />
          <ExitConfirmDialog controls={controls} onCancel={vi.fn()} />
        </DisableVoicing>
      </StoreProvider>,
    );
    await screen.findByText("Wait, then exit");

    await user.click(screen.getByText("Wait, then exit"));
    expect(await screen.findByText(/Waiting for/)).toBeInTheDocument();
    expect(controls.emergencyExit).not.toHaveBeenCalled();

    resolveRunOnce({ text: "Done.", model: "test" });

    await waitFor(() => expect(controls.emergencyExit).toHaveBeenCalledTimes(1));
  });
});
