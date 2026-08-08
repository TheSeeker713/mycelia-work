// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { initDatabase, type Repositories } from "../../data";
import { createTestExecutor } from "../../data/__tests__/testExecutor";
import { createNotesStore, type NotesStore } from "../notesStore";
import { createGamificationStore } from "../gamificationStore";

let repos: Repositories;
let useNotesStore: NotesStore;
let gamification: ReturnType<typeof createGamificationStore>;
let sessionId: string;

beforeEach(async () => {
  repos = await initDatabase(createTestExecutor());
  gamification = createGamificationStore(repos);
  useNotesStore = createNotesStore(repos, gamification);
  const task = await repos.tasks.create({ title: "Sample task" });
  const session = await repos.taskSessions.clockIn(task.id);
  sessionId = session.id;
});

describe("notesStore", () => {
  it("starts with no notes loaded for a session", () => {
    expect(useNotesStore.getState().notesBySession[sessionId]).toBeUndefined();
  });

  it("addNote creates a note and refreshes that session's list", async () => {
    await useNotesStore.getState().addNote(sessionId, "First paragraph.");

    const notes = useNotesStore.getState().notesBySession[sessionId];
    expect(notes.map((n) => n.body)).toEqual(["First paragraph."]);
  });

  it("addNote awards gamification XP", async () => {
    await gamification.getState().load();
    await useNotesStore.getState().addNote(sessionId, "First paragraph.");

    expect(gamification.getState().recentXpEvents.some((e) => e.source === "note")).toBe(true);
  });

  it("appends notes in order, keyed by session", async () => {
    await useNotesStore.getState().addNote(sessionId, "First paragraph.");
    await useNotesStore.getState().addNote(sessionId, "Second paragraph.");

    const notes = useNotesStore.getState().notesBySession[sessionId];
    expect(notes.map((n) => n.body)).toEqual(["First paragraph.", "Second paragraph."]);
  });

  it("loadNotesForSession only touches that session's entry", async () => {
    const task2 = await repos.tasks.create({ title: "Other task" });
    const session2 = await repos.taskSessions.clockIn(task2.id);
    await useNotesStore.getState().addNote(sessionId, "For session one.");
    await useNotesStore.getState().addNote(session2.id, "For session two.");

    expect(useNotesStore.getState().notesBySession[sessionId].map((n) => n.body)).toEqual([
      "For session one.",
    ]);
    expect(useNotesStore.getState().notesBySession[session2.id].map((n) => n.body)).toEqual([
      "For session two.",
    ]);
  });
});
