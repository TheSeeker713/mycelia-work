import { useState } from "react";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * A real calendar + time picker (Phase 10.2) — the plan explicitly
 * asked for something that "feels polished, not a bare native input,"
 * so this builds an actual month grid and hour/minute selects rather
 * than delegating to `<input type="datetime-local">`, whose rendering
 * varies wildly across platforms and doesn't match this app's own
 * paper aesthetic at all.
 */
export function DateTimePicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (iso: string | null) => void;
}) {
  const parsed = value ? new Date(value) : null;
  const [tab, setTab] = useState<"date" | "time">("date");
  const [viewYear, setViewYear] = useState(parsed ? parsed.getFullYear() : new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed ? parsed.getMonth() : new Date().getMonth());

  const selectedDay =
    parsed && parsed.getFullYear() === viewYear && parsed.getMonth() === viewMonth
      ? parsed.getDate()
      : null;
  const hour = parsed?.getHours() ?? 0;
  const minute = parsed?.getMinutes() ?? 0;

  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const totalDays = daysInMonth(viewYear, viewMonth);
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];

  function commit(day: number, h: number, m: number) {
    onChange(new Date(viewYear, viewMonth, day, h, m, 0, 0).toISOString());
  }

  function prevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  }

  return (
    <div className="rounded-lg border border-[var(--line)] p-2">
      <div className="mb-2 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setTab("date")}
          aria-pressed={tab === "date"}
          className="rounded-full px-2 py-0.5 text-[0.7rem]"
          style={{
            background: tab === "date" ? "var(--moss-pale)" : "transparent",
            color: tab === "date" ? "var(--moss-deep)" : "var(--ink-faint)",
          }}
        >
          Date
        </button>
        <button
          type="button"
          onClick={() => setTab("time")}
          aria-pressed={tab === "time"}
          className="rounded-full px-2 py-0.5 text-[0.7rem]"
          style={{
            background: tab === "time" ? "var(--moss-pale)" : "transparent",
            color: tab === "time" ? "var(--moss-deep)" : "var(--ink-faint)",
          }}
        >
          Time
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="ml-auto text-[0.7rem] text-[var(--ink-faint)]"
          >
            Clear
          </button>
        )}
      </div>

      {value && parsed && (
        <p className="mb-2 text-[0.75rem] text-[var(--ink-soft)]">
          {parsed.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })} at{" "}
          {pad2(hour)}:{pad2(minute)}
        </p>
      )}

      {tab === "date" ? (
        <div>
          <div className="mb-1 flex items-center justify-between">
            <button type="button" onClick={prevMonth} aria-label="Previous month" className="px-1 text-[var(--ink-soft)]">
              ‹
            </button>
            <span className="text-[0.78rem] text-[var(--ink)]">
              {MONTH_LABELS[viewMonth]} {viewYear}
            </span>
            <button type="button" onClick={nextMonth} aria-label="Next month" className="px-1 text-[var(--ink-soft)]">
              ›
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center text-[0.62rem] text-[var(--ink-faint)]">
            {WEEKDAY_LABELS.map((w, i) => (
              <div key={i}>{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((day, i) =>
              day === null ? (
                <div key={i} />
              ) : (
                <button
                  key={i}
                  type="button"
                  onClick={() => commit(day, hour, minute)}
                  aria-pressed={selectedDay === day}
                  aria-label={`${MONTH_LABELS[viewMonth]} ${day}, ${viewYear}`}
                  className="rounded py-0.5 text-[0.72rem]"
                  style={{
                    background: selectedDay === day ? "var(--moss)" : "transparent",
                    color: selectedDay === day ? "white" : "var(--ink)",
                  }}
                >
                  {day}
                </button>
              ),
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {selectedDay === null ? (
            <span className="text-[0.72rem] text-[var(--ink-faint)]">Pick a date first.</span>
          ) : (
            <>
              <select
                aria-label="Hour"
                value={hour}
                onChange={(e) => commit(selectedDay, Number(e.target.value), minute)}
                className="rounded-lg border border-[var(--line)] bg-[var(--paper)] px-1.5 py-1 text-[0.76rem] text-[var(--ink)]"
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {pad2(h)}
                  </option>
                ))}
              </select>
              <span className="text-[var(--ink-faint)]">:</span>
              <select
                aria-label="Minute"
                value={minute}
                onChange={(e) => commit(selectedDay, hour, Number(e.target.value))}
                className="rounded-lg border border-[var(--line)] bg-[var(--paper)] px-1.5 py-1 text-[0.76rem] text-[var(--ink)]"
              >
                {Array.from({ length: 60 }, (_, m) => (
                  <option key={m} value={m}>
                    {pad2(m)}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      )}
    </div>
  );
}
