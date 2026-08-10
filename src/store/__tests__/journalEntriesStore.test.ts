// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { initDatabase, type Repositories } from "../../data";
import { createTestExecutor } from "../../data/__tests__/testExecutor";
import { createJournalEntriesStore, type JournalEntriesStore } from "../journalEntriesStore";
import { createGamificationStore } from "../gamificationStore";
import { FIRST_JOURNAL_ENTRY_KEY, XP } from "../../services/gamification";

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

describe("journalEntriesStore — gamification", () => {
  it("awards XP on commit, counting only manually-typed words", async () => {
    const gamification = createGamificationStore(repos);
    await gamification.getState().load();
    const store = createJournalEntriesStore(repos, gamification);
    await store.getState().loadDraft();

    // 100 words total, 50 of them accepted from Muse -> 50 manual.
    const typed = Array(50).fill("word").join(" ");
    const fromMuse = Array(50).fill("muse").join(" ");
    await store.getState().commit(`${typed} ${fromMuse}`, fromMuse);

    const events = gamification.getState().recentXpEvents.filter((e) => e.source === "journal_entry");
    expect(events).toHaveLength(1);
    expect(events[0].amount).toBe(
      XP.JOURNAL_ENTRY_STARTED + XP.JOURNAL_PER_WORD_BLOCK, // exactly one 50-word block
    );
  });

  it("does not pay out for saving an empty page", async () => {
    const gamification = createGamificationStore(repos);
    await gamification.getState().load();
    const store = createJournalEntriesStore(repos, gamification);
    await store.getState().loadDraft();

    await store.getState().commit("   ", "");

    expect(
      gamification.getState().recentXpEvents.some((e) => e.source === "journal_entry"),
    ).toBe(false);
  });

  it("unlocks the reserved first-journal-entry sticker, once", async () => {
    const gamification = createGamificationStore(repos);
    await gamification.getState().load();
    const store = createJournalEntriesStore(repos, gamification);

    await store.getState().loadDraft();
    await store.getState().commit("a real first entry", "");
    await store.getState().loadDraft();
    await store.getState().commit("a second entry", "");

    const unlocked = await repos.gamification.listUnlockedAchievements();
    expect(unlocked.filter((u) => u.achievement_key === FIRST_JOURNAL_ENTRY_KEY)).toHaveLength(1);
  });

  it("an entry written entirely by Muse earns the start bonus but no word XP", async () => {
    const gamification = createGamificationStore(repos);
    await gamification.getState().load();
    const store = createJournalEntriesStore(repos, gamification);
    await store.getState().loadDraft();

    const allMuse = Array(200).fill("muse").join(" ");
    await store.getState().commit(allMuse, allMuse);

    const events = gamification.getState().recentXpEvents.filter((e) => e.source === "journal_entry");
    expect(events[0].amount).toBe(XP.JOURNAL_ENTRY_STARTED);
  });
});
