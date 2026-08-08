export type CompartmentName =
  | "tasks"
  | "notes"
  | "todos"
  | "projects"
  | "progress"
  | "library"
  | "settings";

const TABS: { name: CompartmentName; label: string }[] = [
  { name: "tasks", label: "Tasks" },
  { name: "notes", label: "Notes" },
  { name: "todos", label: "Todos" },
  { name: "projects", label: "Projects" },
  { name: "progress", label: "Progress" },
  { name: "library", label: "Library" },
  { name: "settings", label: "Settings" },
];

export function CompartmentTabs({
  active,
  onSelect,
}: {
  active: CompartmentName;
  onSelect: (name: CompartmentName) => void;
}) {
  return (
    <div className="absolute top-[52px] right-0 z-10 flex flex-col gap-[5px]">
      {TABS.map((tab) => (
        <button
          key={tab.name}
          type="button"
          onClick={() => onSelect(tab.name)}
          aria-pressed={active === tab.name}
          className="rounded-l-[7px] px-1.5 py-2 text-[0.6rem] font-medium tracking-wide text-white uppercase"
          style={{
            background: active === tab.name ? "var(--moss-deep)" : "var(--moss)",
            writingMode: "vertical-rl",
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
