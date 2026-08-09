import type { SqlExecutor } from "../sqlExecutor";
import type { DiaryEntry } from "../types";
import { newId, nowIso } from "../sqliteUtil";

const EMPTY_DOC_JSON = JSON.stringify({ type: "doc", content: [] });

/**
 * The standalone free-write Journal's data access — deliberately a
 * separate file from `journalsRepository.ts`, which backs the
 * unrelated AI-generated Reports feature, to keep the naming collision
 * ("journal" meaning two different things in this app) from spreading
 * into code.
 */
export function createJournalEntriesRepository(executor: SqlExecutor) {
  return {
    /**
     * The one always-current draft — fetches the existing open row, or
     * creates a fresh blank one. The `idx_journal_entries_single_draft`
     * partial unique index (schema.ts) enforces at the DB level that
     * only one `draft` row can ever exist, so this is safe to call
     * every time the Journal is opened without risking duplicates.
     */
    async getOrCreateOpenDraft(): Promise<DiaryEntry> {
      const existing = await executor.select<DiaryEntry>(
        "SELECT * FROM journal_entries WHERE status = 'draft' LIMIT 1",
      );
      if (existing[0]) return existing[0];

      const now = nowIso();
      const entry: DiaryEntry = {
        id: newId(),
        status: "draft",
        content_json: EMPTY_DOC_JSON,
        started_at: now,
        updated_at: now,
        committed_at: null,
      };
      await executor.execute(
        `INSERT INTO journal_entries (id, status, content_json, started_at, updated_at, committed_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [entry.id, entry.status, entry.content_json, entry.started_at, entry.updated_at, entry.committed_at],
      );
      return entry;
    },

    /** Debounced persistence of whatever's currently in the editor — never touches a committed entry. */
    async autosave(id: string, contentJson: string): Promise<void> {
      await executor.execute(
        "UPDATE journal_entries SET content_json = ?, updated_at = ? WHERE id = ? AND status = 'draft'",
        [contentJson, nowIso(), id],
      );
    },

    /** The Save button: archives the current draft as a finished entry. The store immediately seeds the next blank draft via getOrCreateOpenDraft. */
    async commitEntry(id: string): Promise<void> {
      const now = nowIso();
      await executor.execute(
        "UPDATE journal_entries SET status = 'committed', committed_at = ?, updated_at = ? WHERE id = ?",
        [now, now, id],
      );
    },

    async listCommitted(limit: number): Promise<DiaryEntry[]> {
      // `rowid DESC` as a tiebreaker — two entries committed within the
      // same millisecond would otherwise sort ambiguously, same pattern
      // used by journalsRepository.listRecent.
      return executor.select<DiaryEntry>(
        "SELECT * FROM journal_entries WHERE status = 'committed' ORDER BY committed_at DESC, rowid DESC LIMIT ?",
        [limit],
      );
    },
  };
}

export type JournalEntriesRepository = ReturnType<typeof createJournalEntriesRepository>;
