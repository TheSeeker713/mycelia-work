import { useEffect, useState, type FormEvent } from "react";
import { useTodosStore } from "../../store/StoreProvider";

export function TodosCompartment() {
  const todos = useTodosStore((s) => s.todos);
  const loadTodos = useTodosStore((s) => s.loadTodos);
  const addTodo = useTodosStore((s) => s.addTodo);
  const completeTodo = useTodosStore((s) => s.completeTodo);
  const [text, setText] = useState("");

  useEffect(() => {
    loadTodos();
  }, [loadTodos]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    addTodo(trimmed);
    setText("");
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 text-[0.78rem] font-semibold text-[var(--ink)]">Todos</div>
      {todos.length === 0 ? (
        <p className="py-4 text-center text-[0.82rem] text-[var(--ink-faint)]">
          Nothing on the list yet.
        </p>
      ) : (
        <ul className="flex flex-1 flex-col gap-1.5 overflow-y-auto">
          {todos.map((todo) => (
            <li key={todo.id} className="flex items-start gap-2">
              <button
                type="button"
                title="Mark done"
                onClick={() => completeTodo(todo.id)}
                className="mt-0.5 h-4 w-4 flex-shrink-0 rounded-[5px] border-[1.5px] border-[var(--line)]"
              />
              <span className="text-[0.85rem] text-[var(--ink)]">{todo.text}</span>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a todo"
          aria-label="New todo"
          className="flex-1 rounded-lg border border-[var(--line)] bg-[var(--paper)] px-2.5 py-1.5 text-[0.82rem] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
        />
        {text.trim() && (
          <button
            type="submit"
            className="flex-shrink-0 rounded-lg bg-[var(--moss)] px-3 py-1.5 text-[0.78rem] text-white"
          >
            Add
          </button>
        )}
      </form>
    </div>
  );
}
