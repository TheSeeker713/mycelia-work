import type { ReactNode } from "react";

/**
 * Pocket and fullscreen chrome, unified into one component with the
 * *same wrapper depth* in both modes — previously `PocketShell` and
 * `FullscreenShell` were two separate components with different numbers
 * of wrapping elements, which meant every `Dashboard` return statement
 * that picked between them (`if (controls.fullscreen) return <FullscreenShell>...`
 * vs a separate pocket `return <PocketShell>...`) put a *different
 * element type* at the root of the returned tree. React's reconciler
 * tears down and rebuilds the entire subtree whenever the root element
 * type changes between renders — so every compartment's local state
 * (a project's in-progress "+ New project" form, a todo's open
 * reminder picker, anything not already lifted into a store) was
 * silently destroyed on every pocket↔fullscreen toggle. One component,
 * always the same two-`div` shape, varying only classes/style by
 * `mode` — fixes the whole class of bug at once instead of patching
 * one compartment's state into a store.
 *
 * `width` only applies in pocket mode — grows beyond 340 when multiple
 * tasks are clocked in at once (see `useMultiCardWidth`, which keeps
 * the outer Tauri window's margin in sync with whatever width is
 * passed here). The 70px window margin around the pocket card exists
 * for the shadow's blur to fade into without hard-clipping at the
 * window edge — see `useWindowControls.ts`'s `POCKET_SIZE`.
 */
export function Shell({
  mode,
  width = 340,
  children,
}: {
  mode: "pocket" | "fullscreen";
  width?: number;
  children: ReactNode;
}) {
  return (
    <div
      className={
        mode === "pocket"
          ? "flex h-screen w-screen items-center justify-center"
          : "flex h-screen w-screen"
      }
    >
      <div
        className={
          mode === "pocket"
            ? "flex h-[480px] flex-col overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--paper-card)] text-[var(--ink)]"
            : "flex h-screen w-screen flex-col bg-[var(--paper-card)] text-[var(--ink)]"
        }
        style={
          mode === "pocket"
            ? {
                width: `${width}px`,
                boxShadow:
                  "0 1px 2px rgba(0,0,0,0.14), 0 6px 12px -2px rgba(0,0,0,0.16), 0 24px 44px -12px rgba(0,0,0,0.30)",
              }
            : undefined
        }
      >
        {children}
      </div>
    </div>
  );
}
