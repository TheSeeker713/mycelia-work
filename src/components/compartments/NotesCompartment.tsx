/**
 * Structure only for now — notes attach to a task_session, and the
 * timer/clock-in flow that creates sessions is Phase 5. Real
 * auto-timestamped, autosaving Zen-mode writing lands there; this
 * compartment just holds its place in the pull-tab shell until then.
 */
export function NotesCompartment() {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 text-[0.78rem] font-semibold text-[var(--ink)]">Notes</div>
      <p className="text-[0.82rem] leading-relaxed text-[var(--ink-faint)]">
        Clock into a task to start writing — notes attach to that session's
        log. Timer and clock-in are coming in the next phase.
      </p>
    </div>
  );
}
