import { DbProvider } from "./db/DbProvider";
import { Dashboard } from "./components/Dashboard";

function App() {
  return (
    <DbProvider>
      <Dashboard />
    </DbProvider>
  );
}

export default App;
