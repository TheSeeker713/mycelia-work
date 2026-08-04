import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Repositories } from "../data";
import { createTasksStore, type TasksState, type TasksStore } from "./tasksStore";
import {
  createProjectsStore,
  type ProjectsState,
  type ProjectsStore,
} from "./projectsStore";
import { createTodosStore, type TodosState, type TodosStore } from "./todosStore";
import {
  createSessionsStore,
  type SessionsState,
  type SessionsStore,
} from "./sessionsStore";
import { createNotesStore, type NotesState, type NotesStore } from "./notesStore";
import { createJournalsStore, type JournalsState, type JournalsStore } from "./journalsStore";
import {
  createSettingsStore,
  type SettingsState,
  type SettingsStore,
} from "./settingsStore";
import { createTauriOpenClawClient, type OpenClawClient } from "../services/openclawClient";
import { createHttpVoiceClient, type VoiceClient } from "../services/voiceClient";
import { createTauriRewardsClient, type RewardsClient } from "../services/rewardsClient";
import { createHttpOllamaClient, type OllamaClient } from "../services/ollamaClient";
import { createTauriCaptureLogClient, type CaptureLogClient } from "../services/captureLogClient";
import { createCaptureStore, type CaptureState, type CaptureStore } from "./captureStore";

interface StoresContextValue {
  useTasksStore: TasksStore;
  useProjectsStore: ProjectsStore;
  useTodosStore: TodosStore;
  useSessionsStore: SessionsStore;
  useNotesStore: NotesStore;
  useJournalsStore: JournalsStore;
  useSettingsStore: SettingsStore;
  useCaptureStore: CaptureStore;
  openClawClient: OpenClawClient;
  voiceClient: VoiceClient;
  rewardsClient: RewardsClient;
  ollamaClient: OllamaClient;
  captureLogClient: CaptureLogClient;
}

const StoresContext = createContext<StoresContextValue | null>(null);

export function StoreProvider({
  repositories,
  openClawClient,
  voiceClient,
  rewardsClient,
  ollamaClient,
  captureLogClient,
  children,
}: {
  repositories: Repositories;
  /** Injectable, like `repositories` — tests pass a fake instead of hitting a real Tauri bridge. */
  openClawClient?: OpenClawClient;
  /** Injectable, like `openClawClient` — tests pass a fake instead of hitting the real local voice servers. */
  voiceClient?: VoiceClient;
  /** Injectable, like `openClawClient` — tests pass a fake instead of hitting the real password/asset commands. */
  rewardsClient?: RewardsClient;
  /** Injectable, like `openClawClient` — tests pass a fake instead of hitting the real local Ollama server. */
  ollamaClient?: OllamaClient;
  /** Injectable, like `openClawClient` — tests pass a fake instead of hitting the real capture-log Tauri command. */
  captureLogClient?: CaptureLogClient;
  children: ReactNode;
}) {
  // Created once per `repositories` instance so remounts/tests don't
  // silently share state across a fresh database.
  const stores = useMemo<StoresContextValue>(() => {
    const client = openClawClient ?? createTauriOpenClawClient();
    const voice = voiceClient ?? createHttpVoiceClient();
    const rewards = rewardsClient ?? createTauriRewardsClient();
    const ollama = ollamaClient ?? createHttpOllamaClient();
    const captureLog = captureLogClient ?? createTauriCaptureLogClient();
    return {
      useTasksStore: createTasksStore(repositories),
      useProjectsStore: createProjectsStore(repositories, client),
      useTodosStore: createTodosStore(repositories),
      useSessionsStore: createSessionsStore(repositories),
      useNotesStore: createNotesStore(repositories),
      useJournalsStore: createJournalsStore(repositories, client),
      useSettingsStore: createSettingsStore(repositories),
      useCaptureStore: createCaptureStore(repositories, { ollamaClient: ollama, openClawClient: client }),
      openClawClient: client,
      voiceClient: voice,
      rewardsClient: rewards,
      ollamaClient: ollama,
      captureLogClient: captureLog,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repositories]);

  return (
    <StoresContext.Provider value={stores}>{children}</StoresContext.Provider>
  );
}

function useStoresContext(): StoresContextValue {
  const ctx = useContext(StoresContext);
  if (!ctx) {
    throw new Error(
      "useTasksStore/useProjectsStore/useTodosStore/useSessionsStore/useNotesStore/useJournalsStore must be used within StoreProvider",
    );
  }
  return ctx;
}

export function useTasksStore<T>(selector: (state: TasksState) => T): T {
  const { useTasksStore: useStore } = useStoresContext();
  return useStore(selector);
}

export function useProjectsStore<T>(selector: (state: ProjectsState) => T): T {
  const { useProjectsStore: useStore } = useStoresContext();
  return useStore(selector);
}

export function useTodosStore<T>(selector: (state: TodosState) => T): T {
  const { useTodosStore: useStore } = useStoresContext();
  return useStore(selector);
}

export function useSessionsStore<T>(selector: (state: SessionsState) => T): T {
  const { useSessionsStore: useStore } = useStoresContext();
  return useStore(selector);
}

export function useNotesStore<T>(selector: (state: NotesState) => T): T {
  const { useNotesStore: useStore } = useStoresContext();
  return useStore(selector);
}

export function useJournalsStore<T>(selector: (state: JournalsState) => T): T {
  const { useJournalsStore: useStore } = useStoresContext();
  return useStore(selector);
}

export function useSettingsStore<T>(selector: (state: SettingsState) => T): T {
  const { useSettingsStore: useStore } = useStoresContext();
  return useStore(selector);
}

export function useOpenClawClient(): OpenClawClient {
  return useStoresContext().openClawClient;
}

export function useVoiceClient(): VoiceClient {
  return useStoresContext().voiceClient;
}

export function useRewardsClient(): RewardsClient {
  return useStoresContext().rewardsClient;
}

export function useOllamaClient(): OllamaClient {
  return useStoresContext().ollamaClient;
}

export function useCaptureLogClient(): CaptureLogClient {
  return useStoresContext().captureLogClient;
}

export function useCaptureStore<T>(selector: (state: CaptureState) => T): T {
  const { useCaptureStore: useStore } = useStoresContext();
  return useStore(selector);
}

/** The raw bound store (not a reactive subscription) — for reading a point-in-time snapshot right after an action resolves, e.g. to log/narrate the outcome without waiting on a re-render. */
export function useCaptureStoreApi(): CaptureStore {
  return useStoresContext().useCaptureStore;
}
