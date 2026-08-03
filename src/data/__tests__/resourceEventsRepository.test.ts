// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { applyMigrations } from "../schema";
import { createResourceEventsRepository } from "../repositories/resourceEventsRepository";
import type { SqlExecutor } from "../sqlExecutor";
import { createTestExecutor } from "./testExecutor";

let executor: SqlExecutor;
let resourceEvents: ReturnType<typeof createResourceEventsRepository>;

beforeEach(async () => {
  executor = createTestExecutor();
  await applyMigrations(executor);
  resourceEvents = createResourceEventsRepository(executor);
});

describe("resourceEventsRepository", () => {
  it("logs an auto-resolve action with its detail", async () => {
    const event = await resourceEvents.log(
      "deferred_job",
      "weekly roll-up deferred, CPU above high watermark",
    );
    expect(event.kind).toBe("deferred_job");
    expect(event.detail).toContain("weekly roll-up");
  });

  it("lists events newest first", async () => {
    await resourceEvents.log("throttled", "first");
    await resourceEvents.log("killed_subprocess", "second");

    const all = await resourceEvents.list();
    expect(all[0].detail).toBe("second");
    expect(all[1].detail).toBe("first");
  });
});
