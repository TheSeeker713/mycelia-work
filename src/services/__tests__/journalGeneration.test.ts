import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Note, SessionEvent, Task, TaskSession } from "../../data";
import { initDatabase, type Repositories } from "../../data";
import { createTestExecutor } from "../../data/__tests__/testExecutor";
import type { OpenClawClient } from "../openclawClient";
import type { OllamaClient } from "../ollamaClient";
import {
  STALE_PENDING_THRESHOLD_MS,
  buildSessionJournalPrompt,
  buildWeeklyRollupPrompt,
  runJournalGeneration,
  sessionJournalFilename,
  slugify,
  sweepStalePendingJournals,
  weeklyRollupFilename,
} from "../journalGeneration";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";

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

const session: TaskSession = {
  id: "s1",
  task_id: "t1",
  clocked_in_at: "2026-08-03T09:00:00.000Z",
  clocked_out_at: "2026-08-03T11:30:00.000Z",
  status: "stopped",
  is_estimated: false,
};

const events: SessionEvent[] = [
  { id: "e1", task_session_id: "s1", type: "clock_in", occurred_at: "2026-08-03T09:00:00.000Z" },
  { id: "e2", task_session_id: "s1", type: "clock_out", occurred_at: "2026-08-03T11:30:00.000Z" },
];

const notes: Note[] = [
  { id: "n1", task_session_id: "s1", body: "Fixed the shadow clipping bug.", created_at: "2026-08-03T10:00:00.000Z" },
];

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Write the Devlog Entry!")).toBe("write-the-devlog-entry");
  });

  it("falls back to 'untitled' for a title with nothing sluggable", () => {
    expect(slugify("!!!")).toBe("untitled");
  });
});

describe("filenames", () => {
  it("session journal filename matches the plan's pattern", () => {
    const name = sessionJournalFilename(task, new Date("2026-08-03T18:05:00"));
    expect(name).toBe("2026-08-03_1805_write-the-devlog-entry.md");
  });

  it("weekly roll-up filename uses a fixed slug", () => {
    const name = weeklyRollupFilename(new Date("2026-08-03T18:05:00"));
    expect(name).toBe("2026-08-03_1805_weekly-rollup.md");
  });
});

describe("buildSessionJournalPrompt", () => {
  it("includes the voice-rules doc, the task, the event log, and notes", () => {
    const prompt = buildSessionJournalPrompt({ task, session, events, notes });
    expect(prompt).toContain("Write the devlog entry");
    expect(prompt).toContain("Fixed the shadow clipping bug.");
    expect(prompt).toContain("Clocked in");
    // The voice-rules doc's own heading should be present verbatim, confirming it's really inlined.
    expect(prompt.toLowerCase()).toContain("authentic");
  });

  it("says plainly when a session has no notes, rather than an empty section", () => {
    const prompt = buildSessionJournalPrompt({ task, session, events, notes: [] });
    expect(prompt).toContain("no notes taken");
  });
});

describe("buildWeeklyRollupPrompt", () => {
  it("folds in each session journal's content under its own date", () => {
    const prompt = buildWeeklyRollupPrompt(
      [
        {
          id: "j1",
          task_id: "t1",
          task_session_id: "s1",
          generated_at: "2026-08-03T12:00:00.000Z",
          model_used: "xai/grok-4.5",
          status: "ok",
          content: "Fixed the shadow clipping bug today.",
          exported_path: null,
          kind: "session",
          failure_reason: null,
        },
      ],
      "this week",
    );
    expect(prompt).toContain("Fixed the shadow clipping bug today.");
  });

  it("says plainly when there's nothing to summarize", () => {
    const prompt = buildWeeklyRollupPrompt([], "this week");
    expect(prompt).toContain("no session journal entries logged");
  });
});

describe("runJournalGeneration", () => {
  let repos: Repositories;
  let fakeClient: OpenClawClient;
  let fakeOllama: OllamaClient;
  let realTaskId: string;
  let realSessionId: string;

  beforeEach(async () => {
    repos = await initDatabase(createTestExecutor());
    // journals.task_id/task_session_id are real foreign keys — these
    // tests need rows that actually exist, not just the fixture's
    // hardcoded "t1"/"s1" ids (used elsewhere in this file for the
    // pure prompt-building tests, which never touch the database).
    const realTask = await repos.tasks.create({ title: "Write the devlog entry" });
    realTaskId = realTask.id;
    realSessionId = (await repos.taskSessions.clockIn(realTaskId)).id;
    vi.mocked(invoke).mockReset();
    // Grok on by default in this describe block, so the existing
    // OpenClaw-path tests below keep exercising fakeClient — the
    // grok-off/direct-Ollama path has its own describe block further
    // down.
    await repos.settings.set("grok4_enabled", "true");
    fakeClient = {
      runOnce: vi.fn().mockResolvedValue({ text: "A generated journal entry.", model: "xai/grok-4.5" }),
      ensureDaemon: vi.fn().mockResolvedValue(true),
      call: vi.fn().mockResolvedValue({ text: "turn", model: "xai/grok-4.5" }),
      releaseDaemon: vi.fn().mockResolvedValue(undefined),
    cancelActiveCall: vi.fn(),
    };
    fakeOllama = {
      suggestContinuation: vi.fn(),
      classifyOnTopic: vi.fn(),
      warmUpGhostText: vi.fn(),
      warmUpModel: vi.fn(),
      isAvailable: vi.fn().mockResolvedValue(true),
      generateReport: vi.fn().mockResolvedValue("A locally-generated journal entry."),
    };
  });

  it("marks the journal ok, with content/model/exported path, on success", async () => {
    vi.mocked(invoke).mockResolvedValue("docs/workjournal/2026-08-03_1200_test.md");
    const pending = await repos.journals.createPending({ taskId: realTaskId, taskSessionId: realSessionId, kind: "session" });

    const result = await runJournalGeneration({
      repos,
      client: fakeClient,
      ollama: fakeOllama,
      journalId: pending.id,
      sessionKey: "agent:main:mycelia-time-journal-s1",
      prompt: "irrelevant for this test",
      filename: "2026-08-03_1200_test.md",
    });

    expect(result.status).toBe("ok");
    expect(result.content).toBe("A generated journal entry.");
    expect(result.model_used).toBe("xai/grok-4.5");
    expect(result.exported_path).toBe("docs/workjournal/2026-08-03_1200_test.md");
  });

  it("fails closed to 'failed' rather than throwing when the model call rejects on both the try and the automatic retry", async () => {
    fakeClient.runOnce = vi.fn().mockRejectedValue(new Error("Gateway unreachable"));
    const pending = await repos.journals.createPending({ taskId: realTaskId, taskSessionId: realSessionId, kind: "session" });

    const result = await runJournalGeneration({
      repos,
      client: fakeClient,
      ollama: fakeOllama,
      journalId: pending.id,
      sessionKey: "agent:main:mycelia-time-journal-s1",
      prompt: "irrelevant for this test",
      filename: "2026-08-03_1200_test.md",
    });

    expect(result.status).toBe("failed");
    expect(result.content).toBeNull();
    expect(result.failure_reason).toBe("Gateway unreachable");
    expect(fakeClient.runOnce).toHaveBeenCalledTimes(2);
  });

  it("recovers via the automatic retry when only the first attempt fails", async () => {
    vi.mocked(invoke).mockResolvedValue("docs/workjournal/2026-08-03_1200_test.md");
    fakeClient.runOnce = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce({ text: "Recovered on retry.", model: "ollama/hermes3:8b" });
    const pending = await repos.journals.createPending({ taskId: realTaskId, taskSessionId: realSessionId, kind: "session" });

    const result = await runJournalGeneration({
      repos,
      client: fakeClient,
      ollama: fakeOllama,
      journalId: pending.id,
      sessionKey: "agent:main:mycelia-time-journal-s1",
      prompt: "irrelevant for this test",
      filename: "2026-08-03_1200_test.md",
    });

    expect(result.status).toBe("ok");
    expect(result.content).toBe("Recovered on retry.");
    expect(fakeClient.runOnce).toHaveBeenCalledTimes(2);
  });

  it("fails closed when the model call succeeds but the file export fails", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("no Tauri bridge in this test"));
    const pending = await repos.journals.createPending({ taskId: realTaskId, taskSessionId: realSessionId, kind: "session" });

    const result = await runJournalGeneration({
      repos,
      client: fakeClient,
      ollama: fakeOllama,
      journalId: pending.id,
      sessionKey: "agent:main:mycelia-time-journal-s1",
      prompt: "irrelevant for this test",
      filename: "2026-08-03_1200_test.md",
    });

    expect(result.status).toBe("failed");
  });
});

describe("runJournalGeneration (Grok off — direct-Ollama path)", () => {
  let repos: Repositories;
  let fakeClient: OpenClawClient;
  let fakeOllama: OllamaClient;
  let realTaskId: string;
  let realSessionId: string;

  beforeEach(async () => {
    repos = await initDatabase(createTestExecutor());
    const realTask = await repos.tasks.create({ title: "Write the devlog entry" });
    realTaskId = realTask.id;
    realSessionId = (await repos.taskSessions.clockIn(realTaskId)).id;
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockResolvedValue("docs/workjournal/2026-08-03_1200_test.md");
    // Grok off is the default (no setting row) — asserted explicitly
    // here anyway so this block's intent reads clearly on its own.
    await repos.settings.set("grok4_enabled", "false");
    fakeClient = {
      runOnce: vi.fn(),
      ensureDaemon: vi.fn().mockResolvedValue(true),
      call: vi.fn(),
      releaseDaemon: vi.fn().mockResolvedValue(undefined),
      cancelActiveCall: vi.fn(),
    };
    fakeOllama = {
      suggestContinuation: vi.fn(),
      classifyOnTopic: vi.fn(),
      warmUpGhostText: vi.fn(),
      warmUpModel: vi.fn(),
      isAvailable: vi.fn().mockResolvedValue(true),
      generateReport: vi.fn().mockResolvedValue("A locally-generated journal entry."),
    };
  });

  it("calls Ollama directly, never OpenClaw, when Grok is off", async () => {
    const pending = await repos.journals.createPending({ taskId: realTaskId, taskSessionId: realSessionId, kind: "session" });

    const result = await runJournalGeneration({
      repos,
      client: fakeClient,
      ollama: fakeOllama,
      journalId: pending.id,
      sessionKey: "agent:main:mycelia-time-journal-s1",
      prompt: "irrelevant for this test",
      filename: "2026-08-03_1200_test.md",
    });

    expect(result.status).toBe("ok");
    expect(result.content).toBe("A locally-generated journal entry.");
    expect(fakeOllama.generateReport).toHaveBeenCalledTimes(1);
    expect(fakeClient.runOnce).not.toHaveBeenCalled();
  });

  it("recovers via one automatic retry when only the first local attempt fails", async () => {
    fakeOllama.generateReport = vi
      .fn()
      .mockRejectedValueOnce(new Error("cold load timed out"))
      .mockResolvedValueOnce("Recovered on retry.");
    const pending = await repos.journals.createPending({ taskId: realTaskId, taskSessionId: realSessionId, kind: "session" });

    const result = await runJournalGeneration({
      repos,
      client: fakeClient,
      ollama: fakeOllama,
      journalId: pending.id,
      sessionKey: "agent:main:mycelia-time-journal-s1",
      prompt: "irrelevant for this test",
      filename: "2026-08-03_1200_test.md",
    });

    expect(result.status).toBe("ok");
    expect(result.content).toBe("Recovered on retry.");
    expect(fakeOllama.generateReport).toHaveBeenCalledTimes(2);
  });

  it("fails closed to 'failed' when both the local attempt and its retry reject", async () => {
    fakeOllama.generateReport = vi.fn().mockRejectedValue(new Error("Ollama unreachable"));
    const pending = await repos.journals.createPending({ taskId: realTaskId, taskSessionId: realSessionId, kind: "session" });

    const result = await runJournalGeneration({
      repos,
      client: fakeClient,
      ollama: fakeOllama,
      journalId: pending.id,
      sessionKey: "agent:main:mycelia-time-journal-s1",
      prompt: "irrelevant for this test",
      filename: "2026-08-03_1200_test.md",
    });

    expect(result.status).toBe("failed");
    expect(result.failure_reason).toBe("Ollama unreachable");
    expect(fakeOllama.generateReport).toHaveBeenCalledTimes(2);
  });
});

describe("sweepStalePendingJournals", () => {
  it("marks a pending journal older than the threshold as failed, with a clear reason", async () => {
    const executor = createTestExecutor();
    const repos = await initDatabase(executor);
    const realTask = await repos.tasks.create({ title: "Old task" });
    const pending = await repos.journals.createPending({ taskId: realTask.id, kind: "session" });

    // createPending always stamps "now" — backdate directly so this
    // journal is genuinely past the staleness threshold.
    const staleAt = new Date(Date.now() - STALE_PENDING_THRESHOLD_MS - 1000).toISOString();
    await executor.execute("UPDATE journals SET generated_at = ? WHERE id = ?", [staleAt, pending.id]);

    const touched = await sweepStalePendingJournals(repos);

    expect(touched).toBe(1);
    const swept = await repos.journals.getById(pending.id);
    expect(swept?.status).toBe("failed");
    expect(swept?.failure_reason).toContain("didn't finish");
  });

  it("leaves a recently-created pending journal alone", async () => {
    const repos = await initDatabase(createTestExecutor());
    const realTask = await repos.tasks.create({ title: "Fresh task" });
    const pending = await repos.journals.createPending({ taskId: realTask.id, kind: "session" });

    const touched = await sweepStalePendingJournals(repos);

    expect(touched).toBe(0);
    expect((await repos.journals.getById(pending.id))?.status).toBe("pending");
  });
});
