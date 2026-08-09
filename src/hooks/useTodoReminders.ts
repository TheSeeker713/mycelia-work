import { useEffect } from "react";
import { sendNotification } from "@tauri-apps/plugin-notification";
import { useTodosStoreApi } from "../store/StoreProvider";
import { useSelfVoicing } from "./useSelfVoicing";

/** Todos have minute-granularity alert times (a datetime-local input) — 30s keeps worst-case notification lag well under a minute without being a noisy poll. */
export const TODO_REMINDER_POLL_INTERVAL_MS = 30_000;

/**
 * Real due-time alerts for todos, per Jeremy's explicit ask: when a
 * todo's alert time arrives, a real Windows system notification AND the
 * AI voice speaking "{todo text} is due" — both, at once, not either/or.
 * `alert_at` used to be write-once at creation and purely displayed;
 * nothing ever checked "is this due now" before this.
 *
 * Mounted unconditionally in Dashboard (like useIdleWatcher) so it runs
 * regardless of which compartment tab is open — it calls loadTodos()
 * itself on every tick rather than trusting whatever's already in the
 * store, since todosStore only otherwise loads when the Todos tab has
 * actually been opened.
 *
 * `alerted_at` (persisted, not an in-memory guard) is what stops a due
 * todo from re-notifying on every subsequent poll — set the instant a
 * reminder fires, before anything else, so a slow notification/voice
 * call can't cause a duplicate on the next tick.
 */
export function useTodoReminders(): void {
  const todosStore = useTodosStoreApi();
  const selfVoicing = useSelfVoicing();

  useEffect(() => {
    const id = setInterval(async () => {
      await todosStore.getState().loadTodos();
      const now = Date.now();
      const due = todosStore
        .getState()
        .todos.filter(
          (t) => t.alert_at && !t.done && !t.alerted_at && new Date(t.alert_at).getTime() <= now,
        );

      for (const todo of due) {
        await todosStore.getState().markAlerted(todo.id);
        try {
          sendNotification({ title: "Mycelia Time", body: `${todo.text} is due` });
        } catch {
          // Best-effort — the spoken cue below still fires either way.
        }
        selfVoicing.speak(`${todo.text} is due.`);
      }
    }, TODO_REMINDER_POLL_INTERVAL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
