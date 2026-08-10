import { create } from "zustand";
import type { DiaryEntry, Repositories } from "../data";
import { countManualWords } from "../services/gamification";
import type { GamificationStore } from "./gamificationStore";

export interface JournalEntriesState {
  draft: DiaryEntry | null;
  /** Fetches the one open draft, creating a blank one if none exists yet — safe to call every time the Journal opens. */
  loadDraft: () => Promise<void>;
  /** Debounced persistence from the editor — a no-op if there's no draft loaded yet. */
  autosave: (contentJson: string) => Promise<void>;
  /**
   * The Save button: archives the current draft, then immediately seeds
   * and loads the next blank one. `plainText` and `aiAcceptedText` are
   * what the XP award is computed from — only manually-typed words
   * count, so anything accepted from Muse is passed in separately and
   * subtracted rather than being diffed out of the finished document
   * after the fact.
   */
  commit: (plainText?: string, aiAcceptedText?: string) => Promise<void>;
}

export function createJournalEntriesStore(repos: Repositories, gamification?: GamificationStore) {
  return create<JournalEntriesState>((set, get) => ({
    draft: null,

    async loadDraft() {
      const draft = await repos.journalEntries.getOrCreateOpenDraft();
      set({ draft });
    },

    async autosave(contentJson) {
      const { draft } = get();
      if (!draft) return;
      await repos.journalEntries.autosave(draft.id, contentJson);
      set({ draft: { ...draft, content_json: contentJson } });
    },

    async commit(plainText = "", aiAcceptedText = "") {
      const { draft } = get();
      if (!draft) return;
      await repos.journalEntries.commitEntry(draft.id);
      // An empty entry earns nothing — saving a blank page shouldn't
      // pay out the "started an entry" bonus over and over.
      const manualWords = countManualWords(plainText, aiAcceptedText);
      if (plainText.trim()) {
        await gamification?.getState().recordJournalEntry(manualWords);
      }
      const fresh = await repos.journalEntries.getOrCreateOpenDraft();
      set({ draft: fresh });
    },
  }));
}

export type JournalEntriesStore = ReturnType<typeof createJournalEntriesStore>;
