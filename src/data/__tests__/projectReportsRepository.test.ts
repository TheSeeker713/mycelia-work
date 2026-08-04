// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { applyMigrations } from "../schema";
import { createProjectsRepository } from "../repositories/projectsRepository";
import { createProjectReportsRepository } from "../repositories/projectReportsRepository";
import type { SqlExecutor } from "../sqlExecutor";
import { createTestExecutor } from "./testExecutor";

let executor: SqlExecutor;
let reports: ReturnType<typeof createProjectReportsRepository>;
let projectId: string;

beforeEach(async () => {
  executor = createTestExecutor();
  await applyMigrations(executor);
  const projects = createProjectsRepository(executor);
  reports = createProjectReportsRepository(executor);
  projectId = (
    await projects.create({ title: "Redesign onboarding flow", targetMonth: "2026-09", priority: "high" })
  ).id;
});

describe("projectReportsRepository", () => {
  it("createPending starts a report in the pending state", async () => {
    const report = await reports.createPending(projectId);
    expect(report.status).toBe("pending");
    expect(report.content).toBeNull();
  });

  it("markResult(ok) fills in content and the model used", async () => {
    const report = await reports.createPending(projectId);
    await reports.markResult(report.id, { status: "ok", content: "Real progress this week.", modelUsed: "xai/grok-4.5" });

    const list = await reports.listByProject(projectId);
    expect(list[0]).toMatchObject({ status: "ok", content: "Real progress this week.", model_used: "xai/grok-4.5" });
  });

  it("markResult(failed) records a failure reason", async () => {
    const report = await reports.createPending(projectId);
    await reports.markResult(report.id, { status: "failed", failureReason: "Gateway unreachable" });

    const list = await reports.listByProject(projectId);
    expect(list[0]).toMatchObject({ status: "failed", failure_reason: "Gateway unreachable" });
  });

  it("lists reports for a project, newest first", async () => {
    const first = await reports.createPending(projectId);
    await reports.markResult(first.id, { status: "ok", content: "First report" });
    const second = await reports.createPending(projectId);
    await reports.markResult(second.id, { status: "ok", content: "Second report" });

    const list = await reports.listByProject(projectId);
    expect(list.map((r) => r.content)).toEqual(["Second report", "First report"]);
  });
});
