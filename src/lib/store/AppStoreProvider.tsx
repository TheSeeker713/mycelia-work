import { createContext, useContext, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import { createAppStore, type AppState, type AppStore } from "./appStore";
import type { SqlExecutor } from "../db/executor";

const AppStoreContext = createContext<AppStore | null>(null);

export function AppStoreProvider({
  db,
  children,
}: {
  db: SqlExecutor;
  children: ReactNode;
}) {
  const [store] = useState<AppStore>(() => createAppStore(db));
  return (
    <AppStoreContext.Provider value={store}>
      {children}
    </AppStoreContext.Provider>
  );
}

export function useAppStore<T>(selector: (state: AppState) => T): T {
  const store = useContext(AppStoreContext);
  if (!store) {
    throw new Error("useAppStore must be used within an AppStoreProvider");
  }
  return useStore(store, selector);
}
