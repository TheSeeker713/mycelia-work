import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CheckInDialog } from "../CheckInDialog";
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

describe("CheckInDialog", () => {
  it("shows the task and anchors to its clock-in time", () => {
    const clockedInAt = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString();
    render(
      <CheckInDialog activeSession={makeSession(clockedInAt)} onResolve={vi.fn()} />,
    );
    expect(screen.getByText(/Write the devlog entry/)).toBeInTheDocument();
    expect(screen.getByText(/has been running since/)).toBeInTheDocument();
  });

  it("'close out at start time' resolves immediately with clocked_in_at and no note", async () => {
    const user = userEvent.setup();
    const clockedInAt = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString();
    const onResolve = vi.fn();
    render(
      <CheckInDialog activeSession={makeSession(clockedInAt)} onResolve={onResolve} />,
    );

    await user.click(
      screen.getByText(/That clock-in should just be closed out right at the time it started/),
    );

    expect(onResolve).toHaveBeenCalledWith(clockedInAt, "");
  });

  it("'worked a little' asks for a short duration, then an optional note", async () => {
    const user = userEvent.setup();
    const clockedInAt = new Date("2026-08-03T09:00:00.000Z").toISOString();
    const onResolve = vi.fn();
    render(
      <CheckInDialog activeSession={makeSession(clockedInAt)} onResolve={onResolve} />,
    );

    await user.click(screen.getByText(/I worked a little, then got pulled away/));
    expect(screen.getByText("About how long?")).toBeInTheDocument();
    expect(screen.getByText("~15 min")).toBeInTheDocument();
    expect(screen.queryByText("~2 hours")).not.toBeInTheDocument();

    await user.click(screen.getByText("~30 min"));
    await user.type(screen.getByRole("textbox"), "Got pulled into a call.");
    await user.click(screen.getByRole("button", { name: "Done" }));

    expect(onResolve).toHaveBeenCalledWith(
      "2026-08-03T09:30:00.000Z",
      "Got pulled into a call.",
    );
  });

  it("'kept working a while' offers longer duration buckets", async () => {
    const user = userEvent.setup();
    const clockedInAt = new Date("2026-08-03T09:00:00.000Z").toISOString();
    const onResolve = vi.fn();
    render(
      <CheckInDialog activeSession={makeSession(clockedInAt)} onResolve={onResolve} />,
    );

    await user.click(screen.getByText(/I kept working for a while after that/));
    expect(screen.getByText("~4 hours")).toBeInTheDocument();
    expect(screen.queryByText("~15 min")).not.toBeInTheDocument();

    await user.click(screen.getByText("~4 hours"));
    await user.click(screen.getByRole("button", { name: "Done" }));

    expect(onResolve).toHaveBeenCalledWith("2026-08-03T13:00:00.000Z", "");
  });

  it("shows the optional notice line when given one, and nothing when not", () => {
    const clockedInAt = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString();
    const { rerender } = render(
      <CheckInDialog activeSession={makeSession(clockedInAt)} onResolve={vi.fn()} />,
    );
    expect(screen.queryByText(/Couldn't reach/)).not.toBeInTheDocument();

    rerender(
      <CheckInDialog
        activeSession={makeSession(clockedInAt)}
        onResolve={vi.fn()}
        notice="Couldn't reach the AI conversation right now — here are the usual options instead."
      />,
    );
    expect(screen.getByText(/Couldn't reach the AI conversation/)).toBeInTheDocument();
  });
});
