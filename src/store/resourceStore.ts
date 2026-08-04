import { create } from "zustand";
import type { Repositories, ResourceEvent, ResourceEventKind } from "../data";

/** Thin wrapper around resourceEventsRepository so components that aren't already holding `repos` (CheckInFlow, ZenModeEditor) can log a real audit-trail entry the same way every other store touches its repositories. */
export interface ResourceState {
  events: ResourceEvent[];
  loadEvents: () => Promise<void>;
  logEvent: (kind: ResourceEventKind, detail?: string) => Promise<void>;
}

export function createResourceStore(repos: Repositories) {
  return create<ResourceState>((set, get) => ({
    events: [],

    async loadEvents() {
      set({ events: await repos.resourceEvents.list() });
    },

    async logEvent(kind, detail) {
      await repos.resourceEvents.log(kind, detail);
      await get().loadEvents();
    },
  }));
}

export type ResourceStore = ReturnType<typeof createResourceStore>;
