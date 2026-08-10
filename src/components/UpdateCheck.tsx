import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { checkForUpdate, installUpdate, type UpdateStatus } from "../services/updater";

/**
 * Manual update check, living in Settings rather than firing on launch.
 *
 * Deliberately not automatic. The app already opens with a startup
 * checklist, and adding a silent network call plus a possible "restart
 * now?" to that moment works against the point of a small tool that
 * gets out of the way. This is here for when there's a reason to look.
 */
export function UpdateCheck() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    void getVersion()
      .then(setCurrent)
      .catch(() => setCurrent(null));
  }, []);

  async function handleCheck() {
    setStatus({ kind: "checking" });
    setStatus(await checkForUpdate());
  }

  async function handleInstall() {
    if (status?.kind !== "available") return;
    setInstalling(true);
    try {
      await installUpdate(status.update, (done, total) => {
        setProgress(total ? Math.round((done / total) * 100) : null);
      });
    } catch (err) {
      setStatus({
        kind: "unreachable",
        reason: err instanceof Error ? err.message : "install failed",
      });
      setInstalling(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[0.82rem] text-[var(--ink)]">
          Version {current ?? "…"}
        </span>
        <button
          type="button"
          onClick={() => void handleCheck()}
          disabled={status?.kind === "checking" || installing}
          className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[0.7rem] text-[var(--ink-soft)] disabled:opacity-50"
        >
          {status?.kind === "checking" ? "Checking…" : "Check for updates"}
        </button>
      </div>

      {status?.kind === "up-to-date" && (
        <p className="mt-1 text-[0.72rem] text-[var(--ink-faint)]">This is the latest build.</p>
      )}

      {status?.kind === "unreachable" && (
        <p className="mt-1 text-[0.72rem] text-[var(--ink-faint)]">
          Couldn't reach the update feed. Nothing's wrong with this copy.
        </p>
      )}

      {status?.kind === "available" && (
        <div className="mt-1.5">
          <p className="text-[0.75rem] text-[var(--ink)]">
            Version {status.version} is available.
          </p>
          {status.notes && (
            <p className="mt-0.5 text-[0.72rem] whitespace-pre-line text-[var(--ink-faint)]">
              {status.notes}
            </p>
          )}
          <button
            type="button"
            onClick={() => void handleInstall()}
            disabled={installing}
            className="mt-1.5 rounded-full border border-[var(--line)] px-2.5 py-1 text-[0.7rem] text-[var(--ink-soft)] disabled:opacity-50"
          >
            {installing
              ? progress === null
                ? "Downloading…"
                : `Downloading ${progress}%`
              : "Install and restart"}
          </button>
        </div>
      )}
    </div>
  );
}
