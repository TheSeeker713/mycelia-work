import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useRewardsClient } from "../store/StoreProvider";

type Phase = "sequence" | "password";

/**
 * Help > "this should not be here" opens this. Per Jeremy's exact spec
 * (2026-08-04): a blank panel, three left-clicks, then type "111",
 * then Enter — with zero visual feedback along the way, since the
 * whole point is that nothing here looks like it's doing anything.
 * Only a correct password prompt (after the sequence lands) is meant
 * to be visibly a "thing happening." Any wrong step along the way
 * resets silently rather than erroring, matching the same "no visual
 * clue" rule.
 *
 * This is not a real security boundary — the sequence and the password
 * hash are both readable in this public repo's source, and Jeremy
 * confirmed that's an accepted tradeoff, not an oversight (see
 * src-tauri/src/rewards.rs). It's a deliberate "hidden from casual
 * discovery" gate, and the assets it eventually unlocks live entirely
 * outside this repo and the build output, which is the part that
 * actually matters.
 */
export function HiddenUnlockPanel({
  onUnlocked,
  onCancel,
}: {
  onUnlocked: () => void;
  onCancel: () => void;
}) {
  const rewardsClient = useRewardsClient();
  const [phase, setPhase] = useState<Phase>("sequence");
  const [password, setPassword] = useState("");
  const [wrongPassword, setWrongPassword] = useState(false);
  const clicksRef = useRef(0);
  const typedRef = useRef("");
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  function reset() {
    clicksRef.current = 0;
    typedRef.current = "";
  }

  function handleClick() {
    if (typedRef.current.length > 0) {
      // Typing had already started — a click now invalidates the attempt.
      reset();
      return;
    }
    clicksRef.current += 1;
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      onCancel();
      return;
    }
    if (e.key === "Enter") {
      if (clicksRef.current === 3 && typedRef.current === "111") {
        setPhase("password");
      } else {
        reset();
      }
      return;
    }
    if (clicksRef.current !== 3 || e.key !== "1") {
      reset();
      return;
    }
    typedRef.current += "1";
  }

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    // Fails closed like every other backend call in this app — an
    // unreachable check reads the same as a wrong password, not a crash.
    const correct = await rewardsClient.verifyPassword(password).catch(() => false);
    if (correct) {
      onUnlocked();
    } else {
      setWrongPassword(true);
      setPassword("");
    }
  }

  if (phase === "password") {
    return (
      <div
        role="dialog"
        aria-label="Unlock rewards"
        className="absolute inset-3 flex flex-col justify-center rounded-[14px] border p-4"
        style={{ background: "var(--paper-card)", borderColor: "var(--line)" }}
      >
        <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-2">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-label="Password"
            autoFocus
            className="rounded-lg border border-[var(--line)] bg-[var(--paper)] px-2.5 py-2 text-[0.85rem] text-[var(--ink)] outline-none"
          />
          {wrongPassword && (
            <p className="text-[0.72rem] text-[var(--rust)]">Incorrect.</p>
          )}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="rounded-lg bg-[var(--moss)] px-3 py-1.5 text-[0.78rem] text-white"
            >
              Continue
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="text-[0.75rem] text-[var(--ink-faint)]"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      role="button"
      tabIndex={0}
      aria-label="blank"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className="absolute inset-3 outline-none"
      style={{ background: "var(--paper)" }}
    />
  );
}
