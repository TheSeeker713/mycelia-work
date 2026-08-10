import { useStore } from "zustand";
import { useCaptureStore, useJournalsStore, useOpenClawClient, useProjectsStore } from "../store/StoreProvider";
import { aiQueueStore } from "../services/aiQueue";

export interface AiInFlight {
  active: boolean;
  /** A short, specific description for the exit dialog — what's actually running, not a generic "AI is busy." */
  description: string | null;
  /** Cancels the underlying OpenClaw call and deletes any in-flight draft row(s) — used by the exit flow's "quit now" path. */
  discard: () => Promise<void>;
}

/**
 * Aggregates every AI call the app can have in flight, for the exit
 * flow. Three of these are read from the stores that own a persisted
 * row (a pending journal, a pending project report, an active capture
 * classification), because those are the ones with something real to
 * clean up if you quit mid-write.
 *
 * The AI queue is consulted on top of that, so work with no row behind
 * it — the check-in conversation, an image upscale, a video generation
 * — still counts as "something is running" rather than letting the exit
 * dialog claim the app is idle while a model is clearly busy. Ghost
 * text is deliberately excluded: it's never worth holding an exit for,
 * and it drops itself anyway.
 */
export function useAiInFlight(): AiInFlight {
  const journals = useJournalsStore((s) => s.journals);
  const discardPendingJournal = useJournalsStore((s) => s.discardPending);
  const reportsByProject = useProjectsStore((s) => s.reportsByProject);
  const discardPendingReport = useProjectsStore((s) => s.discardPendingReport);
  const capturePhase = useCaptureStore((s) => s.phase);
  const captureDismiss = useCaptureStore((s) => s.dismiss);
  const openClawClient = useOpenClawClient();
  const runningJob = useStore(aiQueueStore, (s) => s.running);

  const pendingJournal = journals.find((j) => j.status === "pending") ?? null;
  const pendingReport = Object.values(reportsByProject)
    .flat()
    .find((r) => r.status === "pending") ?? null;
  const capturing = capturePhase === "thinking";

  let description: string | null = null;
  if (pendingJournal) {
    description = pendingJournal.kind === "weekly" ? "Writing your weekly report" : "Writing your report";
  } else if (pendingReport) {
    description = "Writing a project status report";
  } else if (capturing) {
    description = "Filing what you just typed";
  } else if (runningJob && runningJob.kind !== "ghost_text") {
    description = runningJob.label;
  }

  async function discard() {
    await openClawClient.cancelActiveCall();
    if (pendingJournal) await discardPendingJournal();
    if (pendingReport) await discardPendingReport();
    if (capturing) captureDismiss();
  }

  return { active: description !== null, description, discard };
}
