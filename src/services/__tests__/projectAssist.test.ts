import { beforeEach, describe, expect, it, vi } from "vitest";
import { initDatabase, type Project, type Repositories } from "../../data";
import { createTestExecutor } from "../../data/__tests__/testExecutor";
import type { OpenClawClient } from "../openclawClient";
import {
  buildAssistPrompt,
  buildStatusReportPrompt,
  runProjectAssist,
  runProjectReportGeneration,
} from "../projectAssist";

const project: Project = {
  id: "p1",
  title: "Redesign onboarding flow",
  description: "Make the first-run experience less confusing.",
  status: "in_progress",
  target_month: "2026-09",
  target_datetime: null,
  priority: "high",
  created_at: "2026-08-01T00:00:00.000Z",
  archived_at: null,
};

describe("buildAssistPrompt", () => {
  it("sub_tasks asks for a plain bulleted list", () => {
    const prompt = buildAssistPrompt("sub_tasks", project);
    expect(prompt).toContain("Redesign onboarding flow");
    expect(prompt).toContain("bulleted list");
  });

  it("freeform_ask includes the project context plus the literal question", () => {
    const prompt = buildAssistPrompt("freeform_ask", project, "What's the biggest risk here?");
    expect(prompt).toContain("Redesign onboarding flow");
    expect(prompt).toContain("What's the biggest risk here?");
  });
});

describe("buildStatusReportPrompt", () => {
  it("includes the voice rules doc and the project context", () => {
    const prompt = buildStatusReportPrompt(project);
    expect(prompt).toContain("Redesign onboarding flow");
    expect(prompt.length).toBeGreaterThan(500); // the voice-notes doc alone is substantial
  });
});

describe("runProjectAssist", () => {
  it("returns the trimmed model response on success", async () => {
    const client: OpenClawClient = {
      runOnce: vi.fn().mockResolvedValue({ text: "  - Wireframe the flow\n- Write copy  ", model: "test" }),
      ensureDaemon: vi.fn(),
      call: vi.fn(),
      releaseDaemon: vi.fn(),
    cancelActiveCall: vi.fn(),
    };
    const result = await runProjectAssist("sub_tasks", project, client);
    expect(result).toBe("- Wireframe the flow\n- Write copy");
  });

  it("fails soft to null when the call throws", async () => {
    const client: OpenClawClient = {
      runOnce: vi.fn().mockRejectedValue(new Error("Gateway unreachable")),
      ensureDaemon: vi.fn(),
      call: vi.fn(),
      releaseDaemon: vi.fn(),
    cancelActiveCall: vi.fn(),
    };
    expect(await runProjectAssist("tighten_description", project, client)).toBeNull();
  });
});

describe("runProjectReportGeneration", () => {
  let repos: Repositories;
  let realProject: Project;

  beforeEach(async () => {
    repos = await initDatabase(createTestExecutor());
    realProject = await repos.projects.create({
      title: "Redesign onboarding flow",
      targetMonth: "2026-09",
      priority: "high",
    });
  });

  it("resolves the report to ok with content and model on success", async () => {
    const client: OpenClawClient = {
      runOnce: vi.fn().mockResolvedValue({ text: "Made real progress this week.", model: "xai/grok-4.5" }),
      ensureDaemon: vi.fn(),
      call: vi.fn(),
      releaseDaemon: vi.fn(),
    cancelActiveCall: vi.fn(),
    };
    const created = await repos.projectReports.createPending(realProject.id);

    const result = await runProjectReportGeneration({ repos, client, reportId: created.id, project: realProject });

    expect(result.status).toBe("ok");
    expect(result.content).toBe("Made real progress this week.");
    expect(result.model_used).toBe("xai/grok-4.5");
  });

  it("resolves the report to failed with a real reason when the call throws on both the try and the automatic retry", async () => {
    const client: OpenClawClient = {
      runOnce: vi.fn().mockRejectedValue(new Error("Gateway unreachable")),
      ensureDaemon: vi.fn(),
      call: vi.fn(),
      releaseDaemon: vi.fn(),
    cancelActiveCall: vi.fn(),
    };
    const created = await repos.projectReports.createPending(realProject.id);

    const result = await runProjectReportGeneration({ repos, client, reportId: created.id, project: realProject });

    expect(result.status).toBe("failed");
    expect(result.failure_reason).toBe("Gateway unreachable");
    expect(client.runOnce).toHaveBeenCalledTimes(2);
  });

  it("recovers via the automatic retry when only the first attempt fails", async () => {
    const client: OpenClawClient = {
      runOnce: vi
        .fn()
        .mockRejectedValueOnce(new Error("transient"))
        .mockResolvedValueOnce({ text: "Recovered on retry.", model: "ollama/hermes3:8b" }),
      ensureDaemon: vi.fn(),
      call: vi.fn(),
      releaseDaemon: vi.fn(),
      cancelActiveCall: vi.fn(),
    };
    const created = await repos.projectReports.createPending(realProject.id);

    const result = await runProjectReportGeneration({ repos, client, reportId: created.id, project: realProject });

    expect(result.status).toBe("ok");
    expect(result.content).toBe("Recovered on retry.");
    expect(client.runOnce).toHaveBeenCalledTimes(2);
  });
});
