import type { SqlExecutor } from "../sqlExecutor";
import type { Todo } from "../types";
import { fromBool, newId, nowIso, toBool } from "../sqliteUtil";

interface TodoRow {
  id: string;
  text: string;
  done: number;
  alert_at: string | null;
  snooze_count: number;
  created_at: string;
  completed_at: string | null;
  alerted_at: string | null;
}

function mapRow(row: TodoRow): Todo {
  return { ...row, done: toBool(row.done) };
}

export function createTodosRepository(executor: SqlExecutor) {
  return {
    async create(text: string, alertAt: string | null = null): Promise<Todo> {
      const todo: Todo = {
        id: newId(),
        text,
        done: false,
        alert_at: alertAt,
        snooze_count: 0,
        created_at: nowIso(),
        completed_at: null,
        alerted_at: null,
      };
      await executor.execute(
        `INSERT INTO todos (id, text, done, alert_at, snooze_count, created_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          todo.id,
          todo.text,
          fromBool(todo.done),
          todo.alert_at,
          todo.snooze_count,
          todo.created_at,
          todo.completed_at,
        ],
      );
      return todo;
    },

    async list(options: { includeDone?: boolean } = {}): Promise<Todo[]> {
      const rows = options.includeDone
        ? await executor.select<TodoRow>("SELECT * FROM todos ORDER BY created_at")
        : await executor.select<TodoRow>(
            "SELECT * FROM todos WHERE done = 0 ORDER BY created_at",
          );
      return rows.map(mapRow);
    },

    async complete(id: string): Promise<void> {
      await executor.execute(
        "UPDATE todos SET done = 1, completed_at = ? WHERE id = ?",
        [nowIso(), id],
      );
    },

    async snooze(id: string): Promise<void> {
      await executor.execute(
        "UPDATE todos SET snooze_count = snooze_count + 1 WHERE id = ?",
        [id],
      );
    },

    /** Marks a due reminder as having actually fired — persisted so a real alert never refires from a clean slate after an app restart. */
    async markAlerted(id: string): Promise<void> {
      await executor.execute(
        "UPDATE todos SET alerted_at = ? WHERE id = ?",
        [nowIso(), id],
      );
    },

    async delete(id: string): Promise<void> {
      await executor.execute("DELETE FROM todos WHERE id = ?", [id]);
    },
  };
}

export type TodosRepository = ReturnType<typeof createTodosRepository>;
