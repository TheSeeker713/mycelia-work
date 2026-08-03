import { useEffect, useState, type ReactNode } from "react";
import { initDatabase, type Repositories } from "../data";
import { createTauriSqlExecutor } from "../data/tauriSqlExecutor";
import { StoreProvider } from "../store/StoreProvider";

/** Opens the real SQLite database (via tauri-plugin-sql) once and hands repositories down through StoreProvider. */
export function DbProvider({ children }: { children: ReactNode }) {
  const [repositories, setRepositories] = useState<Repositories | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    initDatabase(createTauriSqlExecutor())
      .then((repos) => {
        if (!cancelled) setRepositories(repos);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--paper-deep)] p-6 text-[var(--rust)]">
        Couldn't open the database: {error}
      </div>
    );
  }

  if (!repositories) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--paper-deep)] text-[var(--ink-faint)]">
        Loading…
      </div>
    );
  }

  return <StoreProvider repositories={repositories}>{children}</StoreProvider>;
}
