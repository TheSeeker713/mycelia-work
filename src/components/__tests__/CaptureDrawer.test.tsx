import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CaptureDrawer } from "../CaptureDrawer";
import { StoreProvider } from "../../store/StoreProvider";
import { initDatabase, type Repositories } from "../../data";
import { createTestExecutor } from "../../data/__tests__/testExecutor";
import type { OllamaClient } from "../../services/ollamaClient";
import type { OpenClawClient } from "../../services/openclawClient";
import type { VoiceClient } from "../../services/voiceClient";
import type { CaptureLogClient } from "../../services/captureLogClient";
import type { ResourceWatchdogClient } from "../../services/resourceWatchdog";

let repos: Repositories;
let ollamaClient: OllamaClient;
let openClawClient: OpenClawClient;
let voiceClient: VoiceClient;
let captureLogClient: CaptureLogClient;
let resourceWatchdogClient: ResourceWatchdogClient;
let sessionId: string;

function layer1(text: string) {
  return { text, model: "test" };
}

beforeEach(async () => {
  repos = await initDatabase(createTestExecutor());
  ollamaClient = {
    suggestContinuation: vi.fn(),
    classifyOnTopic: vi.fn().mockResolvedValue(true),
  };
  openClawClient = {
    runOnce: vi.fn().mockResolvedValue(layer1('{"action":"decline","payload":{}}')),
    ensureDaemon: vi.fn(),
    call: vi.fn(),
    releaseDaemon: vi.fn(),
  };
  voiceClient = {
    speak: vi.fn().mockResolvedValue(null),
    transcribe: vi.fn(),
    isTtsAvailable: vi.fn(),
    isSttAvailable: vi.fn(),
  };
  captureLogClient = {
    log: vi.fn().mockResolvedValue(undefined),
    logAiAssist: vi.fn().mockResolvedValue(undefined),
  };
  resourceWatchdogClient = {
    checkPressure: vi.fn().mockResolvedValue({ underPressure: false, cpuPercent: 10, memPercent: 20 }),
  };

  const task = await repos.tasks.create({ title: "Write the devlog entry" });
  const session = await repos.taskSessions.clockIn(task.id);
  sessionId = session.id;
});

function renderDrawer(activeSessionId: string | null = sessionId) {
  return render(
    <StoreProvider
      repositories={repos}
      ollamaClient={ollamaClient}
      openClawClient={openClawClient}
      voiceClient={voiceClient}
      captureLogClient={captureLogClient}
      resourceWatchdogClient={resourceWatchdogClient}
    >
      <CaptureDrawer activeSessionId={activeSessionId} />
    </StoreProvider>,
  );
}

describe("CaptureDrawer", () => {
  it("starts collapsed as a pull-tab", () => {
    renderDrawer();
    expect(screen.getByLabelText("Open capture")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/A note, a todo/)).not.toBeInTheDocument();
  });

  it("expands to show the input on click", async () => {
    const user = userEvent.setup();
    renderDrawer();
    await user.click(screen.getByLabelText("Open capture"));
    expect(screen.getByPlaceholderText(/A note, a todo/)).toBeInTheDocument();
  });

  it("files a note, logs it, and shows correction options", async () => {
    (openClawClient.runOnce as ReturnType<typeof vi.fn>).mockResolvedValue(
      layer1('{"action":"create_note","payload":{"body":"Fed the cat early."}}'),
    );
    const user = userEvent.setup();
    renderDrawer();
    await user.click(screen.getByLabelText("Open capture"));

    await user.type(screen.getByPlaceholderText(/A note, a todo/), "fed the cat early{Enter}");

    expect(await screen.findByText(/Filed as a note/)).toBeInTheDocument();
    expect(screen.getByText("Make it a todo")).toBeInTheDocument();
    expect(screen.getByText("Make it a milestone")).toBeInTheDocument();
    expect(screen.queryByText("Make it a note")).not.toBeInTheDocument();

    const notes = await repos.notes.listBySession(sessionId);
    expect(notes.map((n) => n.body)).toContain("Fed the cat early.");
    await waitFor(() => expect(captureLogClient.log).toHaveBeenCalled());
    expect(voiceClient.speak).toHaveBeenCalledWith("Filed as a note.", expect.any(String));
  });

  it("correction: swaps a filed note into a todo, reusing the same text", async () => {
    (openClawClient.runOnce as ReturnType<typeof vi.fn>).mockResolvedValue(
      layer1('{"action":"create_note","payload":{"body":"Buy milk"}}'),
    );
    const user = userEvent.setup();
    renderDrawer();
    await user.click(screen.getByLabelText("Open capture"));
    await user.type(screen.getByPlaceholderText(/A note, a todo/), "buy milk{Enter}");
    await screen.findByText(/Filed as a note/);

    await user.click(screen.getByText("Make it a todo"));

    expect(await screen.findByText(/Filed as a todo/)).toBeInTheDocument();
    const notes = await repos.notes.listBySession(sessionId);
    expect(notes.map((n) => n.body)).not.toContain("Buy milk");
    const todos = await repos.todos.list();
    expect(todos.map((t) => t.text)).toContain("Buy milk");
  });

  it("shows the plain no-session message when create_note resolves with nothing clocked in", async () => {
    (openClawClient.runOnce as ReturnType<typeof vi.fn>).mockResolvedValue(
      layer1('{"action":"create_note","payload":{"body":"Fed the cat early."}}'),
    );
    const user = userEvent.setup();
    renderDrawer(null);
    await user.click(screen.getByLabelText("Open capture"));
    await user.type(screen.getByPlaceholderText(/A note, a todo/), "fed the cat early{Enter}");

    expect(await screen.findByText(/Clock into a task first/)).toBeInTheDocument();
  });

  it("clarify: shows the question, and a reply resolves the pipeline", async () => {
    (openClawClient.runOnce as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(layer1('{"action":"clarify","payload":{},"clarifying_question":"Todo or note?"}'))
      .mockResolvedValueOnce(layer1('{"action":"create_todo","payload":{"text":"Finish the thing","alert_at":null}}'));
    const user = userEvent.setup();
    renderDrawer();
    await user.click(screen.getByLabelText("Open capture"));
    await user.type(screen.getByPlaceholderText(/A note, a todo/), "finish the thing{Enter}");

    expect(await screen.findByText("Todo or note?")).toBeInTheDocument();

    const replyInputs = screen.getAllByRole("textbox");
    await user.type(replyInputs[replyInputs.length - 1], "a todo{Enter}");

    expect(await screen.findByText(/Filed as a todo/)).toBeInTheDocument();
  });

  it("declines with the neutral message and closes on OK", async () => {
    (openClawClient.runOnce as ReturnType<typeof vi.fn>).mockResolvedValue(
      layer1('{"action":"decline","payload":{}}'),
    );
    const user = userEvent.setup();
    renderDrawer();
    await user.click(screen.getByLabelText("Open capture"));
    await user.type(screen.getByPlaceholderText(/A note, a todo/), "who won the world series{Enter}");

    expect(await screen.findByText(/Not sure where that goes/)).toBeInTheDocument();

    await user.click(screen.getByText("OK"));
    expect(screen.getByLabelText("Open capture")).toBeInTheDocument();
  });

  it("milestone: matches an existing project exactly and files against it", async () => {
    await repos.projects.create({ title: "Redesign onboarding flow", targetMonth: "2026-09", priority: "high" });
    (openClawClient.runOnce as ReturnType<typeof vi.fn>).mockResolvedValue(
      layer1(
        '{"action":"create_milestone","payload":{"project_title_hint":"Redesign onboarding flow","milestone_name":"First draft done","target_date":null}}',
      ),
    );
    const user = userEvent.setup();
    renderDrawer();
    await user.click(screen.getByLabelText("Open capture"));
    await user.type(screen.getByPlaceholderText(/A note, a todo/), "finished the first draft{Enter}");

    expect(await screen.findByText(/Filed as a milestone/)).toBeInTheDocument();
    expect(screen.getByText(/First draft done.*Redesign onboarding flow/)).toBeInTheDocument();
  });

  it("milestone project_pick: lists existing projects as quick-pick buttons when the hint doesn't match exactly", async () => {
    await repos.projects.create({ title: "Redesign onboarding flow", targetMonth: "2026-09", priority: "high" });
    (openClawClient.runOnce as ReturnType<typeof vi.fn>).mockResolvedValue(
      layer1(
        '{"action":"create_milestone","payload":{"project_title_hint":"the redesign thing","milestone_name":"First draft done","target_date":null}}',
      ),
    );
    const user = userEvent.setup();
    renderDrawer();
    await user.click(screen.getByLabelText("Open capture"));
    await user.type(screen.getByPlaceholderText(/A note, a todo/), "finished the first draft{Enter}");

    expect(await screen.findByText(/Which project/)).toBeInTheDocument();
    await user.click(screen.getByText("Redesign onboarding flow"));

    expect(await screen.findByText(/Filed as a milestone/)).toBeInTheDocument();
  });

  it("resource pressure: skips classification, tells the user plainly, and 'File as a note anyway' really files it", async () => {
    resourceWatchdogClient.checkPressure = vi
      .fn()
      .mockResolvedValue({ underPressure: true, cpuPercent: 92, memPercent: 30 });
    const user = userEvent.setup();
    renderDrawer();
    await user.click(screen.getByLabelText("Open capture"));
    await user.type(screen.getByPlaceholderText(/A note, a todo/), "fed the cat early{Enter}");

    expect(await screen.findByText(/running heavy right now/)).toBeInTheDocument();
    expect(openClawClient.runOnce).not.toHaveBeenCalled();

    await user.click(screen.getByText("File as a note anyway"));

    expect(await screen.findByText(/Filed as a note/)).toBeInTheDocument();
    const notes = await repos.notes.listBySession(sessionId);
    expect(notes.map((n) => n.body)).toContain("fed the cat early");
  });

  it("resource pressure: Cancel closes the drawer without filing anything", async () => {
    resourceWatchdogClient.checkPressure = vi
      .fn()
      .mockResolvedValue({ underPressure: true, cpuPercent: 92, memPercent: 30 });
    const user = userEvent.setup();
    renderDrawer();
    await user.click(screen.getByLabelText("Open capture"));
    await user.type(screen.getByPlaceholderText(/A note, a todo/), "fed the cat early{Enter}");
    await screen.findByText(/running heavy right now/);

    await user.click(screen.getByText("Cancel"));

    expect(screen.getByLabelText("Open capture")).toBeInTheDocument();
    const notes = await repos.notes.listBySession(sessionId);
    expect(notes).toEqual([]);
  });
});
