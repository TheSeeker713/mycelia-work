import { useEffect, useState, type FormEvent } from "react";
import { useProjectsStore } from "../../store/StoreProvider";
import type { ProjectPriority } from "../../data";

const PRIORITY_LABEL: Record<ProjectPriority, string> = {
  high: "high",
  medium: "medium",
  low: "low",
};

/**
 * Compact preview + create form only — the full Kanban board (drag-drop,
 * Board/Timeline views, AI assist) is real scope from the approved
 * design but big enough to be its own step, not squeezed into the
 * pull-tab shell.
 */
export function ProjectsCompartment() {
  const projects = useProjectsStore((s) => s.projects);
  const loadProjects = useProjectsStore((s) => s.loadProjects);
  const addProject = useProjectsStore((s) => s.addProject);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [month, setMonth] = useState("2026-09");
  const [priority, setPriority] = useState<ProjectPriority>("medium");

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    addProject({ title: trimmed, targetMonth: month, priority });
    setTitle("");
    setPriority("medium");
    setShowForm(false);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 text-[0.78rem] font-semibold text-[var(--ink)]">Projects</div>
      {projects.length === 0 ? (
        <p className="py-4 text-center text-[0.82rem] text-[var(--ink-faint)]">
          No projects yet.
        </p>
      ) : (
        <ul className="flex flex-1 flex-col gap-2 overflow-y-auto">
          {projects.slice(0, 3).map((project) => (
            <li
              key={project.id}
              className="rounded-lg border border-[var(--line)] px-2.5 py-2"
            >
              <div className="text-[0.85rem] text-[var(--ink)]">{project.title}</div>
              <div className="mt-1 flex gap-1.5 text-[0.66rem]">
                <span className="rounded-full bg-[var(--moss-pale)] px-2 py-0.5 text-[var(--moss-deep)]">
                  {project.target_month}
                </span>
                <span className="rounded-full bg-[var(--amber-pale)] px-2 py-0.5 text-[var(--amber)]">
                  {PRIORITY_LABEL[project.priority]}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {!showForm && (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="mt-3 rounded-lg border border-dashed border-[var(--line)] px-3 py-2 text-[0.78rem] text-[var(--ink-faint)]"
        >
          + New project
        </button>
      )}
      {showForm && (
        <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Project title"
            aria-label="New project title"
            className="rounded-lg border border-[var(--line)] bg-[var(--paper)] px-2.5 py-1.5 text-[0.82rem] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
          />
          <div className="flex gap-2">
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              aria-label="Target month"
              className="flex-1 rounded-lg border border-[var(--line)] bg-[var(--paper)] px-2 py-1.5 text-[0.78rem] text-[var(--ink)]"
            >
              <option value="2026-09">September</option>
              <option value="2026-10">October</option>
              <option value="2026-11">November</option>
            </select>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as ProjectPriority)}
              aria-label="Priority"
              className="flex-1 rounded-lg border border-[var(--line)] bg-[var(--paper)] px-2 py-1.5 text-[0.78rem] text-[var(--ink)]"
            >
              <option value="high">High priority</option>
              <option value="medium">Medium priority</option>
              <option value="low">Low priority</option>
            </select>
          </div>
          <button
            type="submit"
            className="rounded-lg bg-[var(--moss)] px-3 py-1.5 text-[0.78rem] text-white"
          >
            Save project
          </button>
        </form>
      )}
    </div>
  );
}
