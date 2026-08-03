import { render, screen } from "@testing-library/react";
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
});
