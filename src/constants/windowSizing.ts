/**
 * The pocket card's real, usable content height and the Tauri window
 * dimensions that contain it — defined once and imported everywhere,
 * since three independent copies of these same numbers (Shell.tsx,
 * useWindowControls.ts, useMultiCardWidth.ts) is exactly what let the
 * window silently snap back to the old height whenever active-session
 * count changed, before this file existed.
 *
 * Grown from 480 to 540 (2026-08-08, Jeremy's ask — "a little taller")
 * to give the Tasks-compartment whole-card scroll redesign real headroom
 * before scrolling kicks in, without the card starting to feel like a
 * dashboard instead of a "tiny pocket book" (CLAUDE.md).
 */
export const POCKET_CONTENT_HEIGHT = 540;

/**
 * 70px of transparent margin per side around the visible card, for the
 * card's drop shadow to fade into without hard-clipping at the window
 * edge (the original 20px margin was smaller than the shadow needed —
 * see Shell.tsx's shadow definition for the actual blur reach this
 * covers).
 */
export const WINDOW_MARGIN = 140;

/** The real Tauri window height — must match tauri.conf.json's `windows[0].height` exactly (JSON can't import this constant, so that value is hand-kept in sync; a mismatch there would show up immediately as clipped or oversized content on launch). */
export const POCKET_WINDOW_HEIGHT = POCKET_CONTENT_HEIGHT + WINDOW_MARGIN;
