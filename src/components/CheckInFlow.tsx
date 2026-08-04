import { useEffect, useRef, useState } from "react";
import type { ActiveSession } from "../store/sessionsStore";
import type { OpenClawClient } from "../services/openclawClient";
import {
  MAX_CHECKIN_TURNS,
  continueCheckinConversation,
  startCheckinConversation,
  type CheckinTurn,
} from "../services/checkinConversation";
import { CheckInDialog } from "./CheckInDialog";
import { MicButton } from "./MicButton";
import { useSelfVoicing } from "../hooks/useSelfVoicing";
import { useVoiceCues } from "../hooks/useVoiceCues";

type FlowState =
  | { phase: "connecting" }
  | { phase: "adaptive"; turn: CheckinTurn; turnCount: number }
  | { phase: "fallback" };

const DIALOG_CLASSES =
  "absolute inset-3 flex flex-col justify-center rounded-[14px] border p-4";
const DIALOG_STYLE = { background: "var(--paper-card)", borderColor: "var(--line)" };

/**
 * Tries the adaptive AI check-in conversation
 * (docs/reference/checkin-conversation-guide.md) first; falls back to
 * the existing static 3-option `CheckInDialog` on any failure — model
 * unreachable, malformed output, or the turn cap hit without resolving.
 * The static dialogue is always a complete, working flow on its own,
 * never a degraded stand-in, so falling back never blocks the user.
 */
export function CheckInFlow({
  activeSession,
  onResolve,
  client,
}: {
  activeSession: ActiveSession;
  onResolve: (clockedOutAt: string, note: string) => void;
  client: OpenClawClient;
}) {
  const [state, setState] = useState<FlowState>({ phase: "connecting" });
  const [freeText, setFreeText] = useState("");
  const sessionKeyRef = useRef(`agent:main:mycelia-time-checkin-${activeSession.session.id}`);
  const wasAlreadyRunningRef = useRef<boolean | null>(null);
  const daemonReleasedRef = useRef(false);
  const selfVoicing = useSelfVoicing();
  const voiceCues = useVoiceCues();

  async function releaseIfNeeded() {
    if (wasAlreadyRunningRef.current === null || daemonReleasedRef.current) return;
    daemonReleasedRef.current = true;
    try {
      await client.releaseDaemon(wasAlreadyRunningRef.current);
    } catch {
      // Best-effort — nothing else can be done from here if this fails.
    }
  }

  async function finish(turn: CheckinTurn) {
    selfVoicing.speak(turn.message);
    await releaseIfNeeded();
    onResolve(turn.resolvedCloseAt as string, turn.resolvedNote ?? "");
  }

  useEffect(() => {
    let cancelled = false;

    async function begin() {
      voiceCues.play("please_wait");
      let wasRunning: boolean;
      try {
        wasRunning = await client.ensureDaemon();
      } catch {
        if (!cancelled) setState({ phase: "fallback" });
        return;
      }
      wasAlreadyRunningRef.current = wasRunning;
      if (cancelled) {
        await releaseIfNeeded();
        return;
      }

      const turn = await startCheckinConversation(
        client,
        activeSession.task,
        activeSession.session.clocked_in_at,
        sessionKeyRef.current,
      );

      if (cancelled) {
        await releaseIfNeeded();
        return;
      }
      if (!turn) {
        await releaseIfNeeded();
        setState({ phase: "fallback" });
        return;
      }
      if (turn.final) {
        await finish(turn);
        return;
      }
      selfVoicing.speak(turn.message);
      setState({ phase: "adaptive", turn, turnCount: 1 });
    }

    begin();

    return () => {
      cancelled = true;
      releaseIfNeeded();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSession.session.id]);

  async function submitReply(value: string) {
    if (state.phase !== "adaptive") return;
    const nextCount = state.turnCount + 1;
    if (nextCount > MAX_CHECKIN_TURNS) {
      await releaseIfNeeded();
      setState({ phase: "fallback" });
      return;
    }
    setState({ phase: "connecting" });
    voiceCues.play("please_wait");
    const turn = await continueCheckinConversation(client, sessionKeyRef.current, value);
    if (!turn) {
      await releaseIfNeeded();
      setState({ phase: "fallback" });
      return;
    }
    if (turn.final) {
      await finish(turn);
      return;
    }
    selfVoicing.speak(turn.message);
    setState({ phase: "adaptive", turn, turnCount: nextCount });
  }

  if (state.phase === "fallback") {
    return <CheckInDialog activeSession={activeSession} onResolve={onResolve} />;
  }

  if (state.phase === "connecting") {
    return (
      <div role="dialog" aria-label="Forgot to clock out check-in" className={DIALOG_CLASSES} style={DIALOG_STYLE}>
        <div className="mb-3 text-[0.72rem] tracking-wide text-[var(--ink-faint)] uppercase">
          Still clocked in
        </div>
        <div className="text-[0.8rem] text-[var(--ink-faint)]">…</div>
      </div>
    );
  }

  const { turn } = state;

  return (
    <div role="dialog" aria-label="Forgot to clock out check-in" className={DIALOG_CLASSES} style={DIALOG_STYLE}>
      <div className="mb-3 text-[0.72rem] tracking-wide text-[var(--ink-faint)] uppercase">
        Still clocked in
      </div>
      <div className="mb-4 text-[0.85rem] leading-relaxed text-[var(--ink)]">{turn.message}</div>

      {turn.options ? (
        <div className="flex flex-col gap-2">
          {turn.options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => submitReply(option.value)}
              className="rounded-lg border border-[var(--line)] px-3 py-2 text-left text-[0.8rem] text-[var(--ink)]"
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <textarea
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            rows={2}
            className="resize-none rounded-lg border border-[var(--line)] bg-[var(--paper)] px-2.5 py-2 text-[0.8rem] text-[var(--ink)] outline-none"
          />
          <div className="flex items-center gap-2">
            <MicButton onTranscribed={(text) => setFreeText((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text))} />
          </div>
          <button
            type="button"
            onClick={() => {
              const value = freeText;
              setFreeText("");
              submitReply(value);
            }}
            className="self-start rounded-lg bg-[var(--moss)] px-3 py-1.5 text-[0.78rem] text-white"
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
}
