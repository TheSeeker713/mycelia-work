import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Repositories } from "../data";
import { createTasksStore, type TasksState, type TasksStore } from "./tasksStore";
import {
  createProjectsStore,
  type ProjectsState,
  type ProjectsStore,
} from "./projectsStore";

interface StoresContextValue {
  useTasksStore: TasksStore;
  useProjectsStore: ProjectsStore;
}

const StoresContext = createContext<StoresContextValue | null>(null);

export function StoreProvider({
  repositories,
  children,
}: {
  repositories: Repositories;
  children: ReactNode;
}) {
  // Created once per `repositories` instance so remounts/tests don't
  // silently share state across a fresh database.
  const stores = useMemo<StoresContextValue>(
    () => ({
      useTasksStore: createTasksStore(repositories),
      useProjectsStore: createProjectsStore(repositories),
    }),
    [repositories],
  );

  return (
    <StoresContext.Provider value={stores}>{children}</StoresContext.Provider>
  );
}

function useStoresContext(): StoresContextValue {
  const ctx = useContext(StoresContext);
  if (!ctx) {
    throw new Error("useTasksStore/useProjectsStore must be used within StoreProvider");
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
