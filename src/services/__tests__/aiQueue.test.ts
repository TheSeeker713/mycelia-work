// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AiJobCancelled,
  AiJobDropped,
  aiQueueStore,
  cancelAiJob,
  runAiJob,
  visibleQueued,
  __resetAiQueueForTests,
} from "../aiQueue";

afterEach(() => {
  __resetAiQueueForTests();
});

/** A promise plus its resolver, so a test can hold a job open deliberately. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("aiQueue", () => {
  it("runs one job at a time — a second never starts while the first is in flight", async () => {
    const first = deferred<string>();
    const secondWork = vi.fn().mockResolvedValue("second");

    const firstPromise = runAiJob({ kind: "journal", label: "Writing your report" }, () => first.promise);
    const secondPromise = runAiJob({ kind: "report", label: "Writing a status report" }, secondWork);

    await vi.waitFor(() => expect(aiQueueStore.getState().running?.kind).toBe("journal"));
    expect(secondWork).not.toHaveBeenCalled();

    first.resolve("first");
    expect(await firstPromise).toBe("first");
    expect(await secondPromise).toBe("second");
    expect(secondWork).toHaveBeenCalledTimes(1);
  });

  it("runs queued jobs in the order they arrived", async () => {
    const order: string[] = [];
    const gate = deferred<void>();

    const a = runAiJob({ kind: "journal", label: "A" }, async () => {
      await gate.promise;
      order.push("a");
    });
    const b = runAiJob({ kind: "report", label: "B" }, async () => {
      order.push("b");
    });
    const c = runAiJob({ kind: "capture", label: "C" }, async () => {
      order.push("c");
    });

    gate.resolve();
    await Promise.all([a, b, c]);

    expect(order).toEqual(["a", "b", "c"]);
  });

  it("cancelling a queued job rejects it and never runs its work", async () => {
    const gate = deferred<void>();
    const blocked = vi.fn().mockResolvedValue("nope");

    const running = runAiJob({ kind: "journal", label: "Writing your report" }, () => gate.promise);
    const queuedPromise = runAiJob({ kind: "report", label: "Writing a status report" }, blocked);

    await vi.waitFor(() => expect(aiQueueStore.getState().queued).toHaveLength(1));
    const queuedId = aiQueueStore.getState().queued[0].id;
    cancelAiJob(queuedId);

    await expect(queuedPromise).rejects.toBeInstanceOf(AiJobCancelled);
    expect(blocked).not.toHaveBeenCalled();

    gate.resolve();
    await running;
  });

  it("a cancelled job leaves the queue immediately, so the ticker stops showing it", async () => {
    const gate = deferred<void>();
    const running = runAiJob({ kind: "journal", label: "Writing your report" }, () => gate.promise);
    const queuedPromise = runAiJob({ kind: "report", label: "Writing a status report" }, async () => "x");

    await vi.waitFor(() => expect(aiQueueStore.getState().queued).toHaveLength(1));
    cancelAiJob(aiQueueStore.getState().queued[0].id);

    expect(aiQueueStore.getState().queued).toHaveLength(0);
    await expect(queuedPromise).rejects.toBeInstanceOf(AiJobCancelled);
    gate.resolve();
    await running;
  });

  it("ghost text drops rather than running late when it's no longer relevant", async () => {
    const gate = deferred<void>();
    const staleWork = vi.fn().mockResolvedValue("too late");

    const running = runAiJob({ kind: "journal", label: "Writing your report" }, () => gate.promise);
    const ghostPromise = runAiJob(
      { kind: "ghost_text", label: "Suggesting a continuation", isStillRelevant: () => false },
      staleWork,
    );

    gate.resolve();
    await running;

    await expect(ghostPromise).rejects.toBeInstanceOf(AiJobDropped);
    expect(staleWork).not.toHaveBeenCalled();
  });

  it("ghost text still runs when it is relevant by the time its turn comes", async () => {
    const gate = deferred<void>();
    const running = runAiJob({ kind: "journal", label: "Writing your report" }, () => gate.promise);
    const ghostPromise = runAiJob(
      { kind: "ghost_text", label: "Suggesting a continuation", isStillRelevant: () => true },
      async () => "a real suggestion",
    );

    gate.resolve();
    await running;

    expect(await ghostPromise).toBe("a real suggestion");
  });

  it("only ghost text drops when stale — real requests wait their turn regardless", async () => {
    const gate = deferred<void>();
    const reportWork = vi.fn().mockResolvedValue("report");

    const running = runAiJob({ kind: "journal", label: "Writing your report" }, () => gate.promise);
    // A relevance check on a non-dropping kind is deliberately ignored.
    const reportPromise = runAiJob(
      { kind: "report", label: "Writing a status report", isStillRelevant: () => false },
      reportWork,
    );

    gate.resolve();
    await running;

    expect(await reportPromise).toBe("report");
    expect(reportWork).toHaveBeenCalledTimes(1);
  });

  it("keeps ghost text out of the ticker, since it resolves itself with no choice to make", async () => {
    const gate = deferred<void>();
    const running = runAiJob({ kind: "journal", label: "Writing your report" }, () => gate.promise);
    const ghost = runAiJob(
      { kind: "ghost_text", label: "Suggesting a continuation", isStillRelevant: () => true },
      async () => "s",
    );
    const report = runAiJob({ kind: "report", label: "Writing a status report" }, async () => "r");

    await vi.waitFor(() => expect(aiQueueStore.getState().queued).toHaveLength(2));
    expect(visibleQueued(aiQueueStore.getState())).toHaveLength(1);
    expect(visibleQueued(aiQueueStore.getState())[0].kind).toBe("report");

    gate.resolve();
    await Promise.all([running, ghost, report]);
  });

  it("a job that throws still releases the slot for the next one", async () => {
    const failing = runAiJob({ kind: "journal", label: "Writing your report" }, async () => {
      throw new Error("model exploded");
    });
    await expect(failing).rejects.toThrow("model exploded");

    const after = await runAiJob({ kind: "report", label: "Writing a status report" }, async () => "fine");
    expect(after).toBe("fine");
    expect(aiQueueStore.getState().running).toBeNull();
  });

  it("clears running state once the queue empties", async () => {
    await runAiJob({ kind: "capture", label: "Filing what you just typed" }, async () => "done");
    expect(aiQueueStore.getState().running).toBeNull();
    expect(aiQueueStore.getState().queued).toHaveLength(0);
  });
});
