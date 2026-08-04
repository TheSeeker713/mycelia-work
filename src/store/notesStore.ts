import { create } from "zustand";
import type { Note, Repositories } from "../data";

export interface NotesState {
  notesBySession: Record<string, Note[]>;
  loadNotesForSession: (sessionId: string) => Promise<void>;
  addNote: (sessionId: string, body: string) => Promise<void>;
}

export function createNotesStore(repos: Repositories) {
  return create<NotesState>((set, get) => ({
    notesBySession: {},

    async loadNotesForSession(sessionId) {
      const notes = await repos.notes.listBySession(sessionId);
      set({ notesBySession: { ...get().notesBySession, [sessionId]: notes } });
    },

    async addNote(sessionId, body) {
      await repos.notes.create(sessionId, body);
      await get().loadNotesForSession(sessionId);
    },
  }));
}

export type NotesStore = ReturnType<typeof createNotesStore>;
