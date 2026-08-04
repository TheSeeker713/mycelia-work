import { create } from "zustand";
import type { Note, Repositories } from "../data";

export interface NotesState {
  notesBySession: Record<string, Note[]>;
  /** The in-progress, not-yet-added note draft — lifted here (not local component state) so the compact Notes panel and the zen-mode full-screen editor read/write the exact same text. */
  draft: string;
  loadNotesForSession: (sessionId: string) => Promise<void>;
  addNote: (sessionId: string, body: string) => Promise<void>;
  setDraft: (text: string) => void;
}

export function createNotesStore(repos: Repositories) {
  return create<NotesState>((set, get) => ({
    notesBySession: {},
    draft: "",

    async loadNotesForSession(sessionId) {
      const notes = await repos.notes.listBySession(sessionId);
      set({ notesBySession: { ...get().notesBySession, [sessionId]: notes } });
    },

    async addNote(sessionId, body) {
      await repos.notes.create(sessionId, body);
      await get().loadNotesForSession(sessionId);
    },

    setDraft(text) {
      set({ draft: text });
    },
  }));
}

export type NotesStore = ReturnType<typeof createNotesStore>;
