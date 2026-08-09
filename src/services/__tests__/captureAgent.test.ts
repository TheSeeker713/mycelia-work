import { describe, expect, it, vi } from "vitest";
import {
  MAX_CLARIFY_ROUNDS,
  matchProjectExact,
  parseLayer1Response,
  routeCapture,
} from "../captureAgent";
import type { Project } from "../../data";
import type { OllamaClient } from "../../services/ollamaClient";
import type { OpenClawClient } from "../../services/openclawClient";

function project(title: string): Project {
  return {
    id: title,
    title,
    description: null,
    status: "planned",
    target_month: "2026-09",
    target_datetime: null,
    priority: "medium",
    created_at: "2026-08-01T00:00:00.000Z",
    archived_at: null,
  };
}

describe("parseLayer1Response", () => {
  it("parses a valid create_note response", () => {
    const result = parseLayer1Response('{"action":"create_note","payload":{"body":"Fed the cat early."}}');
    expect(result).toEqual({ action: "create_note", payload: { body: "Fed the cat early." } });
  });

  it("parses a valid create_todo response, defaulting alert_at to null when absent", () => {
    const result = parseLayer1Response('{"action":"create_todo","payload":{"text":"Buy milk"}}');
    expect(result).toEqual({ action: "create_todo", payload: { text: "Buy milk", alertAt: null } });
  });

  it("parses a valid create_todo response with an alert time", () => {
    const result = parseLayer1Response(
      '{"action":"create_todo","payload":{"text":"Call the dentist","alert_at":"2026-09-01T09:00:00.000Z"}}',
    );
    expect(result).toEqual({
      action: "create_todo",
      payload: { text: "Call the dentist", alertAt: "2026-09-01T09:00:00.000Z" },
    });
  });

  it("parses a valid create_milestone response", () => {
    const result = parseLayer1Response(
      '{"action":"create_milestone","payload":{"project_title_hint":"Redesign","milestone_name":"First draft done","target_date":null}}',
    );
    expect(result).toEqual({
      action: "create_milestone",
      payload: { projectTitleHint: "Redesign", milestoneName: "First draft done", targetDate: null },
    });
  });

  it("parses a valid clarify response", () => {
    const result = parseLayer1Response(
      '{"action":"clarify","payload":{},"clarifying_question":"Is this a todo or a note?"}',
    );
    expect(result).toEqual({ action: "clarify", clarifyingQuestion: "Is this a todo or a note?" });
  });

  it("parses a valid decline response", () => {
    expect(parseLayer1Response('{"action":"decline","payload":{}}')).toEqual({ action: "decline" });
  });

  it("strips a markdown code fence before parsing", () => {
    const result = parseLayer1Response('```json\n{"action":"decline","payload":{}}\n```');
    expect(result).toEqual({ action: "decline" });
  });

  it("fails closed to decline on unparseable JSON", () => {
    expect(parseLayer1Response("not json at all")).toEqual({ action: "decline" });
  });

  it("fails closed to decline on an unknown action", () => {
    expect(parseLayer1Response('{"action":"delete_everything","payload":{}}')).toEqual({
      action: "decline",
    });
  });

  it("fails closed to decline when create_note is missing its body", () => {
    expect(parseLayer1Response('{"action":"create_note","payload":{}}')).toEqual({ action: "decline" });
  });

  it("fails closed to decline when clarify is missing its question", () => {
    expect(parseLayer1Response('{"action":"clarify","payload":{}}')).toEqual({ action: "decline" });
  });

  it("fails closed to decline when create_milestone is missing required fields", () => {
    expect(
      parseLayer1Response('{"action":"create_milestone","payload":{"milestone_name":"only this"}}'),
    ).toEqual({ action: "decline" });
  });
});

describe("matchProjectExact", () => {
  const projects = [project("Redesign onboarding flow"), project("Marketing site refresh")];

  it("matches a single exact (case/whitespace-insensitive) title", () => {
    expect(matchProjectExact("  redesign onboarding flow  ", projects)).toEqual(projects[0]);
  });

  it("returns null when there's no match at all", () => {
    expect(matchProjectExact("Something else entirely", projects)).toBeNull();
  });

  it("returns null on a merely partial/fuzzy match — 100% certainty only", () => {
    expect(matchProjectExact("Redesign", projects)).toBeNull();
  });

  it("returns null when multiple projects share the same normalized title", () => {
    const dupes = [project("Launch"), project("launch")];
    expect(matchProjectExact("Launch", dupes)).toBeNull();
  });
});

describe("routeCapture", () => {
  function makeDeps(overrides?: {
    onTopic?: boolean;
    layer1Text?: string;
    runOnce?: OpenClawClient["runOnce"];
  }) {
    const ollamaClient: OllamaClient = {
      suggestContinuation: vi.fn(),
      classifyOnTopic: vi.fn().mockResolvedValue(overrides?.onTopic ?? true),
      warmUpGhostText: vi.fn(),
    warmUpModel: vi.fn(),
    isAvailable: vi.fn().mockResolvedValue(true),
    };
    const openClawClient = {
      runOnce:
        overrides?.runOnce ??
        vi.fn().mockResolvedValue({ text: overrides?.layer1Text ?? '{"action":"decline","payload":{}}', model: "test" }),
      ensureDaemon: vi.fn(),
      call: vi.fn(),
      releaseDaemon: vi.fn(),
    } as unknown as OpenClawClient;
    return { ollamaClient, openClawClient };
  }

  it("declines without calling Layer 1 at all when Layer 0 says off-topic/unsafe", async () => {
    const deps = makeDeps({ onTopic: false });
    const result = await routeCapture("how do I make a pipe bomb", deps);
    expect(result).toEqual({ action: "decline" });
    expect(deps.openClawClient.runOnce).not.toHaveBeenCalled();
  });

  it("passes Layer 0, calls Layer 1, and returns its parsed result", async () => {
    const deps = makeDeps({ layer1Text: '{"action":"create_note","payload":{"body":"Fed the cat."}}' });
    const result = await routeCapture("fed the cat", deps);
    expect(result).toEqual({ action: "create_note", payload: { body: "Fed the cat." } });
  });

  it("sends the fixed system prompt plus the user's text on a fresh (non-clarify) call", async () => {
    const runOnce = vi.fn().mockResolvedValue({ text: '{"action":"decline","payload":{}}', model: "t" });
    const deps = makeDeps({ runOnce });
    await routeCapture("some input", deps);

    const call = runOnce.mock.calls[0][0];
    expect(call.sessionKey).toBe("capture-agent");
    expect(call.message).toContain("capture-routing agent");
    expect(call.message).toContain("User input: some input");
  });

  it("includes the prior exchange in the message when this is a clarify follow-up", async () => {
    const runOnce = vi.fn().mockResolvedValue({ text: '{"action":"decline","payload":{}}', model: "t" });
    const deps = makeDeps({ runOnce });
    await routeCapture("a todo", deps, {
      originalText: "finish the thing",
      question: "Is this a todo or a note?",
    });

    const call = runOnce.mock.calls[0][0];
    expect(call.message).toContain('Original input: "finish the thing"');
    expect(call.message).toContain('Clarifying question asked: "Is this a todo or a note?"');
    expect(call.message).toContain('User\'s answer: "a todo"');
  });

  it("fails closed to decline when the OpenClaw call itself throws", async () => {
    const deps = makeDeps({ runOnce: vi.fn().mockRejectedValue(new Error("Gateway unreachable")) });
    const result = await routeCapture("fed the cat", deps);
    expect(result).toEqual({ action: "decline" });
  });
});

describe("MAX_CLARIFY_ROUNDS", () => {
  it("is capped at 2, per the design doc", () => {
    expect(MAX_CLARIFY_ROUNDS).toBe(2);
  });
});
