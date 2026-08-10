import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initDatabase, type Repositories } from "../../data";
import { createTestExecutor } from "../../data/__tests__/testExecutor";
import { StoreProvider, useJournalsStore, useProjectsStore } from "../../store/StoreProvider";
import type { OpenClawClient } from "../../services/openclawClient";
import { useAiInFlight } from "../useAiInFlight";
import { runAiJob } from "../../services/aiQueue";

let repos: Repositories;
let openClawClient: OpenClawClient;

beforeEach(async () => {
  repos = await initDatabase(createTestExecutor());
  openClawClient = {
    runOnce: vi.fn(),
    ensureDaemon: vi.fn(),
    call: vi.fn(),
    releaseDaemon: vi.fn(),
    cancelActiveCall: vi.fn().mockResolvedValue(undefined),
  };
});

function wrapper({ children }: { children: ReactNode }) {
  return (
    <StoreProvider repositories={repos} openClawClient={openClawClient}>
      {children}
    </StoreProvider>
  );
}

describe("useAiInFlight", () => {
  it("is inactive when nothing is generating", () => {
    const { result } = renderHook(() => useAiInFlight(), { wrapper });
    expect(result.current.active).toBe(false);
    expect(result.current.description).toBeNull();
  });

  it("reports a pending journal as an active session journal", async () => {
    const task = await repos.tasks.create({ title: "Write the devlog entry" });
    const session = await repos.taskSessions.clockIn(task.id);
    await repos.journals.createPending({ taskId: task.id, taskSessionId: session.id, kind: "session" });

    const { result } = renderHook(
      () => ({ inFlight: useAiInFlight(), journals: useJournalsStore((s) => s) }),
      { wrapper },
    );
    await act(async () => {
      await result.current.journals.loadRecent();
    });

    expect(result.current.inFlight.active).toBe(true);
    expect(result.current.inFlight.description).toBe("Writing your report");
  });

  it("counts queued-only work with no persisted row, like a check-in or an upscale", async () => {
    const gate = new Promise<void>(() => {}); // never resolves; the job just stays running
    void runAiJob({ kind: "upscale", label: "Upscaling that artwork" }, () => gate);

    const { result } = renderHook(
      () => ({ inFlight: useAiInFlight(), journals: useJournalsStore((s) => s) }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.inFlight.active).toBe(true));
    expect(result.current.inFlight.description).toBe("Upscaling that artwork");
  });

  it("never holds the exit for ghost text — it drops itself and is not worth waiting on", async () => {
    const gate = new Promise<void>(() => {});
    void runAiJob({ kind: "ghost_text", label: "Suggesting a continuation" }, () => gate);

    const { result } = renderHook(
      () => ({ inFlight: useAiInFlight(), journals: useJournalsStore((s) => s) }),
      { wrapper },
    );

    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.inFlight.active).toBe(false);
  });

  it("reports a pending weekly rollup distinctly from a session journal", async () => {
    await repos.journals.createPending({ kind: "weekly" });

    const { result } = renderHook(
      () => ({ inFlight: useAiInFlight(), journals: useJournalsStore((s) => s) }),
      { wrapper },
    );
    await act(async () => {
      await result.current.journals.loadRecent();
    });

    expect(result.current.inFlight.description).toBe("Writing your weekly report");
  });

  it("reports a pending project report as active", async () => {
    const { result } = renderHook(
      () => ({ inFlight: useAiInFlight(), projects: useProjectsStore((s) => s) }),
      { wrapper },
    );
    await act(async () => {
      await result.current.projects.addProject({ title: "Client portal revamp", targetMonth: "2026-09", priority: "low" });
    });
    const project = result.current.projects.projects[0];
    await act(async () => {
      await repos.projectReports.createPending(project.id);
      await result.current.projects.loadReports(project.id);
    });

    expect(result.current.inFlight.active).toBe(true);
    expect(result.current.inFlight.description).toBe("Writing a project status report");
  });

  it("discard cancels the active call and deletes the pending journal for real", async () => {
    const task = await repos.tasks.create({ title: "Write the devlog entry" });
    const session = await repos.taskSessions.clockIn(task.id);
    const pending = await repos.journals.createPending({ taskId: task.id, taskSessionId: session.id, kind: "session" });

    const { result } = renderHook(
      () => ({ inFlight: useAiInFlight(), journals: useJournalsStore((s) => s) }),
      { wrapper },
    );
    await act(async () => {
      await result.current.journals.loadRecent();
    });
    expect(result.current.inFlight.active).toBe(true);

    await act(async () => {
      await result.current.inFlight.discard();
    });

    expect(openClawClient.cancelActiveCall).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.inFlight.active).toBe(false));
    expect(await repos.journals.getById(pending.id)).toBeNull();
  });
});
