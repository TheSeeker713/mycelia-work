import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { initDatabase, type Repositories, type SqlExecutor } from "../../data";
import { createTestExecutor } from "../../data/__tests__/testExecutor";
import { StoreProvider } from "../../store/StoreProvider";
import { Dashboard } from "../Dashboard";

let executor: SqlExecutor;
let repos: Repositories;

beforeEach(async () => {
  executor = createTestExecutor();
  repos = await initDatabase(executor);
});

function renderDashboard() {
  return render(
    <StoreProvider repositories={repos}>
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
    expect(await screen.findByText("Old task")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Restore" }));
    expect(screen.queryByText("Old task")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Tasks" }));
    expect(await screen.findByText("Old task")).toBeInTheDocument();
  });

  it("expanding to full screen shows the menu bar, and the back button returns to pocket view", async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(screen.getByTitle("Expand to full screen"));

    expect(screen.getByRole("button", { name: "File" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Help" })).toBeInTheDocument();
    // pocket-mode chrome is gone while full screen
    expect(screen.queryByTitle("Expand to full screen")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Back to pocket view/ }));
    expect(screen.getByTitle("Expand to full screen")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "File" })).not.toBeInTheDocument();
  });

  it("Escape exits full screen back to the pocket view", async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(screen.getByTitle("Expand to full screen"));
    expect(screen.getByRole("button", { name: "File" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(await screen.findByTitle("Expand to full screen")).toBeInTheDocument();
  });

  it("File > New task in full-screen mode switches to the Tasks compartment", async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(screen.getByTitle("Expand to full screen"));
    await user.click(screen.getByRole("button", { name: "Library" }));
    expect(screen.getByText("Nothing archived yet.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "File" }));
    await user.click(screen.getByText("New task"));

    expect(screen.getByPlaceholderText("What are you working on?")).toBeInTheDocument();
  });

  it("shows the onboarding coach mark by default, dismissible", async () => {
    const user = userEvent.setup();
    renderDashboard();

    expect(await screen.findByText("1 / 2")).toBeInTheDocument();

    await user.click(screen.getByTitle("Skip all"));
    expect(screen.queryByText("1 / 2")).not.toBeInTheDocument();
  });

  it("Help > Replay onboarding tips brings it back and exits full screen first", async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(screen.getByTitle("Skip all"));
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
  });

  it("Take a break / Resume toggles the session's status", async () => {
    const user = userEvent.setup();
    renderDashboard();

    const input = await screen.findByPlaceholderText("What are you working on?");
    await user.type(input, "Old task{Enter}");
    await user.click(await screen.findByText("Old task"));
    await user.click(screen.getByRole("button", { name: "Clock in" }));

    await user.click(screen.getByRole("button", { name: "Take a break" }));
    expect(screen.getByText("On break")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Resume" }));
    expect(await screen.findByText("Running")).toBeInTheDocument();
  });

  it("clocking out removes the session card entirely", async () => {
    const user = userEvent.setup();
    renderDashboard();

    const input = await screen.findByPlaceholderText("What are you working on?");
    await user.type(input, "Old task{Enter}");
    await user.click(await screen.findByText("Old task"));
    await user.click(screen.getByRole("button", { name: "Clock in" }));

    await user.click(screen.getByRole("button", { name: "Clock out" }));

    expect(screen.queryByText("Running")).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Clock in" })).toBeInTheDocument();
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
});
