import { describe, expect, it, vi } from "vitest";
import type { Task } from "../../data";
import type { OpenClawClient } from "../openclawClient";
import {
  MAX_CHECKIN_TURNS,
  buildCheckinSystemPrompt,
  continueCheckinConversation,
  parseCheckinTurn,
  startCheckinConversation,
} from "../checkinConversation";

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

describe("buildCheckinSystemPrompt", () => {
  it("anchors to the known task and clock-in time, and states the turn cap", () => {
    const prompt = buildCheckinSystemPrompt(task, "2026-08-03T09:00:00.000Z", "2026-08-03T18:00:00.000Z");
    expect(prompt).toContain("Write the devlog entry");
    expect(prompt).toContain("2026-08-03T09:00:00.000Z");
    expect(prompt).toContain(String(MAX_CHECKIN_TURNS));
    expect(prompt).toContain("how long did you work");
  });
});

describe("parseCheckinTurn", () => {
  it("parses a valid non-final turn with bucketed options", () => {
    const turn = parseCheckinTurn(
      JSON.stringify({
        message: "Did you keep working after clocking in, or step away right away?",
        options: [
          { label: "Kept working a while", value: "kept_working" },
          { label: "Stepped away right away", value: "stepped_away" },
        ],
        final: false,
        resolvedCloseAt: null,
        resolvedNote: null,
      }),
    );
    expect(turn).not.toBeNull();
    expect(turn?.final).toBe(false);
    expect(turn?.options?.length).toBe(2);
  });

  it("parses a valid final turn with a resolved close time", () => {
    const turn = parseCheckinTurn(
      JSON.stringify({
        message: "Got it — closing this out at 11:30am.",
        options: null,
        final: true,
        resolvedCloseAt: "2026-08-03T11:30:00.000Z",
        resolvedNote: "Got pulled into a call.",
      }),
    );
    expect(turn).toEqual({
      message: "Got it — closing this out at 11:30am.",
      options: null,
      final: true,
      resolvedCloseAt: "2026-08-03T11:30:00.000Z",
      resolvedNote: "Got pulled into a call.",
    });
  });

  it("tolerates a markdown code fence around the JSON", () => {
    const turn = parseCheckinTurn(
      "```json\n" +
        JSON.stringify({ message: "Question?", options: null, final: false, resolvedCloseAt: null, resolvedNote: null }) +
        "\n```",
    );
    expect(turn?.message).toBe("Question?");
  });

  it("fails closed on invalid JSON", () => {
    expect(parseCheckinTurn("not json at all")).toBeNull();
  });

  it("fails closed when final is true but resolvedCloseAt is missing", () => {
    const turn = parseCheckinTurn(
      JSON.stringify({ message: "Done.", options: null, final: true, resolvedCloseAt: null, resolvedNote: null }),
    );
    expect(turn).toBeNull();
  });

  it("fails closed when final is true but resolvedCloseAt isn't a valid date", () => {
    const turn = parseCheckinTurn(
      JSON.stringify({
        message: "Done.",
        options: null,
        final: true,
        resolvedCloseAt: "not-a-date",
        resolvedNote: null,
      }),
    );
    expect(turn).toBeNull();
  });

  it("fails closed on a single-option array (not a real choice)", () => {
    const turn = parseCheckinTurn(
      JSON.stringify({
        message: "Question?",
        options: [{ label: "Only one", value: "only" }],
        final: false,
        resolvedCloseAt: null,
        resolvedNote: null,
      }),
    );
    expect(turn).toBeNull();
  });

  it("fails closed when message is missing", () => {
    const turn = parseCheckinTurn(
      JSON.stringify({ options: null, final: false, resolvedCloseAt: null, resolvedNote: null }),
    );
    expect(turn).toBeNull();
  });
});

describe("startCheckinConversation / continueCheckinConversation", () => {
  function fakeClient(text: string, shouldReject = false): OpenClawClient {
    return {
      runOnce: vi.fn(),
      ensureDaemon: vi.fn().mockResolvedValue(true),
      call: shouldReject ? vi.fn().mockRejectedValue(new Error("down")) : vi.fn().mockResolvedValue({ text, model: "xai/grok-4.5" }),
      releaseDaemon: vi.fn().mockResolvedValue(undefined),
    cancelActiveCall: vi.fn(),
    };
  }

  it("startCheckinConversation returns a parsed turn on a valid response", async () => {
    const validTurn = JSON.stringify({
      message: "Question?",
      options: [
        { label: "A", value: "a" },
        { label: "B", value: "b" },
      ],
      final: false,
      resolvedCloseAt: null,
      resolvedNote: null,
    });
    const turn = await startCheckinConversation(fakeClient(validTurn), task, "2026-08-03T09:00:00.000Z", "agent:main:test");
    expect(turn?.message).toBe("Question?");
  });

  it("startCheckinConversation returns null (fails closed) when the call rejects", async () => {
    const turn = await startCheckinConversation(fakeClient("", true), task, "2026-08-03T09:00:00.000Z", "agent:main:test");
    expect(turn).toBeNull();
  });

  it("continueCheckinConversation returns null (fails closed) on malformed output", async () => {
    const turn = await continueCheckinConversation(fakeClient("not json"), "agent:main:test", "a");
    expect(turn).toBeNull();
  });
});
