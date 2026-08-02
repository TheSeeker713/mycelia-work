import { useEffect } from "react";
import { AppStoreProvider, useAppStore } from "./lib/store/AppStoreProvider";
import { tauriExecutor } from "./lib/db/tauriExecutor";
import { TaskList } from "./components/TaskList";
import { WorkspaceDashboard } from "./components/WorkspaceDashboard";

function AppShell() {
  const loadTasks = useAppStore((s) => s.loadTasks);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  return (
    <div className="flex h-screen w-screen flex-col bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800 px-4 py-3">
        <h1 className="text-sm font-semibold tracking-tight">Mycelia Time</h1>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <TaskList />
        <WorkspaceDashboard />
      </div>
    </div>
  );
}

function App() {
  return (
    <AppStoreProvider db={tauriExecutor}>
      <AppShell />
    </AppStoreProvider>
  );
}

export default App;
