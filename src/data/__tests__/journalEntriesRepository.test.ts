// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { applyMigrations } from "../schema";
import { createJournalEntriesRepository } from "../repositories/journalEntriesRepository";
import type { SqlExecutor } from "../sqlExecutor";
import { createTestExecutor } from "./testExecutor";

let executor: SqlExecutor;
let journalEntries: ReturnType<typeof createJournalEntriesRepository>;

beforeEach(async () => {
  executor = createTestExecutor();
  await applyMigrations(executor);
  journalEntries = createJournalEntriesRepository(executor);
});

describe("journalEntriesRepository", () => {
  it("getOrCreateOpenDraft creates a fresh blank draft when none exists", async () => {
    const draft = await journalEntries.getOrCreateOpenDraft();
    expect(draft.status).toBe("draft");
    expect(draft.content_json).toBe(JSON.stringify({ type: "doc", content: [] }));
    expect(draft.committed_at).toBeNull();
  });

  it("getOrCreateOpenDraft returns the same row on a second call, not a new one", async () => {
    const first = await journalEntries.getOrCreateOpenDraft();
    const second = await journalEntries.getOrCreateOpenDraft();
    expect(second.id).toBe(first.id);
  });

  it("autosave persists content into the open draft without changing its status", async () => {
    const draft = await journalEntries.getOrCreateOpenDraft();
    const doc = JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "hi" }] }] });

    await journalEntries.autosave(draft.id, doc);

    const reloaded = await journalEntries.getOrCreateOpenDraft();
    expect(reloaded.id).toBe(draft.id);
    expect(reloaded.content_json).toBe(doc);
    expect(reloaded.status).toBe("draft");
  });

  it("commitEntry archives the draft, and getOrCreateOpenDraft then seeds a fresh one", async () => {
    const draft = await journalEntries.getOrCreateOpenDraft();
    await journalEntries.autosave(draft.id, JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] }));

    await journalEntries.commitEntry(draft.id);

    const fresh = await journalEntries.getOrCreateOpenDraft();
    expect(fresh.id).not.toBe(draft.id);
    expect(fresh.content_json).toBe(JSON.stringify({ type: "doc", content: [] }));

    const committed = await journalEntries.listCommitted(10);
    expect(committed).toHaveLength(1);
    expect(committed[0].id).toBe(draft.id);
    expect(committed[0].status).toBe("committed");
    expect(committed[0].committed_at).not.toBeNull();
  });

  it("listCommitted returns newest-committed-first, capped at the limit", async () => {
    const first = await journalEntries.getOrCreateOpenDraft();
    await journalEntries.commitEntry(first.id);
    const second = await journalEntries.getOrCreateOpenDraft();
    await journalEntries.commitEntry(second.id);

    const committed = await journalEntries.listCommitted(1);
    expect(committed).toHaveLength(1);
    expect(committed[0].id).toBe(second.id);
  });
});
