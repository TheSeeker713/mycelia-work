import { useEffect, useState } from "react";
import {
  useCaptureLogClient,
  useCaptureStore,
  useCaptureStoreApi,
  useProjectsStore,
  useSettingsStore,
} from "../store/StoreProvider";
import { useSelfVoicing } from "../hooks/useSelfVoicing";
import { NO_SESSION_MESSAGE } from "../store/captureStore";
import { MicButton } from "./MicButton";

const CONFIRMED_AUTO_DISMISS_MS = 10_000;

const ACTION_LABEL: Record<"create_note" | "create_todo" | "create_milestone", string> = {
  create_note: "note",
  create_todo: "todo",
  create_milestone: "milestone",
};

/**
 * The universal capture agent's entry point — a bottom pull-drawer,
 * distinct from the right-edge CompartmentTabs, reachable regardless of
 * which compartment is open (docs/reference/capture-agent-guide.md).
 * Not rendered by Dashboard at all while the forgot-to-clock-out
 * CheckInFlow overlay is up — that flow already documented itself as
 * taking priority over everything else in the card.
 */
export function CaptureDrawer({ activeSessionId }: { activeSessionId: string | null }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [clarifyReply, setClarifyReply] = useState("");

  const phase = useCaptureStore((s) => s.phase);
  const clarifyQuestion = useCaptureStore((s) => s.clarifyQuestion);
  const pendingMilestone = useCaptureStore((s) => s.pendingMilestone);
  const declineMessage = useCaptureStore((s) => s.declineMessage);
  const confirmed = useCaptureStore((s) => s.confirmed);
  const submit = useCaptureStore((s) => s.submit);
  const respondToClarify = useCaptureStore((s) => s.respondToClarify);
  const pickProjectForMilestone = useCaptureStore((s) => s.pickProjectForMilestone);
  const correctTo = useCaptureStore((s) => s.correctTo);
  const dismiss = useCaptureStore((s) => s.dismiss);
  const captureStoreApi = useCaptureStoreApi();

  const projects = useProjectsStore((s) => s.projects);
  const loadProjects = useProjectsStore((s) => s.loadProjects);
  const captureLoggingEnabled = useSettingsStore((s) => s.captureLoggingEnabled);
  const captureLogClient = useCaptureLogClient();
  const selfVoicing = useSelfVoicing();

  useEffect(() => {
    if (open) loadProjects();
  }, [open, loadProjects]);

  // Auto-dismiss the confirmation the same way ShortIdleToast does — a
  // passive "here's what happened," not something that has to be
  // manually cleared every time.
  useEffect(() => {
    if (phase !== "confirmed") return;
    const id = setTimeout(() => {
      dismiss();
      setOpen(false);
    }, CONFIRMED_AUTO_DISMISS_MS);
    return () => clearTimeout(id);
  }, [phase, dismiss]);

  async function logAndNarrate(inputText: string) {
    const state = captureStoreApi.getState();
    const occurredAt = new Date().toISOString();

    if (state.phase === "confirmed" && state.confirmed) {
      selfVoicing.speak(`Filed as a ${ACTION_LABEL[state.confirmed.action]}.`);
      if (captureLoggingEnabled) {
        await captureLogClient.log({ occurredAt, inputText, action: state.confirmed.action });
      }
    } else if (state.phase === "declined") {
      if (state.declineMessage) selfVoicing.speak(state.declineMessage);
      if (captureLoggingEnabled) {
        await captureLogClient.log({
          occurredAt,
          inputText,
          action: "decline",
          declineReason: state.declineMessage ?? undefined,
        });
      }
    } else if (state.phase === "clarify") {
      if (state.clarifyQuestion) selfVoicing.speak(state.clarifyQuestion);
      if (captureLoggingEnabled) {
        await captureLogClient.log({
          occurredAt,
          inputText,
          action: "clarify",
          clarifyingQuestion: state.clarifyQuestion ?? undefined,
        });
      }
    } else if (state.phase === "blocked_no_session") {
      selfVoicing.speak(NO_SESSION_MESSAGE);
    }
  }

  async function handleSubmit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setText("");
    await submit(trimmed, activeSessionId);
    await logAndNarrate(trimmed);
  }

  async function handleClarifyReply() {
    const trimmed = clarifyReply.trim();
    if (!trimmed) return;
    setClarifyReply("");
    await respondToClarify(trimmed, activeSessionId);
    await logAndNarrate(trimmed);
  }

  async function handleCorrectTo(action: "create_note" | "create_todo" | "milestone") {
    await correctTo(action, activeSessionId);
    await logAndNarrate(confirmed?.rawText ?? "");
  }

  function handleClose() {
    dismiss();
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open capture"
        title="Capture a note, todo, or milestone"
        className="absolute bottom-0 left-1/2 z-10 -translate-x-1/2 rounded-t-[10px] border border-b-0 px-4 py-1 text-[0.72rem] tracking-wide text-[var(--ink-faint)] uppercase"
        style={{ background: "var(--paper-card)", borderColor: "var(--line)" }}
      >
        ⌃ Capture
      </button>
    );
  }

  return (
    <div
      className="absolute inset-x-3 bottom-1 z-20 rounded-[14px] border p-3"
      style={{ background: "var(--paper-card)", borderColor: "var(--line)" }}
    >
      {phase === "idle" || phase === "thinking" ? (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="A note, a todo, progress on a project..."
            disabled={phase === "thinking"}
            autoFocus
            className="flex-1 rounded-lg border border-[var(--line)] bg-[var(--paper)] px-2.5 py-2 text-[0.82rem] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
          />
          <MicButton onTranscribed={(t) => setText((prev) => (prev.trim() ? `${prev.trim()} ${t}` : t))} />
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={phase === "thinking" || !text.trim()}
            className="flex-shrink-0 rounded-lg bg-[var(--moss)] px-3 py-1.5 text-[0.78rem] text-white disabled:opacity-50"
          >
            {phase === "thinking" ? "…" : "Go"}
          </button>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close capture"
            className="flex-shrink-0 text-[0.75rem] text-[var(--ink-faint)]"
          >
            ✕
          </button>
        </div>
      ) : phase === "clarify" ? (
        <div className="flex flex-col gap-2">
          <p className="text-[0.82rem] text-[var(--ink)]">{clarifyQuestion}</p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={clarifyReply}
              onChange={(e) => setClarifyReply(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleClarifyReply()}
              autoFocus
              className="flex-1 rounded-lg border border-[var(--line)] bg-[var(--paper)] px-2.5 py-2 text-[0.82rem] text-[var(--ink)] outline-none"
            />
            <MicButton
              onTranscribed={(t) => setClarifyReply((prev) => (prev.trim() ? `${prev.trim()} ${t}` : t))}
            />
            <button
              type="button"
              onClick={() => void handleClarifyReply()}
              disabled={!clarifyReply.trim()}
              className="flex-shrink-0 rounded-lg bg-[var(--moss)] px-3 py-1.5 text-[0.78rem] text-white disabled:opacity-50"
            >
              Go
            </button>
          </div>
        </div>
      ) : phase === "project_pick" ? (
        <div className="flex flex-col gap-2">
          <p className="text-[0.82rem] text-[var(--ink)]">
            Which project is "{pendingMilestone?.milestoneName}" for?
          </p>
          <div className="flex flex-wrap gap-1.5">
            {projects.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => void pickProjectForMilestone(p.id).then(() => logAndNarrate(pendingMilestone?.milestoneName ?? ""))}
                className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[0.75rem] text-[var(--ink-soft)]"
              >
                {p.title}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="self-start text-[0.75rem] text-[var(--ink-faint)]"
          >
            Cancel
          </button>
        </div>
      ) : phase === "declined" ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-[0.82rem] text-[var(--ink)]">{declineMessage}</p>
          <button type="button" onClick={handleClose} className="text-[0.75rem] text-[var(--ink-faint)]">
            OK
          </button>
        </div>
      ) : phase === "blocked_no_session" ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-[0.82rem] text-[var(--ink)]">{NO_SESSION_MESSAGE}</p>
          <button type="button" onClick={handleClose} className="text-[0.75rem] text-[var(--ink-faint)]">
            OK
          </button>
        </div>
      ) : phase === "confirmed" && confirmed ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[0.82rem] text-[var(--ink)]">
              Filed as a {ACTION_LABEL[confirmed.action]}: "{confirmed.summary}"
            </p>
            <button type="button" onClick={handleClose} className="text-[0.75rem] text-[var(--ink-faint)]">
              OK
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[0.72rem] text-[var(--ink-faint)]">
            <span>Wrong?</span>
            {confirmed.action !== "create_note" && (
              <button
                type="button"
                onClick={() => void handleCorrectTo("create_note")}
                className="rounded-full border border-[var(--line)] px-2 py-0.5"
              >
                Make it a note
              </button>
            )}
            {confirmed.action !== "create_todo" && (
              <button
                type="button"
                onClick={() => void handleCorrectTo("create_todo")}
                className="rounded-full border border-[var(--line)] px-2 py-0.5"
              >
                Make it a todo
              </button>
            )}
            {confirmed.action !== "create_milestone" && (
              <button
                type="button"
                onClick={() => void handleCorrectTo("milestone")}
                className="rounded-full border border-[var(--line)] px-2 py-0.5"
              >
                Make it a milestone
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
