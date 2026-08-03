import type { ReactNode } from "react";

/**
 * The "tiny pocket book" shell — 340×480, matching the approved Phase 1
 * mockup exactly. The window itself is transparent and sized 480×620
 * (tauri.conf.json), 70px of invisible margin on every side.
 *
 * That margin isn't arbitrary — it has to be at least as large as the
 * shadow's own blur radius, or the window edge hard-clips the shadow's
 * soft falloff before it finishes fading, which reads as a "blocky"
 * cutoff rather than a natural shadow (this happened for real: the
 * original 20px margin was smaller than the shadow needed, clipping it
 * on every side, worst at the bottom). The layered shadow below has a
 * worst-case reach of ~56-60px (offset + blur on its largest layer);
 * 70px keeps real headroom.
 *
 * This wrapper must also stay background-free, or it repaints the
 * "invisible" margin as a solid rectangle and defeats the whole point
 * of the transparent window.
 */
export function PocketShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen w-screen items-center justify-center">
      <div
        className="flex h-[480px] w-[340px] flex-col overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--paper-card)] text-[var(--ink)]"
        style={{
          boxShadow:
            "0 1px 2px rgba(0,0,0,0.14), 0 6px 12px -2px rgba(0,0,0,0.16), 0 24px 44px -12px rgba(0,0,0,0.30)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
