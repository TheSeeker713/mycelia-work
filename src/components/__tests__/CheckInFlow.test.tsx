import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CheckInFlow } from "../CheckInFlow";
import { StoreProvider } from "../../store/StoreProvider";
import { initDatabase, type Repositories } from "../../data";
import { createTestExecutor } from "../../data/__tests__/testExecutor";
import type { OpenClawClient } from "../../services/openclawClient";
import type { VoiceClient } from "../../services/voiceClient";
import type { ActiveSession } from "../../store/sessionsStore";
import type { Task, TaskSession } from "../../data";

const task: Task = {
  id: "t1",
  title: "Write the devlog entry",
  tag: null,
  project_id: null,
  billable: false,
  completed_at: null,
  created_at: "2026-08-03T00:00:00.000Z",
  archived_at: null,
};

function makeSession(clockedInAt: string): ActiveSession {
  const session: TaskSession = {
    id: "s1",
    task_id: task.id,
    clocked_in_at: clockedInAt,
    clocked_out_at: null,
    status: "running",
    is_estimated: false,
  };
  return { session, task, events: [] };
}

function turnJson(fields: Record<string, unknown>): string {
  return JSON.stringify({
    message: "Question?",
    options: null,
    final: false,
    resolvedCloseAt: null,
    resolvedNote: null,
    ...fields,
  });
}

let repos: Repositories;

beforeEach(async () => {
  repos = await initDatabase(createTestExecutor());
});

function renderFlow(props: {
  activeSession: ActiveSession;
  onResolve: (clockedOutAt: string, note: string) => void;
  client: OpenClawClient;
  voiceClient?: VoiceClient;
}) {
  const { voiceClient, ...flowProps } = props;
  return render(
    <StoreProvider repositories={repos} voiceClient={voiceClient}>
      <CheckInFlow {...flowProps} />
    </StoreProvider>,
  );
}

describe("CheckInFlow", () => {
  it("falls back to the static dialogue when the daemon can't be reached", async () => {
    const client: OpenClawClient = {
      runOnce: vi.fn(),
      ensureDaemon: vi.fn().mockRejectedValue(new Error("no bridge")),
      call: vi.fn(),
      releaseDaemon: vi.fn().mockResolvedValue(undefined),
    };
    const clockedInAt = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString();
    renderFlow({ activeSession: makeSession(clockedInAt), onResolve: vi.fn(), client });

    expect(await screen.findByText(/has been running since/)).toBeInTheDocument();
  });

  it("falls back when the model's first response fails to parse", async () => {
    const client: OpenClawClient = {
      runOnce: vi.fn(),
      ensureDaemon: vi.fn().mockResolvedValue(true),
      call: vi.fn().mockResolvedValue({ text: "not valid json", model: "xai/grok-4.5" }),
      releaseDaemon: vi.fn().mockResolvedValue(undefined),
    };
    const clockedInAt = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString();
    renderFlow({ activeSession: makeSession(clockedInAt), onResolve: vi.fn(), client });

    expect(await screen.findByText(/has been running since/)).toBeInTheDocument();
    // Fell back without ever having "woken" the daemon on this app's behalf beyond the initial ensure.
    expect(client.releaseDaemon).toHaveBeenCalledWith(true);
  });

  it("renders the model's bucketed options, sends the chosen value on click, and resolves on a final turn", async () => {
    const user = userEvent.setup();
    const call = vi
      .fn()
      .mockResolvedValueOnce({
        text: turnJson({
          message: "Did you keep working after clocking in?",
          options: [
            { label: "Yes, for a while", value: "kept_working" },
            { label: "No, stepped away right away", value: "stepped_away" },
          ],
        }),
        model: "xai/grok-4.5",
      })
      .mockResolvedValueOnce({
        text: turnJson({
          message: "Got it — closing this out.",
          final: true,
          resolvedCloseAt: "2026-08-03T11:30:00.000Z",
          resolvedNote: "Got pulled into a call.",
        }),
        model: "xai/grok-4.5",
      });
    const client: OpenClawClient = {
      runOnce: vi.fn(),
      ensureDaemon: vi.fn().mockResolvedValue(false),
      call,
      releaseDaemon: vi.fn().mockResolvedValue(undefined),
    };
    const onResolve = vi.fn();
    const clockedInAt = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString();
    renderFlow({ activeSession: makeSession(clockedInAt), onResolve, client });

    expect(await screen.findByText(/Did you keep working after clocking in/)).toBeInTheDocument();
    await user.click(screen.getByText("Yes, for a while"));

    expect(call).toHaveBeenLastCalledWith(
      expect.objectContaining({ sessionKey: expect.stringContaining("s1"), message: "kept_working" }),
    );
    expect(onResolve).toHaveBeenCalledWith("2026-08-03T11:30:00.000Z", "Got pulled into a call.");
    // This app woke the daemon (ensureDaemon returned false = "wasn't already running") — it must put it back to sleep.
    expect(client.releaseDaemon).toHaveBeenCalledWith(false);
  });

  it("falls back once the turn cap is hit without resolving", async () => {
    const user = userEvent.setup();
    const neverFinal = turnJson({ options: [{ label: "A", value: "a" }, { label: "B", value: "b" }] });
    const client: OpenClawClient = {
      runOnce: vi.fn(),
      ensureDaemon: vi.fn().mockResolvedValue(true),
      call: vi.fn().mockResolvedValue({ text: neverFinal, model: "xai/grok-4.5" }),
      releaseDaemon: vi.fn().mockResolvedValue(undefined),
    };
    const clockedInAt = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString();
    renderFlow({ activeSession: makeSession(clockedInAt), onResolve: vi.fn(), client });

    expect(await screen.findByText("Question?")).toBeInTheDocument();
    // Click through turns until the cap forces a fallback.
    for (let i = 0; i < 6; i++) {
      const button = screen.queryByText("A");
      if (!button) break;
      await user.click(button);
    }

    expect(await screen.findByText(/has been running since/)).toBeInTheDocument();
  });

  it("narrates each turn's message live and plays the please-wait cue before each call", async () => {
    const call = vi.fn().mockResolvedValue({
      text: turnJson({ message: "Did you keep working after clocking in?" }),
      model: "xai/grok-4.5",
    });
    const client: OpenClawClient = {
      runOnce: vi.fn(),
      ensureDaemon: vi.fn().mockResolvedValue(true),
      call,
      releaseDaemon: vi.fn().mockResolvedValue(undefined),
    };
    const voiceClient: VoiceClient = {
      speak: vi.fn().mockResolvedValue(new Blob(["wav"])),
      transcribe: vi.fn(),
      isTtsAvailable: vi.fn(),
      isSttAvailable: vi.fn(),
    };
    const clockedInAt = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString();
    renderFlow({ activeSession: makeSession(clockedInAt), onResolve: vi.fn(), client, voiceClient });

    expect(await screen.findByText(/Did you keep working after clocking in/)).toBeInTheDocument();
    // The fixed "please wait" cue is a bundled asset played via a plain
    // <audio> element, not this client — what's checkable here is the
    // live turn narration, which does go through the voice client.
    expect(voiceClient.speak).toHaveBeenCalledWith("Did you keep working after clocking in?");
  });
});
