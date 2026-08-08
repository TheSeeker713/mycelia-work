import { useCaptureStore, useJournalsStore, useOpenClawClient, useProjectsStore } from "../store/StoreProvider";

export interface AiInFlight {
  active: boolean;
  /** A short, specific description for the exit dialog — what's actually running, not a generic "AI is busy." */
  description: string | null;
  /** Cancels the underlying OpenClaw call and deletes any in-flight draft row(s) — used by the exit flow's "quit now" path. */
  discard: () => Promise<void>;
}

/**
 * Aggregates every AI call the app can have in flight at once, per the
 * exit-flow design: a pending journal, a pending project report, or an
 * active capture-agent classification. The forgot-to-clock-out check-in
 * conversation isn't included — it owns its own local dialog state
 * rather than a store, and already blocks the rest of the UI while open.
 */
export function useAiInFlight(): AiInFlight {
  const journals = useJournalsStore((s) => s.journals);
  const discardPendingJournal = useJournalsStore((s) => s.discardPending);
  const reportsByProject = useProjectsStore((s) => s.reportsByProject);
  const discardPendingReport = useProjectsStore((s) => s.discardPendingReport);
  const capturePhase = useCaptureStore((s) => s.phase);
  const captureDismiss = useCaptureStore((s) => s.dismiss);
  const openClawClient = useOpenClawClient();

  const pendingJournal = journals.find((j) => j.status === "pending") ?? null;
  const pendingReport = Object.values(reportsByProject)
    .flat()
    .find((r) => r.status === "pending") ?? null;
  const capturing = capturePhase === "thinking";

  let description: string | null = null;
  if (pendingJournal) {
    description = pendingJournal.kind === "weekly" ? "Writing your weekly rollup" : "Writing a work journal entry";
  } else if (pendingReport) {
    description = "Writing a project status report";
  } else if (capturing) {
    description = "Filing what you just typed";
  }

  async function discard() {
    await openClawClient.cancelActiveCall();
    if (pendingJournal) await discardPendingJournal();
    if (pendingReport) await discardPendingReport();
    if (capturing) captureDismiss();
  }

  return { active: description !== null, description, discard };
}
