// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { Update } from "@tauri-apps/plugin-updater";
import { checkForUpdate, installUpdate } from "../updater";

vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn() }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));

function fakeUpdate(over: Partial<Update> = {}): Update {
  return { version: "0.2.0", body: "Fixed things", ...over } as Update;
}

describe("checkForUpdate", () => {
  it("reports up to date when the feed has nothing newer", async () => {
    const status = await checkForUpdate(vi.fn().mockResolvedValue(null));
    expect(status.kind).toBe("up-to-date");
  });

  it("surfaces the version and notes when there is one", async () => {
    const status = await checkForUpdate(vi.fn().mockResolvedValue(fakeUpdate()));

    expect(status).toMatchObject({ kind: "available", version: "0.2.0", notes: "Fixed things" });
  });

  it("treats blank release notes as no notes rather than an empty paragraph", async () => {
    const status = await checkForUpdate(vi.fn().mockResolvedValue(fakeUpdate({ body: "   " })));

    expect(status).toMatchObject({ kind: "available", notes: null });
  });

  /**
   * The feed is a bucket that won't exist until it's created, and a
   * laptop is offline sometimes. Neither is an error worth interrupting
   * anyone over, so both have to come back as a status, not a throw.
   */
  it("turns an unreachable feed into a status instead of throwing", async () => {
    const status = await checkForUpdate(vi.fn().mockRejectedValue(new Error("dns failed")));

    expect(status).toMatchObject({ kind: "unreachable", reason: "dns failed" });
  });

  it("survives a rejection that isn't an Error", async () => {
    const status = await checkForUpdate(vi.fn().mockRejectedValue("nope"));

    expect(status).toMatchObject({ kind: "unreachable", reason: "nope" });
  });
});

describe("installUpdate", () => {
  it("restarts once the install finishes", async () => {
    const relaunchFn = vi.fn().mockResolvedValue(undefined);
    const update = fakeUpdate({ downloadAndInstall: vi.fn().mockResolvedValue(undefined) });

    await installUpdate(update, undefined, relaunchFn);

    expect(relaunchFn).toHaveBeenCalledTimes(1);
  });

  it("reports progress as a running total, not per chunk", async () => {
    const seen: Array<[number, number | null]> = [];
    const update = fakeUpdate({
      downloadAndInstall: vi.fn(async (cb: (e: unknown) => void) => {
        cb({ event: "Started", data: { contentLength: 100 } });
        cb({ event: "Progress", data: { chunkLength: 40 } });
        cb({ event: "Progress", data: { chunkLength: 35 } });
      }),
    });

    await installUpdate(update, (done, total) => seen.push([done, total]), vi.fn());

    expect(seen).toEqual([
      [0, 100],
      [40, 100],
      [75, 100],
    ]);
  });

  it("copes with a feed that doesn't send a content length", async () => {
    const seen: Array<[number, number | null]> = [];
    const update = fakeUpdate({
      downloadAndInstall: vi.fn(async (cb: (e: unknown) => void) => {
        cb({ event: "Started", data: {} });
        cb({ event: "Progress", data: { chunkLength: 10 } });
        cb({ event: "Finished", data: {} });
      }),
    });

    await installUpdate(update, (done, total) => seen.push([done, total]), vi.fn());

    expect(seen).toEqual([
      [0, null],
      [10, null],
      [10, null],
    ]);
  });

  it("does not restart if the install itself fails", async () => {
    const relaunchFn = vi.fn();
    const update = fakeUpdate({
      downloadAndInstall: vi.fn().mockRejectedValue(new Error("disk full")),
    });

    await expect(installUpdate(update, undefined, relaunchFn)).rejects.toThrow("disk full");
    expect(relaunchFn).not.toHaveBeenCalled();
  });
});
