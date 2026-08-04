// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { applyMigrations } from "../schema";
import { createSettingsRepository } from "../repositories/settingsRepository";
import type { SqlExecutor } from "../sqlExecutor";
import { createTestExecutor } from "./testExecutor";

let executor: SqlExecutor;
let settings: ReturnType<typeof createSettingsRepository>;

beforeEach(async () => {
  executor = createTestExecutor();
  await applyMigrations(executor);
  settings = createSettingsRepository(executor);
});

describe("settingsRepository", () => {
  it("get returns null for a key that was never set", async () => {
    expect(await settings.get("nope")).toBeNull();
  });

  it("set then get round-trips the value", async () => {
    await settings.set("self_voicing_enabled", "true");
    expect(await settings.get("self_voicing_enabled")).toBe("true");
  });

  it("set on an existing key overwrites rather than erroring or duplicating", async () => {
    await settings.set("stt_enabled", "true");
    await settings.set("stt_enabled", "false");
    expect(await settings.get("stt_enabled")).toBe("false");

    const all = await settings.getAll();
    expect(Object.keys(all).filter((k) => k === "stt_enabled").length).toBe(1);
  });

  it("getAll returns every stored key", async () => {
    await settings.set("a", "1");
    await settings.set("b", "2");
    expect(await settings.getAll()).toEqual({ a: "1", b: "2" });
  });
});
