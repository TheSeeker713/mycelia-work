import { useState } from "react";
import { useRepositories } from "../store/StoreProvider";

/**
 * Everything in the database as one JSON file. Not a substitute for
 * copying the sqlite file itself, which is still the real backup — this
 * is the version that stays readable in ten years without needing this
 * app, or a sqlite client, to open it.
 *
 * Deliberately a plain download rather than writing to a fixed path:
 * the file dialog is where a person decides what to keep and where,
 * and this shouldn't be silently dropping files somewhere on its own.
 */
export function BackupButton() {
  const repos = useRepositories();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleBackup() {
    setBusy(true);
    setMessage(null);
    try {
      const [tasks, projects, todos, journals, journalEntries, milestones, settings] =
        await Promise.all([
          repos.tasks.list(),
          repos.projects.list(),
          repos.todos.list(),
          repos.journals.listRecent(10_000),
          repos.journalEntries.listCommitted(10_000),
          repos.gamification.listUnlockedAchievements(),
          repos.settings.getAll(),
        ]);

      const backup = {
        exportedAt: new Date().toISOString(),
        // Bumped whenever the shape changes, so a future reader can
        // tell what it's looking at rather than guessing from keys.
        formatVersion: 1,
        tasks,
        projects,
        todos,
        reports: journals,
        journalEntries,
        achievements: milestones,
        settings,
      };

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `mycelia-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(link.href);
      setMessage("Backup saved.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Backup failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void handleBackup()}
        disabled={busy}
        className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[0.7rem] text-[var(--ink-soft)] disabled:opacity-50"
      >
        {busy ? "Backing up…" : "Back up everything"}
      </button>
      {message && <p className="mt-1 text-[0.7rem] text-[var(--ink-faint)]">{message}</p>}
    </div>
  );
}
