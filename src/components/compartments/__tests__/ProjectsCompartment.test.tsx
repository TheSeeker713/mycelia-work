import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { ProjectsCompartment } from "../ProjectsCompartment";
import { StoreProvider } from "../../../store/StoreProvider";
import { initDatabase, type Repositories } from "../../../data";
import { createTestExecutor } from "../../../data/__tests__/testExecutor";

let repos: Repositories;

beforeEach(async () => {
  repos = await initDatabase(createTestExecutor());
});

function renderProjects() {
  return render(
    <StoreProvider repositories={repos}>
      <ProjectsCompartment />
    </StoreProvider>,
  );
}

describe("ProjectsCompartment", () => {
  it("shows the empty state with no projects yet", async () => {
    renderProjects();
    expect(await screen.findByText("No projects yet.")).toBeInTheDocument();
  });

  it("creates a project via the form and shows it as a compact card", async () => {
    const user = userEvent.setup();
    renderProjects();

    await user.click(screen.getByText("+ New project"));
    await user.type(screen.getByLabelText("New project title"), "Redesign onboarding flow");
    await user.click(screen.getByText("Save project"));

    expect(await screen.findByText("Redesign onboarding flow")).toBeInTheDocument();
    expect(screen.getByText("Planned")).toBeInTheDocument();
  });

  it("clicking a compact card opens the expanded detail view, with a way back", async () => {
    const user = userEvent.setup();
    await repos.projects.create({ title: "Client portal revamp", targetMonth: "2026-09", priority: "high" });
    renderProjects();

    await user.click(await screen.findByText("Client portal revamp"));

    expect(screen.getByLabelText("Project title")).toHaveValue("Client portal revamp");
    await user.click(screen.getByText("← Back to projects"));
    expect(await screen.findByText("Client portal revamp")).toBeInTheDocument();
    expect(screen.queryByLabelText("Project title")).not.toBeInTheDocument();
  });

  it("editing and saving updates the project", async () => {
    const user = userEvent.setup();
    const project = await repos.projects.create({
      title: "Client portal revamp",
      targetMonth: "2026-09",
      priority: "low",
    });
    renderProjects();

    await user.click(await screen.findByText("Client portal revamp"));
    await user.selectOptions(screen.getByLabelText("Status"), "in_progress");
    await user.click(screen.getByText("Save changes"));

    const updated = await repos.projects.getById(project.id);
    expect(updated?.status).toBe("in_progress");
  });

  it("archiving a project removes it from the list and returns to the list view", async () => {
    const user = userEvent.setup();
    await repos.projects.create({ title: "Client portal revamp", targetMonth: "2026-09", priority: "low" });
    renderProjects();

    await user.click(await screen.findByText("Client portal revamp"));
    await user.click(screen.getByText("Archive"));

    expect(await screen.findByText("No projects yet.")).toBeInTheDocument();
  });

  it("deleting requires a confirm step, then removes the project permanently", async () => {
    const user = userEvent.setup();
    const project = await repos.projects.create({
      title: "Client portal revamp",
      targetMonth: "2026-09",
      priority: "low",
    });
    renderProjects();

    await user.click(await screen.findByText("Client portal revamp"));
    await user.click(screen.getByText("Delete"));
    expect(screen.getByText("Delete for good?")).toBeInTheDocument();

    await user.click(screen.getByText("Yes, delete"));

    expect(await screen.findByText("No projects yet.")).toBeInTheDocument();
    expect(await repos.projects.getById(project.id)).toBeNull();
  });

  it("cancelling the delete confirmation keeps the project", async () => {
    const user = userEvent.setup();
    const project = await repos.projects.create({
      title: "Client portal revamp",
      targetMonth: "2026-09",
      priority: "low",
    });
    renderProjects();

    await user.click(await screen.findByText("Client portal revamp"));
    await user.click(screen.getByText("Delete"));
    await user.click(screen.getByText("Cancel"));

    expect(screen.queryByText("Delete for good?")).not.toBeInTheDocument();
    expect(await repos.projects.getById(project.id)).not.toBeNull();
  });

  it("shows the milestone progress trail on the compact card and lets you complete one from the detail view", async () => {
    const user = userEvent.setup();
    const project = await repos.projects.create({
      title: "Client portal revamp",
      targetMonth: "2026-09",
      priority: "low",
    });
    await repos.milestones.create(project.id, "Kickoff");
    await repos.milestones.create(project.id, "First draft");
    renderProjects();

    expect(await screen.findByText("0/2 milestones")).toBeInTheDocument();

    await user.click(screen.getByText("Client portal revamp"));
    await user.click(screen.getAllByRole("checkbox")[0]);

    expect(await screen.findByText("Kickoff")).toHaveStyle({ textDecoration: "line-through" });
  });

  it("setting a completion goal via the date/time picker persists target_datetime", async () => {
    const user = userEvent.setup();
    const project = await repos.projects.create({
      title: "Client portal revamp",
      targetMonth: "2026-09",
      priority: "low",
    });
    renderProjects();

    const monthLabels = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    const now = new Date();
    const dayLabel = `${monthLabels[now.getMonth()]} 15, ${now.getFullYear()}`;

    await user.click(await screen.findByText("Client portal revamp"));
    await user.click(screen.getByRole("button", { name: dayLabel }));
    await user.click(screen.getByText("Save changes"));

    const updated = await repos.projects.getById(project.id);
    expect(updated?.target_datetime).not.toBeNull();
    expect(new Date(updated!.target_datetime!).getDate()).toBe(15);
  });

  it("removing a milestone deletes it", async () => {
    const user = userEvent.setup();
    const project = await repos.projects.create({
      title: "Client portal revamp",
      targetMonth: "2026-09",
      priority: "low",
    });
    const milestone = await repos.milestones.create(project.id, "Kickoff");
    renderProjects();

    await user.click(await screen.findByText("Client portal revamp"));
    await user.click(screen.getByLabelText("Remove milestone Kickoff"));

    expect(screen.queryByText("Kickoff")).not.toBeInTheDocument();
    const list = await repos.milestones.listByProject(project.id);
    expect(list.find((m) => m.id === milestone.id)).toBeUndefined();
  });
});
