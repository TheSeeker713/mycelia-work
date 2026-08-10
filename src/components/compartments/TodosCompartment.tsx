import { useEffect, useState, type FormEvent } from "react";
import { useTodosStore } from "../../store/StoreProvider";
import { MicButton } from "../MicButton";
import { GhostTextField } from "../GhostTextField";

export function TodosCompartment() {
  const todos = useTodosStore((s) => s.todos);
  const loadTodos = useTodosStore((s) => s.loadTodos);
  const addTodo = useTodosStore((s) => s.addTodo);
  const completeTodo = useTodosStore((s) => s.completeTodo);
  const snoozeTodo = useTodosStore((s) => s.snoozeTodo);
  const [text, setText] = useState("");
  const [showAlert, setShowAlert] = useState(false);
  const [alertAt, setAlertAt] = useState("");

  useEffect(() => {
    loadTodos();
  }, [loadTodos]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    addTodo(trimmed, alertAt ? new Date(alertAt).toISOString() : null);
    setText("");
    setAlertAt("");
    setShowAlert(false);
  }

  function handleDictated(dictated: string) {
    setText((prev) => (prev.trim() ? `${prev.trim()} ${dictated}` : dictated));
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="mb-3 text-[0.78rem] font-semibold text-[var(--ink)]">Todos</div>
      {todos.length === 0 ? (
        <p className="py-4 text-center text-[0.82rem] text-[var(--ink-faint)]">
          Nothing on the list yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {todos.map((todo) => (
            <li key={todo.id} className="flex items-start gap-2">
              <button
                type="button"
                title="Mark done"
                onClick={() => completeTodo(todo.id)}
                className="mt-0.5 h-4 w-4 flex-shrink-0 rounded-[5px] border-[1.5px] border-[var(--line)]"
              />
              <div className="flex-1">
                <span className="text-[0.85rem] text-[var(--ink)]">{todo.text}</span>
                {todo.alert_at && (
                  <div className="mt-0.5 flex items-center gap-1.5 text-[0.68rem] text-[var(--ink-faint)]">
                    <span>
                      Reminder{" "}
                      {new Date(todo.alert_at).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {todo.snooze_count > 0 &&
                        ` — snoozed ${todo.snooze_count}×`}
                    </span>
                    <button
                      type="button"
                      onClick={() => snoozeTodo(todo.id)}
                      className="text-[var(--moss-deep)] underline decoration-dotted"
                    >
                      Snooze
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-1.5">
        <div className="flex gap-2">
          <div className="flex-1 rounded-lg border border-[var(--line)] bg-[var(--paper)]">
            <GhostTextField
              value={text}
              onValueChange={setText}
              placeholder="Add a todo"
              aria-label="New todo"
              className="px-2.5 py-1.5 text-[0.82rem] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
            />
          </div>
          <MicButton onTranscribed={handleDictated} />
          <button
            type="button"
            onClick={() => setShowAlert((v) => !v)}
            aria-pressed={showAlert}
            title="Set a reminder time"
            className="flex-shrink-0 rounded-lg border px-2.5 py-1.5 text-[0.78rem]"
            style={{
              borderColor: showAlert || alertAt ? "var(--moss)" : "var(--line)",
              color: showAlert || alertAt ? "var(--moss-deep)" : "var(--ink-soft)",
              background: showAlert || alertAt ? "var(--moss-pale)" : "transparent",
            }}
          >
            Remind me
          </button>
          {text.trim() && (
            <button
              type="submit"
              className="flex-shrink-0 rounded-lg bg-[var(--moss)] px-3 py-1.5 text-[0.78rem] text-white"
            >
              Add
            </button>
          )}
        </div>
        {showAlert && (
          <input
            type="datetime-local"
            value={alertAt}
            onChange={(e) => setAlertAt(e.target.value)}
            aria-label="Reminder time"
            className="rounded-lg border border-[var(--line)] bg-[var(--paper)] px-2.5 py-1.5 text-[0.78rem] text-[var(--ink)] outline-none"
          />
        )}
      </form>
    </div>
  );
}
