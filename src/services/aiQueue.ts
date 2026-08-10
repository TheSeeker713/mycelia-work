import { createStore } from "zustand/vanilla";

/**
 * Every category of AI/agent work in the app. Used for the ticker's
 * wording and for deciding queue behaviour (see `DROPS_WHEN_STALE`).
 */
export type AiJobKind =
  | "ghost_text"
  | "journal"
  | "report"
  | "project_assist"
  | "checkin"
  | "capture"
  | "upscale"
  | "animate";

/**
 * Ghost text is the one kind that drops rather than waits. A completion
 * suggested for text you finished typing two minutes ago is worse than
 * no suggestion, so when its turn finally comes it checks whether it's
 * still relevant and quietly gives up if not. Everything else is work
 * the person deliberately asked for, so it waits its turn.
 */
const DROPS_WHEN_STALE: ReadonlySet<AiJobKind> = new Set<AiJobKind>(["ghost_text"]);

/**
 * Kinds that never show a ticker entry. Ghost text is invisible by
 * design — it resolves itself without the person needing a choice, so
 * putting "waiting for a suggestion" on screen would be noise about
 * something they never asked for.
 */
const SILENT: ReadonlySet<AiJobKind> = new Set<AiJobKind>(["ghost_text"]);

export interface AiJob {
  id: string;
  kind: AiJobKind;
  /** Shown in the ticker, e.g. "Writing your report". */
  label: string;
  queuedAt: number;
}

export interface AiJobSpec {
  kind: AiJobKind;
  label: string;
  /**
   * Checked immediately before the job would start. Returning false
   * drops it instead of running it. Only consulted for kinds in
   * `DROPS_WHEN_STALE`.
   */
  isStillRelevant?: () => boolean;
}

/** Thrown when a queued job is cancelled from the ticker before it ever started. */
export class AiJobCancelled extends Error {
  constructor() {
    super("AI request cancelled while waiting in the queue");
    this.name = "AiJobCancelled";
  }
}

/** Thrown when a stale job (ghost text) drops itself rather than running late. */
export class AiJobDropped extends Error {
  constructor() {
    super("AI request dropped as no longer relevant");
    this.name = "AiJobDropped";
  }
}

interface AiQueueState {
  running: AiJob | null;
  queued: AiJob[];
}

export const aiQueueStore = createStore<AiQueueState>(() => ({
  running: null,
  queued: [],
}));

/**
 * The waiting jobs' actual work and promise handles. Deliberately not in
 * store state: functions and resolvers aren't renderable, and keeping
 * them out means the store holds only what the ticker needs to draw.
 */
interface PendingEntry {
  spec: AiJobSpec;
  run: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}
const pending = new Map<string, PendingEntry>();

let draining = false;
let nextId = 0;

function visible(job: AiJob): boolean {
  return !SILENT.has(job.kind);
}

async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    for (;;) {
      const next = aiQueueStore.getState().queued[0];
      if (!next) break;

      const entry = pending.get(next.id);
      aiQueueStore.setState((s) => ({ queued: s.queued.slice(1) }));
      if (!entry) continue; // cancelled between enqueue and its turn

      // Staleness is checked here, at the moment of running, not when
      // the request was made — that's the whole point of the check.
      if (DROPS_WHEN_STALE.has(entry.spec.kind) && entry.spec.isStillRelevant?.() === false) {
        pending.delete(next.id);
        entry.reject(new AiJobDropped());
        continue;
      }

      pending.delete(next.id);
      aiQueueStore.setState({ running: visible(next) ? next : null });
      try {
        entry.resolve(await entry.run());
      } catch (err) {
        entry.reject(err);
      } finally {
        aiQueueStore.setState({ running: null });
      }
    }
  } finally {
    draining = false;
  }
}

/**
 * Runs `work` under the app-wide single-slot AI lock. If anything else
 * is already running, this waits its turn rather than firing
 * concurrently — one local model call at a time, so a journal
 * generation and a ghost-text suggestion never fight over the same CPU.
 *
 * Every AI/agent call site in the app goes through here: OpenClaw calls,
 * direct Ollama calls, ghost text, journal and report generation, the
 * check-in conversation, capture classification, and the Gallery's
 * upscale/animate tools.
 */
export function runAiJob<T>(spec: AiJobSpec, work: () => Promise<T>): Promise<T> {
  const job: AiJob = {
    id: `ai-${++nextId}`,
    kind: spec.kind,
    label: spec.label,
    queuedAt: Date.now(),
  };

  return new Promise<T>((resolve, reject) => {
    pending.set(job.id, {
      spec,
      run: work as () => Promise<unknown>,
      resolve: resolve as (value: unknown) => void,
      reject,
    });
    aiQueueStore.setState((s) => ({ queued: [...s.queued, job] }));
    void drain();
  });
}

/**
 * Drops a job that hasn't started yet. Always instant and always safe:
 * a queued job has by definition done no work, so there's nothing to
 * roll back and nothing half-written to clean up.
 */
export function cancelAiJob(id: string): void {
  const entry = pending.get(id);
  if (!entry) return; // already running or already gone — not cancellable here
  pending.delete(id);
  aiQueueStore.setState((s) => ({ queued: s.queued.filter((j) => j.id !== id) }));
  entry.reject(new AiJobCancelled());
}

/** Everything currently waiting that's worth showing a person. */
export function visibleQueued(state: AiQueueState): AiJob[] {
  return state.queued.filter(visible);
}

/** Test-only reset, so one suite's leftovers can't leak into the next. */
export function __resetAiQueueForTests(): void {
  for (const entry of pending.values()) entry.reject(new AiJobCancelled());
  pending.clear();
  draining = false;
  aiQueueStore.setState({ running: null, queued: [] });
}
