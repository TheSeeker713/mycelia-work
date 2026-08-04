import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { initDatabase, type Repositories } from "../../../data";
import { createTestExecutor } from "../../../data/__tests__/testExecutor";
import { StoreProvider, useSessionsStore } from "../../../store/StoreProvider";
import { NotesCompartment } from "../NotesCompartment";

let repos: Repositories;

beforeEach(async () => {
  repos = await initDatabase(createTestExecutor());
});

function ClockInButton({ title }: { title: string }) {
  const clockIn = useSessionsStore((s) => s.clockIn);
  return (
    <button
      type="button"
      onClick={async () => {
        const task = await repos.tasks.create({ title });
        await clockIn(task);
      }}
    >
      clock in {title}
    </button>
  );
}

function renderWithClockIn(titles: string[]) {
  return render(
    <StoreProvider repositories={repos}>
      {titles.map((t) => (
        <ClockInButton key={t} title={t} />
      ))}
      <NotesCompartment />
    </StoreProvider>,
  );
}

describe("NotesCompartment", () => {
  it("shows a placeholder with no active session", () => {
    renderWithClockIn([]);
    expect(
      screen.getByText(/Clock into a task to start writing/),
    ).toBeInTheDocument();
  });

  it("writing a note appends a timestamped entry for the active session", async () => {
    const user = userEvent.setup();
    renderWithClockIn(["Write the devlog entry"]);

    await user.click(screen.getByText("clock in Write the devlog entry"));
    expect(
      await screen.findByText("Nothing written yet for Write the devlog entry."),
    ).toBeInTheDocument();

    const textarea = screen.getByPlaceholderText("Write a note for Write the devlog entry...");
    await user.type(textarea, "Started sketching the layout.");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByText("Started sketching the layout.")).toBeInTheDocument();
    expect(textarea).toHaveValue("");
  });

  it("shows a session picker and keeps notes separate when multiple sessions are active", async () => {
    const user = userEvent.setup();
    renderWithClockIn(["Task A", "Task B"]);

    await user.click(screen.getByText("clock in Task A"));
    await user.click(screen.getByText("clock in Task B"));

    // defaults to the first active session
    expect(await screen.findByPlaceholderText("Write a note for Task A...")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Write a note for Task A..."), "Note for A");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText("Note for A")).toBeInTheDocument();

    // switch to Task B via the picker
    await user.click(screen.getByRole("button", { name: "Task B" }));
    expect(screen.queryByText("Note for A")).not.toBeInTheDocument();
    expect(
      await screen.findByText("Nothing written yet for Task B."),
    ).toBeInTheDocument();
  });
});
