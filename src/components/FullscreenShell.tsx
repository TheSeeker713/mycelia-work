import type { ReactNode } from "react";

/** Full-screen mode's shell — fills the resized window edge to edge, no floating card, no rounded corners. */
export function FullscreenShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen w-screen flex-col bg-[var(--paper-card)] text-[var(--ink)]">
      {children}
    </div>
  );
}
