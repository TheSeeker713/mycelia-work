// @vitest-environment node
import { describe, expect, it } from "vitest";
import { applyMigrations, MIGRATIONS } from "../schema";
import type { SqlExecutor } from "../sqlExecutor";
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
    expect(names).toContain("gamification_stats");
    expect(names).toContain("xp_events");
    expect(names).toContain("unlocked_achievements");
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

  it("survives a concurrent instance recording the same migration first — the real bug found in manual testing", async () => {
    const executor = createTestExecutor();

    // Simulates a second app process (e.g. one still resident in the
    // tray from a prior session) winning the race to record the last
    // migration's tracking row a moment before this call's own INSERT
    // runs — the exact window that produced "UNIQUE constraint failed:
    // migrations.id" on a real launch.
    const lastId = MIGRATIONS.length - 1;
    const trackingInsertSql = "INSERT INTO migrations (id, applied_at) VALUES (?, ?)";
    let injected = false;
    const racingExecutor: SqlExecutor = {
      select: (sql, params) => executor.select(sql, params),
      async execute(sql, params) {
        if (!injected && sql === trackingInsertSql && (params as unknown[])[0] === lastId) {
          injected = true;
          await executor.execute(trackingInsertSql, [lastId, new Date().toISOString()]);
        }
        return executor.execute(sql, params);
      },
    };

    await expect(applyMigrations(racingExecutor)).resolves.toBeUndefined();

    const applied = await executor.select<{ id: number }>("SELECT id FROM migrations WHERE id = ?", [
      lastId,
    ]);
    expect(applied.length).toBe(1);

    const tables = await executor.select<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    );
    expect(tables.map((t) => t.name)).toContain("app_settings");
  });
});
