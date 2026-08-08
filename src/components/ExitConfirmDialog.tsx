import { useEffect, useState } from "react";
import { useAiInFlight } from "../hooks/useAiInFlight";
import { useSelfVoicing } from "../hooks/useSelfVoicing";
import type { WindowControls } from "../hooks/useWindowControls";

type Phase = "confirm" | "waiting" | "closing";

const DIALOG_CLASSES = "absolute inset-3 flex flex-col justify-center rounded-[14px] border p-4";
const DIALOG_STYLE = { background: "var(--paper-card)", borderColor: "var(--line)" };

/**
 * Exit stops being instant, per the confirmed rule: a real "are you
 * sure," aware of anything AI is still writing (a journal, a project
 * report, a capture-agent classification), with a real choice instead
 * of losing work silently. "Exit now" kills the in-flight call and
 * discards the draft rather than leaving an abandoned pending row.
 * Either exit path holds on the goodbye voice cue before the window
 * actually closes.
 */
export function ExitConfirmDialog({
  controls,
  onCancel,
}: {
  controls: WindowControls;
  onCancel: () => void;
}) {
  const aiInFlight = useAiInFlight();
  const selfVoicing = useSelfVoicing();
  const [phase, setPhase] = useState<Phase>("confirm");

  async function playGoodbyeAndClose() {
    await selfVoicing.speakAndWait("Goodbye.");
    await controls.emergencyExit();
  }

  // Reacts to the AI in-flight state clearing on its own while waiting —
  // a real external event, not something derivable from render, so this
  // stays in an effect rather than an event handler.
  useEffect(() => {
    if (phase === "waiting" && !aiInFlight.active) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to an external store clearing, not derivable from render
      setPhase("closing");
    }
  }, [phase, aiInFlight.active]);

  useEffect(() => {
    if (phase === "closing") {
      void playGoodbyeAndClose();
    }
  }, [phase]);

  async function handleExitNow() {
    if (aiInFlight.active) await aiInFlight.discard();
    setPhase("closing");
  }

  function handleHideToTray() {
    controls.minimizeToTray();
    onCancel();
  }

  if (phase === "waiting") {
    return (
      <div role="dialog" aria-label="Waiting to exit" className={DIALOG_CLASSES} style={DIALOG_STYLE}>
        <div className="mb-3 text-[0.72rem] tracking-wide text-[var(--ink-faint)] uppercase">Exiting</div>
        <div className="text-[0.85rem] text-[var(--ink)]">
          Waiting for {(aiInFlight.description ?? "the AI").toLowerCase()} to finish…
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="mt-4 self-start text-[0.75rem] text-[var(--ink-faint)]"
        >
          Cancel
        </button>
      </div>
    );
  }

  if (phase === "closing") {
    return (
      <div role="dialog" aria-label="Exiting" className={DIALOG_CLASSES} style={DIALOG_STYLE}>
        <div className="text-[0.85rem] text-[var(--ink)]">Goodbye…</div>
      </div>
    );
  }

  return (
    <div role="dialog" aria-label="Confirm exit" className={DIALOG_CLASSES} style={DIALOG_STYLE}>
      <div className="mb-3 text-[0.72rem] tracking-wide text-[var(--ink-faint)] uppercase">
        Exit Mycelia Time
      </div>
      <div className="mb-4 text-[0.85rem] leading-relaxed text-[var(--ink)]">
        {aiInFlight.active
          ? `${aiInFlight.description} — wait for it to finish, or exit now?`
          : "Are you sure you want to exit?"}
      </div>
      <div className="flex flex-col gap-2">
        {aiInFlight.active && (
          <button
            type="button"
            onClick={() => setPhase("waiting")}
            className="rounded-lg bg-[var(--moss)] px-3 py-1.5 text-[0.8rem] text-white"
          >
            Wait, then exit
          </button>
        )}
        <button
          type="button"
          onClick={() => void handleExitNow()}
          className="rounded-lg border px-3 py-1.5 text-[0.8rem]"
          style={
            aiInFlight.active
              ? { borderColor: "var(--rust)", color: "var(--rust)" }
              : { borderColor: "var(--line)", color: "var(--ink)" }
          }
        >
          {aiInFlight.active ? "Exit now anyway" : "Exit"}
        </button>
        <button
          type="button"
          onClick={handleHideToTray}
          className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-[0.8rem] text-[var(--ink)]"
        >
          Close to tray instead
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="self-start text-[0.75rem] text-[var(--ink-faint)]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
