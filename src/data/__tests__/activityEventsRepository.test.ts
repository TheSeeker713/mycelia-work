// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { applyMigrations } from "../schema";
import { createActivityEventsRepository } from "../repositories/activityEventsRepository";
import type { SqlExecutor } from "../sqlExecutor";
import { createTestExecutor } from "./testExecutor";

let executor: SqlExecutor;
let events: ReturnType<typeof createActivityEventsRepository>;

beforeEach(async () => {
  executor = createTestExecutor();
  await applyMigrations(executor);
  events = createActivityEventsRepository(executor);
});

describe("activityEventsRepository", () => {
  it("inserts a metadata-only row and lists newest first", async () => {
    await events.insert({ app: "Code.exe", title: "first", idle: false, sampledAt: "2026-08-21T10:00:00.000Z" });
    await events.insert({ app: "firefox.exe", title: "second", idle: true, sampledAt: "2026-08-21T10:00:05.000Z" });

    const recent = await events.listRecent(10);
    expect(recent).toHaveLength(2);
    expect(recent[0].app).toBe("firefox.exe");
    expect(recent[0].url).toBeNull();
    expect(recent[1].title).toBe("first");
  });
});
