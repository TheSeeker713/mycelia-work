import { useState } from "react";

const DIALOG_CLASSES = "absolute inset-3 flex flex-col justify-center rounded-[14px] border p-4";
const DIALOG_STYLE = { background: "var(--paper-card)", borderColor: "var(--line)" };

/**
 * Replaces the old silent, automatic journal generation on clock-out —
 * a real choice instead, per Jeremy's request: let AI write it (with an
 * optional few-word steer that gets folded into the prompt), write it
 * yourself, or skip it for now. `grok4Enabled` gates the "local AI may
 * take a moment" warning — the cloud path doesn't have a cold-load to
 * worry about.
 */
export function ClockOutReportDialog({
  taskTitle,
  grok4Enabled,
  onAiWrite,
  onManualWrite,
  onSkip,
}: {
  taskTitle: string;
  grok4Enabled: boolean;
  onAiWrite: (brief: string) => void;
  onManualWrite: () => void;
  onSkip: () => void;
}) {
  const [brief, setBrief] = useState("");

  return (
    <div role="dialog" aria-label="Clocked out" className={DIALOG_CLASSES} style={DIALOG_STYLE}>
      <div className="mb-3 text-[0.72rem] tracking-wide text-[var(--ink-faint)] uppercase">
        Clocked out of {taskTitle}
      </div>
      <div className="mb-3 text-[0.85rem] text-[var(--ink)]">Want a report for this session?</div>

      <label className="mb-1 block text-[0.72rem] text-[var(--ink-faint)]" htmlFor="clock-out-brief">
        In a few words, what did you do? (optional — AI takes care of the rest)
      </label>
      <textarea
        id="clock-out-brief"
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
        rows={2}
        className="mb-3 w-full resize-none rounded-lg border px-2 py-1.5 text-[0.8rem] text-[var(--ink)]"
        style={{ borderColor: "var(--line)", background: "var(--paper)" }}
      />

      {!grok4Enabled && (
        <p className="mb-3 text-[0.7rem] text-[var(--ink-faint)]">
          Local AI may take a few seconds to spin up.
        </p>
      )}

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => onAiWrite(brief)}
          className="rounded-lg bg-[var(--moss)] px-3 py-1.5 text-[0.8rem] text-white"
        >
          AI writes it
        </button>
        <button
          type="button"
          onClick={onManualWrite}
          className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-[0.8rem] text-[var(--ink)]"
        >
          I'll write it
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="self-start text-[0.75rem] text-[var(--ink-faint)]"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
