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
import { createHttpOllamaClient, type OllamaClient } from "../services/ollamaClient";
import { createTauriCaptureLogClient, type CaptureLogClient } from "../services/captureLogClient";
import { createCaptureStore, type CaptureState, type CaptureStore } from "./captureStore";
import {
  createTauriResourceWatchdogClient,
  type ResourceWatchdogClient,
} from "../services/resourceWatchdog";
import { createResourceStore, type ResourceState, type ResourceStore } from "./resourceStore";
import {
  createGamificationStore,
  type GamificationState,
  type GamificationStore,
} from "./gamificationStore";

interface StoresContextValue {
  useTasksStore: TasksStore;
  useProjectsStore: ProjectsStore;
  useTodosStore: TodosStore;
  useSessionsStore: SessionsStore;
  useNotesStore: NotesStore;
  useJournalsStore: JournalsStore;
  useSettingsStore: SettingsStore;
  useCaptureStore: CaptureStore;
  useResourceStore: ResourceStore;
  useGamificationStore: GamificationStore;
  openClawClient: OpenClawClient;
  voiceClient: VoiceClient;
  ollamaClient: OllamaClient;
  captureLogClient: CaptureLogClient;
  resourceWatchdogClient: ResourceWatchdogClient;
}

const StoresContext = createContext<StoresContextValue | null>(null);

export function StoreProvider({
  repositories,
  openClawClient,
  voiceClient,
  ollamaClient,
  captureLogClient,
  resourceWatchdogClient,
  children,
}: {
  repositories: Repositories;
  /** Injectable, like `repositories` — tests pass a fake instead of hitting a real Tauri bridge. */
  openClawClient?: OpenClawClient;
  /** Injectable, like `openClawClient` — tests pass a fake instead of hitting the real local voice servers. */
  voiceClient?: VoiceClient;
  /** Injectable, like `openClawClient` — tests pass a fake instead of hitting the real local Ollama server. */
  ollamaClient?: OllamaClient;
  /** Injectable, like `openClawClient` — tests pass a fake instead of hitting the real capture-log Tauri command. */
  captureLogClient?: CaptureLogClient;
  /** Injectable, like `openClawClient` — tests pass a fake instead of hitting the real sysinfo watchdog command. */
  resourceWatchdogClient?: ResourceWatchdogClient;
  children: ReactNode;
}) {
  // Created once per `repositories` instance so remounts/tests don't
  // silently share state across a fresh database.
  const stores = useMemo<StoresContextValue>(() => {
    const client = openClawClient ?? createTauriOpenClawClient();
    const voice = voiceClient ?? createHttpVoiceClient();
    const ollama = ollamaClient ?? createHttpOllamaClient();
    const captureLog = captureLogClient ?? createTauriCaptureLogClient();
    const watchdog = resourceWatchdogClient ?? createTauriResourceWatchdogClient();
    const gamification = createGamificationStore(repositories);
    return {
      useTasksStore: createTasksStore(repositories),
      useProjectsStore: createProjectsStore(repositories, client, gamification, ollama),
      useTodosStore: createTodosStore(repositories, gamification),
      useSessionsStore: createSessionsStore(repositories, gamification),
      useNotesStore: createNotesStore(repositories, gamification),
      useJournalsStore: createJournalsStore(repositories, client, ollama),
      useSettingsStore: createSettingsStore(repositories),
      useCaptureStore: createCaptureStore(repositories, {
        ollamaClient: ollama,
        openClawClient: client,
        resourceWatchdogClient: watchdog,
      }),
      useResourceStore: createResourceStore(repositories),
      useGamificationStore: gamification,
      openClawClient: client,
      voiceClient: voice,
      ollamaClient: ollama,
      captureLogClient: captureLog,
      resourceWatchdogClient: watchdog,
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

/** The raw bound store — same rationale as useCaptureStoreApi: useTodoReminders needs a fresh snapshot right after its own loadTodos() call, not whatever was current at the start of the render that mounted the polling effect. */
export function useTodosStoreApi(): TodosStore {
  return useStoresContext().useTodosStore;
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

export function useResourceStore<T>(selector: (state: ResourceState) => T): T {
  const { useResourceStore: useStore } = useStoresContext();
  return useStore(selector);
}

export function useResourceWatchdogClient(): ResourceWatchdogClient {
  return useStoresContext().resourceWatchdogClient;
}

export function useGamificationStore<T>(selector: (state: GamificationState) => T): T {
  const { useGamificationStore: useStore } = useStoresContext();
  return useStore(selector);
}

/** The raw bound store — same rationale as useCaptureStoreApi: read a point-in-time snapshot (e.g. the just-updated toast queue) without waiting on a re-render. */
export function useGamificationStoreApi(): GamificationStore {
  return useStoresContext().useGamificationStore;
}
