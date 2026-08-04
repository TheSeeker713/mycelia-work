import { useEffect, useState, type FormEvent } from "react";
import { useProjectsStore } from "../../store/StoreProvider";
import type { Milestone, Project, ProjectPriority, ProjectStatus } from "../../data";

const PRIORITY_LABEL: Record<ProjectPriority, string> = { high: "high", medium: "medium", low: "low" };
const STATUS_LABEL: Record<ProjectStatus, string> = {
  planned: "Planned",
  in_progress: "In progress",
  done: "Done",
};

function MilestoneTrail({ milestones }: { milestones: Milestone[] | undefined }) {
  if (!milestones || milestones.length === 0) return null;
  const done = milestones.filter((m) => m.completed_at).length;
  return (
    <div className="mt-1 flex items-center gap-1">
      <div className="flex gap-0.5">
        {milestones.map((m) => (
          <span
            key={m.id}
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: m.completed_at ? "var(--moss)" : "var(--line)" }}
          />
        ))}
      </div>
      <span className="text-[0.66rem] text-[var(--ink-faint)]">
        {done}/{milestones.length} milestones
      </span>
    </div>
  );
}

function ProjectCard({
  project,
  milestones,
  onOpen,
}: {
  project: Project;
  milestones: Milestone[] | undefined;
  onOpen: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="w-full rounded-lg border border-[var(--line)] px-2.5 py-2 text-left"
      >
        <div className="text-[0.85rem] text-[var(--ink)]">{project.title}</div>
        <div className="mt-1 flex gap-1.5 text-[0.66rem]">
          <span className="rounded-full bg-[var(--moss-pale)] px-2 py-0.5 text-[var(--moss-deep)]">
            {project.target_month}
          </span>
          <span className="rounded-full bg-[var(--amber-pale)] px-2 py-0.5 text-[var(--amber)]">
            {PRIORITY_LABEL[project.priority]}
          </span>
          <span className="rounded-full px-2 py-0.5 text-[var(--ink-soft)]" style={{ background: "var(--line)" }}>
            {STATUS_LABEL[project.status]}
          </span>
        </div>
        <MilestoneTrail milestones={milestones} />
      </button>
    </li>
  );
}

function ProjectDetail({
  project,
  milestones,
  onBack,
}: {
  project: Project;
  milestones: Milestone[] | undefined;
  onBack: () => void;
}) {
  const updateProject = useProjectsStore((s) => s.updateProject);
  const archiveProject = useProjectsStore((s) => s.archiveProject);
  const deleteProject = useProjectsStore((s) => s.deleteProject);
  const completeMilestone = useProjectsStore((s) => s.completeMilestone);
  const deleteMilestone = useProjectsStore((s) => s.deleteMilestone);

  const [title, setTitle] = useState(project.title);
  const [description, setDescription] = useState(project.description ?? "");
  const [status, setStatus] = useState<ProjectStatus>(project.status);
  const [priority, setPriority] = useState<ProjectPriority>(project.priority);
  const [targetMonth, setTargetMonth] = useState(project.target_month);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function handleSave() {
    await updateProject(project.id, {
      title: title.trim() || project.title,
      description: description.trim() || null,
      status,
      priority,
      targetMonth,
    });
  }

  async function handleArchive() {
    await archiveProject(project.id);
    onBack();
  }

  async function handleDelete() {
    await deleteProject(project.id);
    onBack();
  }

  const list = milestones ?? [];

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <button
        type="button"
        onClick={onBack}
        className="mb-2 self-start text-[0.75rem] text-[var(--ink-faint)]"
      >
        ← Back to projects
      </button>

      <div className="flex flex-col gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Project title"
          className="rounded-lg border border-[var(--line)] bg-[var(--paper)] px-2.5 py-1.5 text-[0.88rem] font-semibold text-[var(--ink)] outline-none"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What's this project about..."
          rows={2}
          aria-label="Project description"
          className="resize-none rounded-lg border border-[var(--line)] bg-[var(--paper)] px-2.5 py-1.5 text-[0.8rem] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
        />
        <div className="flex gap-2">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-[0.66rem] tracking-wide text-[var(--ink-faint)] uppercase">Status</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ProjectStatus)}
              className="rounded-lg border border-[var(--line)] bg-[var(--paper)] px-2 py-1.5 text-[0.76rem] text-[var(--ink)]"
            >
              <option value="planned">Planned</option>
              <option value="in_progress">In progress</option>
              <option value="done">Done</option>
            </select>
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-[0.66rem] tracking-wide text-[var(--ink-faint)] uppercase">Priority</span>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as ProjectPriority)}
              className="rounded-lg border border-[var(--line)] bg-[var(--paper)] px-2 py-1.5 text-[0.76rem] text-[var(--ink)]"
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-[0.66rem] tracking-wide text-[var(--ink-faint)] uppercase">Target month</span>
          <select
            value={targetMonth}
            onChange={(e) => setTargetMonth(e.target.value)}
            className="rounded-lg border border-[var(--line)] bg-[var(--paper)] px-2 py-1.5 text-[0.76rem] text-[var(--ink)]"
          >
            <option value="2026-09">September</option>
            <option value="2026-10">October</option>
            <option value="2026-11">November</option>
            <option value="2026-12">December</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => void handleSave()}
          className="rounded-lg bg-[var(--moss)] px-3 py-1.5 text-[0.78rem] text-white"
        >
          Save changes
        </button>
      </div>

      <div className="mt-3 border-t border-dashed border-[var(--line)] pt-3">
        <div className="mb-1.5 text-[0.7rem] tracking-wide text-[var(--ink-faint)] uppercase">
          Milestones
        </div>
        {list.length === 0 ? (
          <p className="text-[0.78rem] text-[var(--ink-faint)]">
            None yet — capture one with "finished X for this project" in the capture drawer.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {list.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 text-[0.8rem]">
                <label className="flex flex-1 items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={!!m.completed_at}
                    onChange={() => !m.completed_at && completeMilestone(project.id, m.id)}
                  />
                  <span
                    style={{
                      textDecoration: m.completed_at ? "line-through" : "none",
                      color: m.completed_at ? "var(--ink-faint)" : "var(--ink)",
                    }}
                  >
                    {m.name}
                  </span>
                  {m.target_date && (
                    <span className="text-[0.68rem] text-[var(--ink-faint)]">{m.target_date}</span>
                  )}
                </label>
                <button
                  type="button"
                  onClick={() => deleteMilestone(project.id, m.id)}
                  aria-label={`Remove milestone ${m.name}`}
                  className="text-[0.72rem] text-[var(--ink-faint)]"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-dashed border-[var(--line)] pt-3">
        <button
          type="button"
          onClick={() => void handleArchive()}
          className="rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-[0.75rem] text-[var(--ink-soft)]"
        >
          Archive
        </button>
        {confirmingDelete ? (
          <>
            <span className="text-[0.75rem] text-[var(--rust)]">Delete for good?</span>
            <button
              type="button"
              onClick={() => void handleDelete()}
              className="rounded-lg px-2.5 py-1.5 text-[0.75rem] text-white"
              style={{ background: "var(--rust)" }}
            >
              Yes, delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="text-[0.75rem] text-[var(--ink-faint)]"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="text-[0.75rem] text-[var(--ink-faint)]"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

/** The full board deferred out of Phase 4's minimal compartment (Phase 10) — compact card list with click-to-expand detail, reusing the same pull-out expand pattern the rest of the app already uses rather than a separate drag-drop Kanban surface, which doesn't fit the pocket card's real estate. */
export function ProjectsCompartment() {
  const projects = useProjectsStore((s) => s.projects);
  const loadProjects = useProjectsStore((s) => s.loadProjects);
  const addProject = useProjectsStore((s) => s.addProject);
  const milestonesByProject = useProjectsStore((s) => s.milestonesByProject);
  const loadMilestones = useProjectsStore((s) => s.loadMilestones);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [month, setMonth] = useState("2026-09");
  const [priority, setPriority] = useState<ProjectPriority>("medium");
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    for (const p of projects) loadMilestones(p.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects.length]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    addProject({ title: trimmed, targetMonth: month, priority });
    setTitle("");
    setPriority("medium");
    setShowForm(false);
  }

  const expanded = projects.find((p) => p.id === expandedProjectId) ?? null;

  if (expanded) {
    return (
      <ProjectDetail
        project={expanded}
        milestones={milestonesByProject[expanded.id]}
        onBack={() => setExpandedProjectId(null)}
      />
    );
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
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              milestones={milestonesByProject[project.id]}
              onOpen={() => setExpandedProjectId(project.id)}
            />
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
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-[0.68rem] tracking-wide text-[var(--ink-faint)] uppercase">
                Target month
              </span>
              <select
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="rounded-lg border border-[var(--line)] bg-[var(--paper)] px-2 py-1.5 text-[0.78rem] text-[var(--ink)]"
              >
                <option value="2026-09">September</option>
                <option value="2026-10">October</option>
                <option value="2026-11">November</option>
              </select>
            </label>
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-[0.68rem] tracking-wide text-[var(--ink-faint)] uppercase">
                Priority
              </span>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as ProjectPriority)}
                className="rounded-lg border border-[var(--line)] bg-[var(--paper)] px-2 py-1.5 text-[0.78rem] text-[var(--ink)]"
              >
                <option value="high">High priority</option>
                <option value="medium">Medium priority</option>
                <option value="low">Low priority</option>
              </select>
            </label>
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
