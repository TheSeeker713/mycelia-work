import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { POCKET_WINDOW_HEIGHT, WINDOW_MARGIN } from "../constants/windowSizing";

const BASE_CARD_WIDTH = 340;
const SESSION_CARD_WIDTH = 280;
const SESSION_CARD_GAP = 12;
/** Matches Shell's pocket mode's content padding (p-5 left + pr-9 right for the tab stack). */
const CONTENT_PADDING = 56;

/**
 * Computes how wide the pocket card needs to be to fit `sessionCount`
 * side-by-side session cards, per the approved design: the card
 * *extends* to hold more panels rather than opening separate windows.
 * 0 or 1 active sessions fit in the standard 340px card; 2 or 3 grow it.
 */
export function computeCardWidth(sessionCount: number): number {
  if (sessionCount <= 1) return BASE_CARD_WIDTH;
  const neededContentWidth =
    sessionCount * SESSION_CARD_WIDTH + (sessionCount - 1) * SESSION_CARD_GAP;
  return Math.max(BASE_CARD_WIDTH, neededContentWidth + CONTENT_PADDING);
}

/** Resizes the real window to match, and returns the card width for Shell's pocket mode. Does nothing while full-screen — that mode manages its own size. */
export function useMultiCardWidth(sessionCount: number, fullscreen: boolean): number {
  const cardWidth = computeCardWidth(sessionCount);

  useEffect(() => {
    if (fullscreen) return;
    // getCurrentWindow() throws synchronously outside a real Tauri
    // webview (jsdom has no window.__TAURI_INTERNALS__) — a bare
    // .catch() on the chain never runs because the throw happens before
    // any promise exists. Needs a real try/catch around the call itself.
    try {
      getCurrentWindow()
        .setSize(new LogicalSize(cardWidth + WINDOW_MARGIN, POCKET_WINDOW_HEIGHT))
        .catch(() => {});
    } catch {
      // no Tauri bridge available; the view still uses cardWidth for layout
    }
  }, [cardWidth, fullscreen]);

  return cardWidth;
}
