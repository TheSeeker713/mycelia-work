import "@testing-library/jest-dom/vitest";

// jsdom has no layout engine, so it doesn't implement elementFromPoint —
// ProseMirror's view (the Journal's rich-text editor, Phase 16.5) calls
// it on mousedown to resolve a document position from click coordinates.
// Returning null is enough to stop the uncaught TypeError; ProseMirror
// falls back gracefully when it can't resolve a position from coordinates.
if (typeof document !== "undefined" && !document.elementFromPoint) {
  document.elementFromPoint = () => null;
}
