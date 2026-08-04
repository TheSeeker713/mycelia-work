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
import { createTauriOpenClawClient, type OpenClawClient } from "../services/openclawClient";

interface StoresContextValue {
  useTasksStore: TasksStore;
  useProjectsStore: ProjectsStore;
  useTodosStore: TodosStore;
  useSessionsStore: SessionsStore;
  useNotesStore: NotesStore;
  useJournalsStore: JournalsStore;
}

const StoresContext = createContext<StoresContextValue | null>(null);

export function StoreProvider({
  repositories,
  openClawClient,
  children,
}: {
  repositories: Repositories;
  /** Injectable, like `repositories` — tests pass a fake instead of hitting a real Tauri bridge. */
  openClawClient?: OpenClawClient;
  children: ReactNode;
}) {
  // Created once per `repositories` instance so remounts/tests don't
  // silently share state across a fresh database.
  const stores = useMemo<StoresContextValue>(
    () => ({
      useTasksStore: createTasksStore(repositories),
      useProjectsStore: createProjectsStore(repositories),
      useTodosStore: createTodosStore(repositories),
      useSessionsStore: createSessionsStore(repositories),
      useNotesStore: createNotesStore(repositories),
      useJournalsStore: createJournalsStore(repositories, openClawClient ?? createTauriOpenClawClient()),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [repositories],
  );

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
