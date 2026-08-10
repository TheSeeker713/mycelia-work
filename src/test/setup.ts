import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { __resetAiQueueForTests } from "../services/aiQueue";

// The AI queue is a module-level singleton (deliberately — it's an
// app-wide lock), so without this a test that leaves a call in flight
// blocks every later test's AI work behind it, in this file and every
// other one.
afterEach(() => {
  __resetAiQueueForTests();
});

// jsdom has no layout engine, so it doesn't implement elementFromPoint —
// ProseMirror's view (the Journal's rich-text editor, Phase 16.5) calls
// it on mousedown to resolve a document position from click coordinates.
// Returning null is enough to stop the uncaught TypeError; ProseMirror
// falls back gracefully when it can't resolve a position from coordinates.
if (typeof document !== "undefined" && !document.elementFromPoint) {
  document.elementFromPoint = () => null;
}

// Same root cause, different call: ProseMirror measures the caret via
// getClientRects() whenever the document actually changes, and jsdom
// gives Text nodes no such method at all (Element gets a stub, Text
// doesn't). An empty list reads as "no measurable geometry," which
// ProseMirror already handles — it just skips scroll-into-view.
const emptyRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;

// `Text` genuinely has no geometry methods in the DOM typings (only
// Element and Range do), so these are cast-through assignments by
// necessity, not laziness — ProseMirror calls them on Text nodes anyway.
type Measurable = { getClientRects?: () => DOMRectList; getBoundingClientRect?: () => DOMRect };

// Guarded: plenty of suites here run under `@vitest-environment node`,
// where none of these DOM globals exist at all.
if (typeof Text !== "undefined") {
  const textProto = Text.prototype as unknown as Measurable;
  if (!textProto.getClientRects) {
    textProto.getClientRects = emptyRects;
    textProto.getBoundingClientRect = () => new DOMRect();
  }
}

if (typeof Range !== "undefined") {
  const rangeProto = Range.prototype as unknown as Measurable;
  if (!rangeProto.getClientRects) {
    rangeProto.getClientRects = emptyRects;
    rangeProto.getBoundingClientRect = () => new DOMRect();
  }
}
