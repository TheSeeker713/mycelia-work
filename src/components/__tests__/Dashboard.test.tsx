import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initDatabase, type Repositories, type SqlExecutor } from "../../data";
import { createTestExecutor } from "../../data/__tests__/testExecutor";
import { StoreProvider } from "../../store/StoreProvider";
import type { VoiceClient } from "../../services/voiceClient";
import type { OpenClawClient } from "../../services/openclawClient";
import type { OllamaClient } from "../../services/ollamaClient";
import { Dashboard } from "../Dashboard";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

let executor: SqlExecutor;
let repos: Repositories;
let voiceClient: VoiceClient;
let openClawClient: OpenClawClient;
let ollamaClient: OllamaClient;

beforeEach(async () => {
  executor = createTestExecutor();
  repos = await initDatabase(executor);
  voiceClient = {
    speak: vi.fn().mockResolvedValue(null),
    transcribe: vi.fn(),
    // Resolves immediately so the startup screen's system checks settle
    // fast and clear out of the way — these tests are about the rest of
    // the app, not the startup screen itself (that has its own tests).
    isTtsAvailable: vi.fn().mockResolvedValue(true),
    isSttAvailable: vi.fn().mockResolvedValue(true),
  };
  openClawClient = {
    runOnce: vi.fn(),
    ensureDaemon: vi.fn().mockResolvedValue(true),
    call: vi.fn(),
    releaseDaemon: vi.fn(),
    cancelActiveCall: vi.fn(),
  };
  ollamaClient = {
    suggestContinuation: vi.fn(),
    classifyOnTopic: vi.fn().mockResolvedValue(true),
    warmUpGhostText: vi.fn(),
    warmUpModel: vi.fn(),
    isAvailable: vi.fn().mockResolvedValue(true),
    generateReport: vi.fn(),
  };
});

function renderDashboard() {
  return render(
    <StoreProvider
      repositories={repos}
      voiceClient={voiceClient}
      openClawClient={openClawClient}
      ollamaClient={ollamaClient}
    >
      <Dashboard />
    </StoreProvider>,
  );
}

describe("Dashboard", () => {
  it("shows the empty state with no tasks yet", async () => {
    renderDashboard();
    expect(await screen.findByText("No tasks yet — add one above.")).toBeInTheDocument();
  });

  it("captures a task with a single field and shows it in the list", async () => {
    const user = userEvent.setup();
    renderDashboard();

    const input = await screen.findByPlaceholderText("What are you working on?");
    await user.type(input, "Write the devlog entry{Enter}");

    expect(await screen.findByText("Write the devlog entry")).toBeInTheDocument();
    expect(input).toHaveValue("");
  });

  it("clicking a task focuses the workspace on it", async () => {
    const user = userEvent.setup();
    renderDashboard();

    const input = await screen.findByPlaceholderText("What are you working on?");
    await user.type(input, "Sketch the welcome screen{Enter}");

    expect(
      screen.getByText("Click a task to focus the workspace on it."),
    ).toBeInTheDocument();

    await user.click(await screen.findByText("Sketch the welcome screen"));

    expect(
      screen.queryByText("Click a task to focus the workspace on it."),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archive" })).toBeInTheDocument();
  });

  it("archiving the focused task clears the workspace and removes it from the list", async () => {
    const user = userEvent.setup();
    renderDashboard();

    const input = await screen.findByPlaceholderText("What are you working on?");
    await user.type(input, "Old task{Enter}");
    await user.click(await screen.findByText("Old task"));
    await user.click(screen.getByRole("button", { name: "Archive" }));

    expect(screen.queryByText("Old task")).not.toBeInTheDocument();
    expect(
      await screen.findByText("Click a task to focus the workspace on it."),
    ).toBeInTheDocument();
  });

  it("optional tag/billable stay hidden until requested, then apply to the new task", async () => {
    const user = userEvent.setup();
    renderDashboard();

    const input = await screen.findByPlaceholderText("What are you working on?");
    expect(screen.queryByPlaceholderText("tag (optional)")).not.toBeInTheDocument();

    await user.type(input, "Client call");
    await user.click(await screen.findByText("+ tag / billable"));

    await user.type(screen.getByPlaceholderText("tag (optional)"), "client-work");
    await user.click(screen.getByLabelText("billable"));
    await user.type(input, "{Enter}");

    await user.click(await screen.findByText("Client call"));
    // "client-work" legitimately appears twice — once as the list row's
    // tag badge, once in the workspace detail below it.
    expect(screen.getAllByText("client-work").length).toBe(2);
    expect(screen.getByText("billable")).toBeInTheDocument();
  });

  it("Tasks is the default open compartment, and pull-tabs switch between the others", async () => {
    const user = userEvent.setup();
    renderDashboard();

    // Tasks content visible by default
    expect(await screen.findByPlaceholderText("What are you working on?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Todos" }));
    expect(screen.getByPlaceholderText("Add a todo")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("What are you working on?")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Projects" }));
    expect(screen.getByText("+ New project")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Notes" }));
    expect(screen.getByText(/Clock into a task to start writing/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Library" }));
    // Archived tasks starts collapsed into a button (Work Journal is
    // the section shown expanded by default) — expand it to check.
    await user.click(screen.getByRole("button", { name: "Archived tasks" }));
    expect(screen.getByText("Nothing archived yet.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Tasks" }));
    expect(screen.getByPlaceholderText("What are you working on?")).toBeInTheDocument();
  });

  it("archiving a task in Tasks makes it appear, restorable, in Library", async () => {
    const user = userEvent.setup();
    renderDashboard();

    const input = await screen.findByPlaceholderText("What are you working on?");
    await user.type(input, "Old task{Enter}");
    await user.click(await screen.findByText("Old task"));
    await user.click(screen.getByRole("button", { name: "Archive" }));

    await user.click(screen.getByRole("button", { name: "Library" }));
    await user.click(screen.getByRole("button", { name: /Archived tasks/ }));
    expect(await screen.findByText("Old task")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Restore" }));
    expect(screen.queryByText("Old task")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Tasks" }));
    expect(await screen.findByText("Old task")).toBeInTheDocument();
  });

  it("expanding to full screen shows the menu bar, and the back button returns to pocket view", async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByTitle("Expand to full screen"));

    expect(screen.getByRole("button", { name: "File" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Help" })).toBeInTheDocument();
    // pocket-mode chrome is gone while full screen
    expect(screen.queryByTitle("Expand to full screen")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Back to pocket view/ }));
    expect(screen.getByTitle("Expand to full screen")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "File" })).not.toBeInTheDocument();
  });

  it("an in-progress new-project draft survives expanding to full screen and back — the pocket/fullscreen shell no longer remounts the compartment tree", async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole("button", { name: "Projects" }));
    await user.click(screen.getByText("+ New project"));
    await user.type(screen.getByLabelText("New project title"), "Redesign onboarding flow");

    await user.click(screen.getByTitle("Expand to full screen"));
    expect(screen.getByLabelText("New project title")).toHaveValue("Redesign onboarding flow");

    await user.click(screen.getByRole("button", { name: /Back to pocket view/ }));
    expect(screen.getByLabelText("New project title")).toHaveValue("Redesign onboarding flow");
  });

  it("a partially-typed todo survives expanding to full screen and back too", async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole("button", { name: "Todos" }));
    await user.type(screen.getByLabelText("New todo"), "Follow up with the vendor");

    await user.click(screen.getByTitle("Expand to full screen"));
    expect(screen.getByLabelText("New todo")).toHaveValue("Follow up with the vendor");

    await user.click(screen.getByRole("button", { name: /Back to pocket view/ }));
    expect(screen.getByLabelText("New todo")).toHaveValue("Follow up with the vendor");
  });

  it("Escape exits full screen back to the pocket view", async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByTitle("Expand to full screen"));
    expect(screen.getByRole("button", { name: "File" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(await screen.findByTitle("Expand to full screen")).toBeInTheDocument();
  });

  it("File > New task in full-screen mode switches to the Tasks compartment", async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByTitle("Expand to full screen"));
    await user.click(screen.getByRole("button", { name: "Library" }));
    // Work Journal is the section shown expanded by default.
    expect(screen.getByText("Work journal")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "File" }));
    await user.click(screen.getByText("New task"));

    expect(screen.getByPlaceholderText("What are you working on?")).toBeInTheDocument();
  });

  it("shows the onboarding coach mark by default, dismissible", async () => {
    const user = userEvent.setup();
    renderDashboard();

    // The one-time accessibility disclosure comes first, ahead of the
    // general coach mark, on every first launch (a fresh test database
    // has never marked it seen either).
    await user.click(await screen.findByText("Continue"));
    expect(await screen.findByText("1 / 2")).toBeInTheDocument();

    await user.click(screen.getByTitle("Skip all"));
    expect(screen.queryByText("1 / 2")).not.toBeInTheDocument();
  });

  it("Help > Replay onboarding tips brings it back and exits full screen first", async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByText("Continue"));
    await user.click(await screen.findByTitle("Skip all"));
    expect(screen.queryByText("1 / 2")).not.toBeInTheDocument();

    await user.click(screen.getByTitle("Expand to full screen"));
    await user.click(screen.getByRole("button", { name: "Help" }));
    await user.click(screen.getByText("Replay onboarding tips"));

    // back in pocket mode, with the coach mark showing again from step 1
    expect(screen.getByTitle("Expand to full screen")).toBeInTheDocument();
    expect(await screen.findByText("1 / 2")).toBeInTheDocument();
  });

  it("clocking in a task shows it as a running session card, replacing the Clock in button", async () => {
    const user = userEvent.setup();
    renderDashboard();

    const input = await screen.findByPlaceholderText("What are you working on?");
    await user.type(input, "Write the devlog entry{Enter}");
    await user.click(await screen.findByText("Write the devlog entry"));

    await user.click(screen.getByRole("button", { name: "Clock in" }));

    expect(screen.queryByRole("button", { name: "Clock in" })).not.toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Take a break" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clock out" })).toBeInTheDocument();
    await waitFor(() => expect(voiceClient.speak).toHaveBeenCalledWith("Clocked in.", expect.any(String)));
  });

  it("Take a break / Resume toggles the session's status, speaking each transition live", async () => {
    const user = userEvent.setup();
    renderDashboard();

    const input = await screen.findByPlaceholderText("What are you working on?");
    await user.type(input, "Old task{Enter}");
    await user.click(await screen.findByText("Old task"));
    await user.click(screen.getByRole("button", { name: "Clock in" }));

    await user.click(screen.getByRole("button", { name: "Take a break" }));
    expect(screen.getByText("On break")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
    await waitFor(() => expect(voiceClient.speak).toHaveBeenCalledWith("Taking a break.", expect.any(String)));

    await user.click(screen.getByRole("button", { name: "Resume" }));
    expect(await screen.findByText("Running")).toBeInTheDocument();
    await waitFor(() => expect(voiceClient.speak).toHaveBeenCalledWith("Back to work.", expect.any(String)));
  });

  it("clocking out removes the session card entirely and speaks the cue live", async () => {
    const user = userEvent.setup();
    renderDashboard();

    const input = await screen.findByPlaceholderText("What are you working on?");
    await user.type(input, "Old task{Enter}");
    await user.click(await screen.findByText("Old task"));
    await user.click(screen.getByRole("button", { name: "Clock in" }));

    await user.click(screen.getByRole("button", { name: "Clock out" }));

    expect(screen.queryByText("Running")).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Clock in" })).toBeInTheDocument();
    await waitFor(() => expect(voiceClient.speak).toHaveBeenCalledWith("Clocked out.", expect.any(String)));
  });

  it("enforces the 3-concurrent-task limit — the 4th Clock in is disabled", async () => {
    const user = userEvent.setup();
    renderDashboard();

    const input = await screen.findByPlaceholderText("What are you working on?");
    for (const title of ["Task A", "Task B", "Task C", "Task D"]) {
      await user.type(input, `${title}{Enter}`);
    }

    for (const title of ["Task A", "Task B", "Task C"]) {
      await user.click(await screen.findByText(title));
      await user.click(screen.getByRole("button", { name: "Clock in" }));
    }

    await user.click(await screen.findByText("Task D"));
    const clockInBtn = screen.getByRole("button", { name: "Clock in" });
    expect(clockInBtn).toBeDisabled();
  });

  it("a session running 8+ hours triggers the forgot-to-clock-out check-in on load", async () => {
    const user = userEvent.setup();
    const task = await repos.tasks.create({ title: "Old forgotten task" });
    const session = await repos.taskSessions.clockIn(task.id);

    // clockIn() always stamps "now" — backdating past the dangling
    // threshold needs a direct SQL update, since nothing in the
    // repository interface lets you claim a session started 9 hours ago.
    const backdated = new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString();
    await executor.execute("UPDATE task_sessions SET clocked_in_at = ? WHERE id = ?", [
      backdated,
      session.id,
    ]);

    renderDashboard();

    expect(await screen.findByText(/Old forgotten task/)).toBeInTheDocument();
    // The adaptive AI check-in tries first and falls back to the static
    // dialogue once it fails (no live Tauri bridge/OpenClaw in this
    // test environment) — that fallback is async, so this has to wait
    // rather than assert synchronously.
    expect(await screen.findByText(/has been running since/)).toBeInTheDocument();

    await user.click(
      await screen.findByText(/That clock-in should just be closed out right at the time it started/),
    );

    // Resolved: dialog gone, session no longer shows as an active card.
    expect(screen.queryByText(/has been running since/)).not.toBeInTheDocument();
    const resolved = await repos.taskSessions.getById(session.id);
    expect(resolved?.status).toBe("stopped");
    expect(resolved?.is_estimated).toBe(true);
    expect(resolved?.clocked_out_at).toBe(backdated);
  });

  it("Help menu no longer has the hidden unlock entry", async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByTitle("Expand to full screen"));
    await user.click(screen.getByRole("button", { name: "Help" }));
    expect(screen.queryByText("this should not be here")).not.toBeInTheDocument();
  });

  it("zen mode: opening it from Notes (pocket mode) goes full screen with no chrome, and Exit returns to pocket view with the draft intact", async () => {
    const user = userEvent.setup();
    renderDashboard();

    const input = await screen.findByPlaceholderText("What are you working on?");
    await user.type(input, "Write the devlog entry{Enter}");
    await user.click(await screen.findByText("Write the devlog entry"));
    await user.click(screen.getByRole("button", { name: "Clock in" }));

    await user.click(screen.getByRole("button", { name: "Notes" }));
    await user.click(screen.getByLabelText("Expand to full-screen zen mode"));

    // Zen mode: no MenuBar, no compartment tabs — just the writing surface.
    expect(screen.getByText("Zen mode")).toBeInTheDocument();
    expect(screen.getByText("Write the devlog entry")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "File" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Notes" })).not.toBeInTheDocument();

    const zenTextarea = screen.getByPlaceholderText("Write for Write the devlog entry...");
    await user.type(zenTextarea, "Sketched the zen mode layout.");

    await user.click(screen.getByRole("button", { name: "Exit zen mode" }));

    // Was in pocket mode before zen mode, so exiting returns there — not full screen.
    expect(screen.getByTitle("Expand to full screen")).toBeInTheDocument();
    expect(screen.queryByText("Zen mode")).not.toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Write a note for Write the devlog entry..."),
    ).toHaveValue("Sketched the zen mode layout.");
  });

  it("the capture drawer's pull-tab is reachable regardless of which compartment is open", async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole("button", { name: "Todos" }));
    expect(screen.getByLabelText("Open capture")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Open capture"));
    expect(screen.getByPlaceholderText(/A note, a todo/)).toBeInTheDocument();
  });

  it("the capture drawer's pull-tab is suppressed while the forgot-to-clock-out check-in is up", async () => {
    const task = await repos.tasks.create({ title: "Old forgotten task" });
    const session = await repos.taskSessions.clockIn(task.id);
    const backdated = new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString();
    await executor.execute("UPDATE task_sessions SET clocked_in_at = ? WHERE id = ?", [
      backdated,
      session.id,
    ]);

    renderDashboard();

    expect(await screen.findByText(/has been running since/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Open capture")).not.toBeInTheDocument();
  });

  it("zen mode: opening it while already full screen exits back to full screen, not pocket view", async () => {
    const user = userEvent.setup();
    renderDashboard();

    const input = await screen.findByPlaceholderText("What are you working on?");
    await user.type(input, "Old task{Enter}");
    await user.click(await screen.findByText("Old task"));
    await user.click(screen.getByRole("button", { name: "Clock in" }));

    await user.click(screen.getByTitle("Expand to full screen"));
    await user.click(screen.getByRole("button", { name: "Notes" }));
    await user.click(screen.getByLabelText("Expand to full-screen zen mode"));

    expect(screen.getByText("Zen mode")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Exit zen mode" }));

    // Was already full screen before zen mode — exiting stays full screen.
    expect(screen.getByRole("button", { name: "File" })).toBeInTheDocument();
    expect(screen.queryByTitle("Expand to full screen")).not.toBeInTheDocument();
  });

  it("speaks a Welcome cue once settings load, AOL-style, on every launch", async () => {
    renderDashboard();

    await waitFor(() => expect(voiceClient.speak).toHaveBeenCalledWith("Welcome.", expect.any(String)));
    expect(voiceClient.speak).toHaveBeenCalledTimes(1);
  });

  it("stays silent on launch when self-voicing is off", async () => {
    await repos.settings.set("self_voicing_enabled", "false");

    renderDashboard();

    await screen.findByPlaceholderText("What are you working on?");
    expect(voiceClient.speak).not.toHaveBeenCalled();
  });

  it("the whole Tasks card is one scroll region, not just the task list", async () => {
    renderDashboard();

    const input = await screen.findByPlaceholderText("What are you working on?");
    expect(input.closest(".overflow-y-auto")).not.toBeNull();
  });

  it("Settings scrolls as one region — it used to have no scroll handling at all", async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole("button", { name: "Settings" }));

    const heading = screen.getByText("Voice performance");
    expect(heading.closest(".overflow-y-auto")).not.toBeNull();
  });
});
