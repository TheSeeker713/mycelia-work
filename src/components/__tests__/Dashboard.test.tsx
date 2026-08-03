import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { initDatabase, type Repositories } from "../../data";
import { createTestExecutor } from "../../data/__tests__/testExecutor";
import { StoreProvider } from "../../store/StoreProvider";
import { Dashboard } from "../Dashboard";

let repos: Repositories;

beforeEach(async () => {
  repos = await initDatabase(createTestExecutor());
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
});
