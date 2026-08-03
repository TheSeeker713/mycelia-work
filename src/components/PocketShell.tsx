import type { ReactNode } from "react";

/**
 * The "tiny pocket book" shell — 340×480, matching the approved Phase 1
 * mockup exactly. The window itself is transparent and sized 380×520
 * (tauri.conf.json), 20px larger on every side than this card so the
 * CSS box-shadow has room to render — this wrapper must stay
 * background-free, or it repaints the "invisible" margin as a solid
 * rectangle and defeats the whole point of the transparent window.
 */
export function PocketShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen w-screen items-center justify-center">
      <div className="flex h-[480px] w-[340px] flex-col overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--paper-card)] text-[var(--ink)] shadow-[0_20px_50px_-24px_rgba(0,0,0,0.5)]">
        {children}
      </div>
    </div>
  );
}
