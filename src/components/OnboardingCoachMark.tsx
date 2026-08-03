import { useState } from "react";

const TIPS = [
  "⤢ opens a full-screen view with a real menu bar. ⏻ is your emergency exit (also Ctrl+Shift+Q) — both live in the bar above.",
  "Pull a tab on the right for Tasks, Notes, Todos, Projects, or your Library.",
];

/**
 * A single-slot sequential coach mark rather than several floating
 * cards — matches the approved design's finding that a small pocket
 * view only has room for one tip at a time without covering a real
 * control. Doesn't persist across restarts yet (no settings store),
 * so it reappears each launch until Phase 6+ adds one.
 */
export function OnboardingCoachMark({ onDismiss }: { onDismiss: () => void }) {
  const [step, setStep] = useState(0);

  function next() {
    if (step < TIPS.length - 1) {
      setStep(step + 1);
    } else {
      onDismiss();
    }
  }

  return (
    <div
      className="absolute right-9 bottom-3 left-3 rounded-[10px] border p-2.5 text-[0.76rem] leading-snug shadow-[0_10px_20px_-10px_rgba(0,0,0,0.4)]"
      style={{ background: "var(--paper-card)", borderColor: "var(--moss)", color: "var(--ink)" }}
    >
      <button
        type="button"
        title="Skip all"
        onClick={onDismiss}
        className="float-right -mt-0.5 -mr-0.5 ml-2 text-[0.85rem] leading-none"
        style={{ color: "var(--ink-faint)" }}
      >
        ✕
      </button>
      <div>{TIPS[step]}</div>
      <div className="mt-2 flex items-center justify-between">
        <span style={{ color: "var(--ink-faint)" }}>
          {step + 1} / {TIPS.length}
        </span>
        <button
          type="button"
          onClick={next}
          className="text-[0.74rem] font-semibold"
          style={{ color: "var(--moss-deep)" }}
        >
          {step === TIPS.length - 1 ? "Done" : "Next →"}
        </button>
      </div>
    </div>
  );
}
