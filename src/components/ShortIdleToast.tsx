import { useEffect } from "react";

/** Non-blocking, auto-dismisses after 30s if ignored — defaults to "keep as work" either way. */
export function ShortIdleToast({
  idleSeconds,
  onKeepAsWork,
  onLogAsBreak,
}: {
  idleSeconds: number;
  onKeepAsWork: () => void;
  onLogAsBreak: () => void;
}) {
  useEffect(() => {
    const id = setTimeout(onKeepAsWork, 30_000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const minutes = Math.max(1, Math.round(idleSeconds / 60));

  return (
    <div
      role="status"
      className="absolute right-9 bottom-3 left-3 rounded-[10px] border p-3 text-[0.8rem] shadow-[0_10px_20px_-10px_rgba(0,0,0,0.4)]"
      style={{ background: "var(--paper-card)", borderColor: "var(--amber)", color: "var(--ink)" }}
    >
      <div className="mb-2">
        You've been away ~{minutes} min. Keep as work, or log as a break?
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onKeepAsWork}
          className="flex-1 rounded-lg border border-[var(--line)] px-3 py-1.5 text-[0.76rem] text-[var(--ink-soft)]"
        >
          Keep as work
        </button>
        <button
          type="button"
          onClick={onLogAsBreak}
          className="flex-1 rounded-lg px-3 py-1.5 text-[0.76rem] text-white"
          style={{ background: "var(--amber)" }}
        >
          Log as break
        </button>
      </div>
    </div>
  );
}
