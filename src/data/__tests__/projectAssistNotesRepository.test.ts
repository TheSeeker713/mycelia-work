// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { applyMigrations } from "../schema";
import { createProjectAssistNotesRepository } from "../repositories/projectAssistNotesRepository";
import { createProjectsRepository } from "../repositories/projectsRepository";
import type { SqlExecutor } from "../sqlExecutor";
import { createTestExecutor } from "./testExecutor";

let executor: SqlExecutor;
let notes: ReturnType<typeof createProjectAssistNotesRepository>;
let projectId: string;

beforeEach(async () => {
  executor = createTestExecutor();
  await applyMigrations(executor);
  notes = createProjectAssistNotesRepository(executor);
  const projects = createProjectsRepository(executor);
  const project = await projects.create({ title: "Redesign onboarding", targetMonth: "2026-09", priority: "high" });
  projectId = project.id;
});

describe("projectAssistNotesRepository", () => {
  it("creates a note with the action, content, and optional question", async () => {
    const note = await notes.create(projectId, "sub_tasks", "- Do the thing\n- Do the other thing");
    expect(note.action).toBe("sub_tasks");
    expect(note.content).toContain("Do the thing");
    expect(note.question).toBeNull();

    const withQuestion = await notes.create(projectId, "freeform_ask", "Ship next month.", "When should this ship?");
    expect(withQuestion.question).toBe("When should this ship?");
  });

  it("listByProject returns only that project's notes, newest first", async () => {
    await notes.create(projectId, "sub_tasks", "first");
    await notes.create(projectId, "tighten_description", "second");

    const all = await notes.listByProject(projectId);
    expect(all.map((n) => n.content)).toEqual(["second", "first"]);
  });

  it("listByProject returns an empty list for a project with no assist history", async () => {
    expect(await notes.listByProject(projectId)).toEqual([]);
  });
});
