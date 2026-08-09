// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { initDatabase, type Repositories } from "../../data";
import { createTestExecutor } from "../../data/__tests__/testExecutor";
import { createJournalEntriesStore, type JournalEntriesStore } from "../journalEntriesStore";

let repos: Repositories;
let useJournalEntries: JournalEntriesStore;

beforeEach(async () => {
  repos = await initDatabase(createTestExecutor());
  useJournalEntries = createJournalEntriesStore(repos);
});

describe("journalEntriesStore", () => {
  it("loadDraft fetches (or creates) the one open draft", async () => {
    await useJournalEntries.getState().loadDraft();
    expect(useJournalEntries.getState().draft?.status).toBe("draft");
  });

  it("autosave persists content and updates local state without a re-fetch", async () => {
    await useJournalEntries.getState().loadDraft();
    const doc = JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] });

    await useJournalEntries.getState().autosave(doc);

    expect(useJournalEntries.getState().draft?.content_json).toBe(doc);
    const fromDb = await repos.journalEntries.getOrCreateOpenDraft();
    expect(fromDb.content_json).toBe(doc);
  });

  it("autosave is a no-op when no draft has been loaded yet", async () => {
    await useJournalEntries.getState().autosave("irrelevant");
    expect(useJournalEntries.getState().draft).toBeNull();
  });

  it("commit archives the draft and immediately loads a fresh blank one", async () => {
    await useJournalEntries.getState().loadDraft();
    const originalId = useJournalEntries.getState().draft?.id;

    await useJournalEntries.getState().commit();

    expect(useJournalEntries.getState().draft?.id).not.toBe(originalId);
    expect(useJournalEntries.getState().draft?.status).toBe("draft");
    const committed = await repos.journalEntries.listCommitted(10);
    expect(committed.map((c) => c.id)).toContain(originalId);
  });
});
