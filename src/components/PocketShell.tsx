import type { ReactNode } from "react";

/** The "tiny pocket book" shell — 340×480, matching the approved Phase 1 mockup exactly. */
export function PocketShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--paper-deep)] p-6">
      <div className="flex h-[480px] w-[340px] flex-col rounded-[22px] border border-[var(--line)] bg-[var(--paper-card)] p-5 text-[var(--ink)] shadow-[0_20px_50px_-24px_rgba(0,0,0,0.4)]">
        {children}
      </div>
    </div>
  );
}
