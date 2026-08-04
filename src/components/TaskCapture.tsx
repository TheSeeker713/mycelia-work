import { useState, type FormEvent } from "react";
import type { NewTaskInput } from "../store/tasksStore";
import { MicButton } from "./MicButton";

/** Frictionless single-field capture — title and Enter is the whole flow. Tag/billable are opt-in, revealed only once there's something to attach them to. */
export function TaskCapture({ onAdd }: { onAdd: (input: NewTaskInput) => void }) {
  const [title, setTitle] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [tag, setTag] = useState("");
  const [billable, setBillable] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    onAdd({ title: trimmed, tag: tag.trim() || undefined, billable });
    setTitle("");
    setTag("");
    setBillable(false);
    setShowDetails(false);
  }

  function handleDictated(text: string) {
    setTitle((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text));
  }

  return (
    <form onSubmit={handleSubmit} className="mb-3">
      <div className="flex items-center gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What are you working on?"
          aria-label="New task title"
          className="w-full rounded-[10px] border border-[var(--moss)] bg-[var(--paper)] px-3 py-2.5 text-[0.92rem] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
        />
        <MicButton onTranscribed={handleDictated} />
        {/*
          A form with two or more text fields has no implicit default
          button per the HTML spec, so once "+ tag / billable" adds a
          second field, Enter alone stops submitting. This button is the
          form's real default submit control either way — Enter keeps
          working once details are open, not just when the title is the
          only field.
        */}
        {title.trim() && (
          <button
            type="submit"
            aria-label="Add task"
            className="flex-shrink-0 rounded-[10px] bg-[var(--moss)] px-3 py-2.5 text-[0.85rem] text-white"
          >
            Add
          </button>
        )}
      </div>
      {title.trim() && !showDetails && (
        <button
          type="button"
          onClick={() => setShowDetails(true)}
          className="mt-1 text-[0.74rem] text-[var(--ink-faint)]"
        >
          + tag / billable
        </button>
      )}
      {showDetails && (
        <div className="mt-2 flex items-center gap-2">
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="tag (optional)"
            aria-label="Task tag"
            className="flex-1 rounded-lg border border-[var(--line)] bg-[var(--paper)] px-2 py-1.5 text-[0.8rem] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
          />
          <label className="flex items-center gap-1 text-[0.78rem] text-[var(--ink-soft)]">
            <input
              type="checkbox"
              checked={billable}
              onChange={(e) => setBillable(e.target.checked)}
            />
            billable
          </label>
        </div>
      )}
    </form>
  );
}
