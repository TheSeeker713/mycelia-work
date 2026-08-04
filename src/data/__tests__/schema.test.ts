// @vitest-environment node
import { describe, expect, it } from "vitest";
import { applyMigrations, MIGRATIONS } from "../schema";
import { createTestExecutor } from "./testExecutor";

describe("applyMigrations", () => {
  it("creates every table declared in MIGRATIONS", async () => {
    const executor = createTestExecutor();
    await applyMigrations(executor);

    const tables = await executor.select<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    );
    const names = tables.map((t) => t.name);

    expect(names).toContain("projects");
    expect(names).toContain("tasks");
    expect(names).toContain("task_sessions");
    expect(names).toContain("session_events");
    expect(names).toContain("notes");
    expect(names).toContain("todos");
    expect(names).toContain("journals");
    expect(names).toContain("resource_events");
    expect(names).toContain("app_settings");
  });

  it("is idempotent — running it twice doesn't error or double-apply", async () => {
    const executor = createTestExecutor();
    await applyMigrations(executor);
    await applyMigrations(executor);

    const applied = await executor.select<{ id: number }>(
      "SELECT id FROM migrations",
    );
    // one row per migration after MIGRATIONS[0] (the tracking table itself)
    expect(applied.length).toBe(MIGRATIONS.length - 1);
  });
});
