import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../test/nodeSqliteExecutor";
import type { SqlExecutor } from "../lib/db/executor";
import { AppStoreProvider, useAppStore } from "../lib/store/AppStoreProvider";
import { TaskList } from "./TaskList";
import { WorkspaceDashboard } from "./WorkspaceDashboard";

let db: SqlExecutor;
let close: () => void;

beforeEach(() => {
  const testDb = createTestDb();
  db = testDb.db;
  close = testDb.close;
});

afterEach(() => {
  close();
});

function LoadOnMount() {
  const loadTasks = useAppStore((s) => s.loadTasks);
  loadTasks();
  return null;
}

function renderWorkspace() {
  return render(
    <AppStoreProvider db={db}>
      <LoadOnMount />
      <TaskList />
      <WorkspaceDashboard />
    </AppStoreProvider>,
  );
}

describe("TaskList + WorkspaceDashboard", () => {
  it("shows an empty state until a task is created", () => {
    renderWorkspace();
    expect(screen.getByText(/no tasks yet/i)).toBeInTheDocument();
    expect(
      screen.getByText(/select a task, or add a new one/i),
    ).toBeInTheDocument();
  });

  it("creates a task from the quick-add input and lists it", async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.type(
      screen.getByLabelText(/new task title/i),
      "Write the phase 2 devlog{Enter}",
    );

    await waitFor(() => {
      expect(screen.getByText("Write the phase 2 devlog")).toBeInTheDocument();
    });
  });

  it("shows tag and billable indicators on the task row", async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.type(screen.getByLabelText(/new task title/i), "Client call");
    await user.type(screen.getByLabelText(/task tag/i), "acme-corp");
    await user.click(screen.getByLabelText(/billable/i));
    await user.click(screen.getByLabelText(/new task title/i));
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(screen.getByText("Client call")).toBeInTheDocument();
    });
    expect(screen.getByText("acme-corp")).toBeInTheDocument();
    expect(screen.getByText("$")).toBeInTheDocument();
  });

  it("selecting a task focuses the workspace dashboard on it", async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.type(
      screen.getByLabelText(/new task title/i),
      "Deep work session{Enter}",
    );
    await waitFor(() => {
      expect(screen.getByText("Deep work session")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Deep work session"));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Deep work session" }),
      ).toBeInTheDocument();
    });
  });

  it("archiving the selected task clears the dashboard back to the empty state", async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.type(
      screen.getByLabelText(/new task title/i),
      "Throwaway task{Enter}",
    );
    await waitFor(() => {
      expect(screen.getByText("Throwaway task")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Throwaway task"));
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Throwaway task" }),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText(/archive throwaway task/i));

    await waitFor(() => {
      expect(screen.queryByText("Throwaway task")).not.toBeInTheDocument();
      expect(
        screen.getByText(/select a task, or add a new one/i),
      ).toBeInTheDocument();
    });
  });
});
