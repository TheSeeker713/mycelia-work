import { beforeEach, describe, expect, it, vi } from "vitest";
import { initDatabase, type Repositories, type SqlExecutor } from "../../data";
import { createTestExecutor } from "../../data/__tests__/testExecutor";
import type { OllamaClient } from "../../services/ollamaClient";
import type { OpenClawClient } from "../../services/openclawClient";
import { createCaptureStore, NO_SESSION_MESSAGE, type CaptureStore } from "../captureStore";
import { MAX_CLARIFY_ROUNDS } from "../../services/captureAgent";
import type { ResourceWatchdogClient } from "../../services/resourceWatchdog";

let executor: SqlExecutor;
let repos: Repositories;
let ollamaClient: OllamaClient;
let openClawClient: OpenClawClient;
let resourceWatchdogClient: ResourceWatchdogClient;
let useCapture: CaptureStore;
let sessionId: string;

function layer1(text: string) {
  return { text, model: "test" };
}

beforeEach(async () => {
  executor = createTestExecutor();
  repos = await initDatabase(executor);

  ollamaClient = {
    suggestContinuation: vi.fn(),
    classifyOnTopic: vi.fn().mockResolvedValue(true),
  };
  openClawClient = {
    runOnce: vi.fn(),
    ensureDaemon: vi.fn(),
    call: vi.fn(),
    releaseDaemon: vi.fn(),
  };
  resourceWatchdogClient = {
    checkPressure: vi.fn().mockResolvedValue({ underPressure: false, cpuPercent: 10, memPercent: 20 }),
  };

  const task = await repos.tasks.create({ title: "Write the devlog entry" });
  const session = await repos.taskSessions.clockIn(task.id);
  sessionId = session.id;

  useCapture = createCaptureStore(repos, { ollamaClient, openClawClient, resourceWatchdogClient });
});

function mockLayer1Once(text: string) {
  (openClawClient.runOnce as ReturnType<typeof vi.fn>).mockResolvedValueOnce(layer1(text));
}

describe("captureStore", () => {
  it("declines without calling Layer 1 when Layer 0 says off-topic", async () => {
    ollamaClient.classifyOnTopic = vi.fn().mockResolvedValue(false);
    await useCapture.getState().submit("how do I pick a lock", sessionId);

    expect(useCapture.getState().phase).toBe("declined");
    expect(useCapture.getState().declineMessage).toContain("Not sure where that goes");
    expect(openClawClient.runOnce).not.toHaveBeenCalled();
  });

  it("declines when Layer 1 itself declines", async () => {
    mockLayer1Once('{"action":"decline","payload":{}}');
    await useCapture.getState().submit("who won the world series", sessionId);
    expect(useCapture.getState().phase).toBe("declined");
  });

  it("files a note when there's an active session", async () => {
    mockLayer1Once('{"action":"create_note","payload":{"body":"Fed the cat early."}}');
    await useCapture.getState().submit("fed the cat early", sessionId);

    expect(useCapture.getState().phase).toBe("confirmed");
    expect(useCapture.getState().confirmed).toMatchObject({
      action: "create_note",
      summary: "Fed the cat early.",
    });
    const notes = await repos.notes.listBySession(sessionId);
    expect(notes.map((n) => n.body)).toContain("Fed the cat early.");
  });

  it("blocks with a plain reason when create_note resolves with no active session", async () => {
    mockLayer1Once('{"action":"create_note","payload":{"body":"Fed the cat early."}}');
    await useCapture.getState().submit("fed the cat early", null);

    expect(useCapture.getState().phase).toBe("blocked_no_session");
  });

  it("files a todo directly, no session needed", async () => {
    mockLayer1Once('{"action":"create_todo","payload":{"text":"Buy milk","alert_at":null}}');
    await useCapture.getState().submit("need to buy milk", null);

    expect(useCapture.getState().phase).toBe("confirmed");
    expect(useCapture.getState().confirmed).toMatchObject({ action: "create_todo", summary: "Buy milk" });
    const todos = await repos.todos.list();
    expect(todos.map((t) => t.text)).toContain("Buy milk");
  });

  it("files a milestone directly when the project hint matches exactly", async () => {
    const project = await repos.projects.create({
      title: "Redesign onboarding flow",
      targetMonth: "2026-09",
      priority: "high",
    });
    mockLayer1Once(
      '{"action":"create_milestone","payload":{"project_title_hint":"Redesign onboarding flow","milestone_name":"First draft done","target_date":null}}',
    );
    await useCapture.getState().submit("finished the first draft of the redesign", null);

    expect(useCapture.getState().phase).toBe("confirmed");
    expect(useCapture.getState().confirmed?.summary).toBe("First draft done — Redesign onboarding flow");
    const milestones = await repos.milestones.listByProject(project.id);
    expect(milestones.map((m) => m.name)).toContain("First draft done");
  });

  it("falls back to project_pick when the project hint doesn't match exactly, and pickProjectForMilestone completes it", async () => {
    const project = await repos.projects.create({
      title: "Redesign onboarding flow",
      targetMonth: "2026-09",
      priority: "high",
    });
    mockLayer1Once(
      '{"action":"create_milestone","payload":{"project_title_hint":"the redesign thing","milestone_name":"First draft done","target_date":null}}',
    );
    await useCapture.getState().submit("finished the first draft", null);

    expect(useCapture.getState().phase).toBe("project_pick");
    expect(useCapture.getState().pendingMilestone).toEqual({
      milestoneName: "First draft done",
      targetDate: null,
    });

    await useCapture.getState().pickProjectForMilestone(project.id);

    expect(useCapture.getState().phase).toBe("confirmed");
    expect(useCapture.getState().confirmed?.summary).toBe("First draft done — Redesign onboarding flow");
  });

  it("clarify: asks the question, then respondToClarify resolves the pipeline with prior context attached", async () => {
    mockLayer1Once(
      '{"action":"clarify","payload":{},"clarifying_question":"Is this a todo or a note?"}',
    );
    await useCapture.getState().submit("finish the thing", null);

    expect(useCapture.getState().phase).toBe("clarify");
    expect(useCapture.getState().clarifyQuestion).toBe("Is this a todo or a note?");

    mockLayer1Once('{"action":"create_todo","payload":{"text":"Finish the thing","alert_at":null}}');
    await useCapture.getState().respondToClarify("a todo", null);

    expect(useCapture.getState().phase).toBe("confirmed");
    const call = (openClawClient.runOnce as ReturnType<typeof vi.fn>).mock.calls[1][0];
    expect(call.message).toContain('Original input: "finish the thing"');
    expect(call.message).toContain('Clarifying question asked: "Is this a todo or a note?"');
  });

  it("clarify cap: still ambiguous after MAX_CLARIFY_ROUNDS questions falls back to filing the original text as a plain note", async () => {
    expect(MAX_CLARIFY_ROUNDS).toBe(2);

    mockLayer1Once('{"action":"clarify","payload":{},"clarifying_question":"Todo or note? (round 1)"}');
    await useCapture.getState().submit("finish the thing", sessionId);
    expect(useCapture.getState().phase).toBe("clarify");

    mockLayer1Once('{"action":"clarify","payload":{},"clarifying_question":"Still unclear? (round 2)"}');
    await useCapture.getState().respondToClarify("not sure", sessionId);
    expect(useCapture.getState().phase).toBe("clarify");

    mockLayer1Once('{"action":"clarify","payload":{},"clarifying_question":"Still unclear? (round 3, should not ask)"}');
    await useCapture.getState().respondToClarify("still not sure", sessionId);

    // Cap reached on the 3rd ambiguous result — files a note instead of asking again.
    expect(useCapture.getState().phase).toBe("confirmed");
    expect(useCapture.getState().confirmed).toMatchObject({ action: "create_note", summary: "finish the thing" });
  });

  it("correctTo swaps a confirmed note into a todo, reusing the same text", async () => {
    mockLayer1Once('{"action":"create_note","payload":{"body":"Buy milk"}}');
    await useCapture.getState().submit("buy milk", sessionId);
    const noteId = useCapture.getState().confirmed?.id;

    await useCapture.getState().correctTo("create_todo", sessionId);

    expect(useCapture.getState().phase).toBe("confirmed");
    expect(useCapture.getState().confirmed).toMatchObject({ action: "create_todo", summary: "Buy milk" });
    const notes = await repos.notes.listBySession(sessionId);
    expect(notes.find((n) => n.id === noteId)).toBeUndefined();
    const todos = await repos.todos.list();
    expect(todos.map((t) => t.text)).toContain("Buy milk");
  });

  it("correctTo swaps a confirmed todo into a note, blocked_no_session if nothing's clocked in", async () => {
    mockLayer1Once('{"action":"create_todo","payload":{"text":"Buy milk","alert_at":null}}');
    await useCapture.getState().submit("buy milk", null);

    await useCapture.getState().correctTo("create_note", null);

    expect(useCapture.getState().phase).toBe("blocked_no_session");
    const todos = await repos.todos.list();
    expect(todos.map((t) => t.text)).not.toContain("Buy milk");
  });

  it("correctTo 'milestone' deletes the wrong filing and reopens project_pick", async () => {
    const project = await repos.projects.create({
      title: "Marketing site refresh",
      targetMonth: "2026-09",
      priority: "medium",
    });
    mockLayer1Once('{"action":"create_todo","payload":{"text":"Shipped the new hero section","alert_at":null}}');
    await useCapture.getState().submit("shipped the new hero section", null);

    await useCapture.getState().correctTo("milestone", null);

    expect(useCapture.getState().phase).toBe("project_pick");
    expect(useCapture.getState().pendingMilestone).toEqual({
      milestoneName: "Shipped the new hero section",
      targetDate: null,
    });
    const todos = await repos.todos.list();
    expect(todos.map((t) => t.text)).not.toContain("Shipped the new hero section");

    await useCapture.getState().pickProjectForMilestone(project.id);
    expect(useCapture.getState().confirmed?.summary).toBe(
      "Shipped the new hero section — Marketing site refresh",
    );
  });

  it("dismiss clears back to idle", async () => {
    mockLayer1Once('{"action":"decline","payload":{}}');
    await useCapture.getState().submit("who won the world series", null);
    expect(useCapture.getState().phase).toBe("declined");

    useCapture.getState().dismiss();

    expect(useCapture.getState().phase).toBe("idle");
    expect(useCapture.getState().declineMessage).toBeNull();
  });

  it("exports NO_SESSION_MESSAGE for the UI to render on blocked_no_session", () => {
    expect(NO_SESSION_MESSAGE).toContain("Clock into a task first");
  });

  describe("resource pressure", () => {
    it("submit: under pressure, skips Layer 0/1 entirely, logs a throttled event, and offers fileAsNoteAnyway", async () => {
      resourceWatchdogClient.checkPressure = vi
        .fn()
        .mockResolvedValue({ underPressure: true, cpuPercent: 92, memPercent: 30 });

      await useCapture.getState().submit("fed the cat early", sessionId);

      expect(useCapture.getState().phase).toBe("resource_pressure");
      expect(ollamaClient.classifyOnTopic).not.toHaveBeenCalled();
      expect(openClawClient.runOnce).not.toHaveBeenCalled();

      const events = await repos.resourceEvents.list();
      expect(events).toHaveLength(1);
      expect(events[0].kind).toBe("throttled");

      await useCapture.getState().fileAsNoteAnyway(sessionId);

      expect(useCapture.getState().phase).toBe("confirmed");
      expect(useCapture.getState().confirmed).toMatchObject({ action: "create_note", summary: "fed the cat early" });
    });

    it("fileAsNoteAnyway respects the no-session block like any other note filing", async () => {
      resourceWatchdogClient.checkPressure = vi
        .fn()
        .mockResolvedValue({ underPressure: true, cpuPercent: 92, memPercent: 30 });
      await useCapture.getState().submit("fed the cat early", null);
      expect(useCapture.getState().phase).toBe("resource_pressure");

      await useCapture.getState().fileAsNoteAnyway(null);

      expect(useCapture.getState().phase).toBe("blocked_no_session");
    });

    it("respondToClarify: under pressure mid-clarify also skips straight to resource_pressure", async () => {
      mockLayer1Once('{"action":"clarify","payload":{},"clarifying_question":"Todo or note?"}');
      await useCapture.getState().submit("finish the thing", sessionId);
      expect(useCapture.getState().phase).toBe("clarify");

      resourceWatchdogClient.checkPressure = vi
        .fn()
        .mockResolvedValue({ underPressure: true, cpuPercent: 92, memPercent: 30 });
      await useCapture.getState().respondToClarify("a todo", sessionId);

      expect(useCapture.getState().phase).toBe("resource_pressure");
      expect(openClawClient.runOnce).toHaveBeenCalledTimes(1); // only the original clarify call, not a second one
    });

    it("dismiss clears back to idle from resource_pressure too", async () => {
      resourceWatchdogClient.checkPressure = vi
        .fn()
        .mockResolvedValue({ underPressure: true, cpuPercent: 92, memPercent: 30 });
      await useCapture.getState().submit("fed the cat early", sessionId);
      expect(useCapture.getState().phase).toBe("resource_pressure");

      useCapture.getState().dismiss();

      expect(useCapture.getState().phase).toBe("idle");
    });
  });
});
