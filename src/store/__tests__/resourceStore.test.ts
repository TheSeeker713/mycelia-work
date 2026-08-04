// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { initDatabase, type Repositories } from "../../data";
import { createTestExecutor } from "../../data/__tests__/testExecutor";
import { createResourceStore, type ResourceStore } from "../resourceStore";

let repos: Repositories;
let useResource: ResourceStore;

beforeEach(async () => {
  repos = await initDatabase(createTestExecutor());
  useResource = createResourceStore(repos);
});

describe("resourceStore", () => {
  it("logEvent writes a real resource_events row and refreshes the list", async () => {
    await useResource.getState().logEvent("throttled", "cpu 92%");

    expect(useResource.getState().events).toHaveLength(1);
    expect(useResource.getState().events[0]).toMatchObject({ kind: "throttled", detail: "cpu 92%" });

    const stored = await repos.resourceEvents.list();
    expect(stored).toHaveLength(1);
  });

  it("loadEvents reads existing events, newest first", async () => {
    await repos.resourceEvents.log("deferred_job", "first");
    await repos.resourceEvents.log("killed_subprocess", "second");

    await useResource.getState().loadEvents();

    expect(useResource.getState().events.map((e) => e.detail)).toEqual(["second", "first"]);
  });
});
