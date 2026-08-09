import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initDatabase, type Repositories } from "../../data";
import { createTestExecutor } from "../../data/__tests__/testExecutor";
import { StoreProvider } from "../../store/StoreProvider";
import type { VoiceClient } from "../../services/voiceClient";
import { TODO_REMINDER_POLL_INTERVAL_MS, useTodoReminders } from "../useTodoReminders";

vi.mock("@tauri-apps/plugin-notification", () => ({
  sendNotification: vi.fn(),
}));

import { sendNotification } from "@tauri-apps/plugin-notification";

let repos: Repositories;
let voiceClient: VoiceClient;

beforeEach(async () => {
  repos = await initDatabase(createTestExecutor());
  vi.mocked(sendNotification).mockReset();
  voiceClient = {
    speak: vi.fn().mockResolvedValue(new Blob(["wav"])),
    transcribe: vi.fn(),
    isTtsAvailable: vi.fn(),
    isSttAvailable: vi.fn(),
  };
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function wrapper({ children }: { children: ReactNode }) {
  return (
    <StoreProvider repositories={repos} voiceClient={voiceClient}>
      {children}
    </StoreProvider>
  );
}

describe("useTodoReminders", () => {
  it("fires a real system notification and speaks the cue for a due todo", async () => {
    const dueAt = new Date(Date.now() - 1000).toISOString();
    const todo = await repos.todos.create("Follow up with the vendor", dueAt);

    renderHook(() => useTodoReminders(), { wrapper });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TODO_REMINDER_POLL_INTERVAL_MS);
    });

    expect(sendNotification).toHaveBeenCalledWith({
      title: "Mycelia Time",
      body: "Follow up with the vendor is due",
    });
    expect(voiceClient.speak).toHaveBeenCalledWith(
      "Follow up with the vendor is due.",
      expect.any(String),
    );
    const updated = await repos.todos.list();
    expect(updated.find((t) => t.id === todo.id)?.alerted_at).not.toBeNull();
  });

  it("does nothing for a todo whose alert time hasn't arrived yet", async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await repos.todos.create("Not yet", future);

    renderHook(() => useTodoReminders(), { wrapper });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TODO_REMINDER_POLL_INTERVAL_MS);
    });

    expect(sendNotification).not.toHaveBeenCalled();
    expect(voiceClient.speak).not.toHaveBeenCalled();
  });

  it("never fires for a todo with no alert time set", async () => {
    await repos.todos.create("No reminder");

    renderHook(() => useTodoReminders(), { wrapper });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TODO_REMINDER_POLL_INTERVAL_MS);
    });

    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("never fires for a completed todo even if its alert time is overdue", async () => {
    const dueAt = new Date(Date.now() - 1000).toISOString();
    const todo = await repos.todos.create("Finished already", dueAt);
    await repos.todos.complete(todo.id);

    renderHook(() => useTodoReminders(), { wrapper });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TODO_REMINDER_POLL_INTERVAL_MS);
    });

    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("only fires once — a second poll tick doesn't re-alert the same todo", async () => {
    const dueAt = new Date(Date.now() - 1000).toISOString();
    await repos.todos.create("Follow up with the vendor", dueAt);

    renderHook(() => useTodoReminders(), { wrapper });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TODO_REMINDER_POLL_INTERVAL_MS * 2);
    });

    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it("picks up a todo created after the hook already mounted — it reloads from the repository every tick", async () => {
    renderHook(() => useTodoReminders(), { wrapper });

    const dueAt = new Date(Date.now() - 1000).toISOString();
    await repos.todos.create("Added later", dueAt);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(TODO_REMINDER_POLL_INTERVAL_MS);
    });

    expect(sendNotification).toHaveBeenCalledWith({
      title: "Mycelia Time",
      body: "Added later is due",
    });
  });
});
