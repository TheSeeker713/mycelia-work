import { useEffect, useState, type FormEvent } from "react";
import { useCaptureLogClient, useOpenClawClient, useProjectsStore, useSettingsStore } from "../../store/StoreProvider";
import type {
  Milestone,
  Project,
  ProjectAssistNote,
  ProjectPriority,
  ProjectReport,
  ProjectStatus,
} from "../../data";
import { DateTimePicker } from "../DateTimePicker";
import { ASSIST_ACTION_LABEL, runProjectAssist, type AssistAction } from "../../services/projectAssist";

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

const ASSIST_ACTIONS: AssistAction[] = ["sub_tasks", "scheduling_suggestion", "tighten_description"];

/**
 * Sub-tasks, scheduling suggestion, tighten description, and freeform
 * ask are real kept content now — Jeremy's own testing found the
 * original "shown once, discarded on exit" design surprising, so every
 * successful run is saved to project_assist_notes and shown as history
 * below the action buttons, same treatment as status reports. A failed
 * run (couldn't reach the model) isn't saved — nothing meaningful to
 * keep there — but still logged via captureLogClient, same as before.
 */
function AssistPanel({ project, notes }: { project: Project; notes: ProjectAssistNote[] | undefined }) {
  const openClawClient = useOpenClawClient();
  const captureLogClient = useCaptureLogClient();
  const saveAssistNote = useProjectsStore((s) => s.saveAssistNote);
  const grok4Enabled = useSettingsStore((s) => s.grok4Enabled);
  const localModelId = useSettingsStore((s) => s.localModelId);
  const [running, setRunning] = useState<AssistAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAsk, setShowAsk] = useState(false);
  const [askText, setAskText] = useState("");

  async function runAction(action: AssistAction, question?: string) {
    setRunning(action);
    setError(null);
    const text = await runProjectAssist(action, project, openClawClient, question, grok4Enabled, localModelId);
    setRunning(null);
    if (text) {
      await saveAssistNote(project.id, action, text, question ?? null);
    } else {
      setError("Couldn't get an answer just now — try again in a moment.");
    }
    await captureLogClient.logAiAssist({
      occurredAt: new Date().toISOString(),
      projectId: project.id,
      action,
      resultSummary: text ?? undefined,
    });
  }

  const list = notes ?? [];

  return (
    <div className="mt-3 border-t border-dashed border-[var(--line)] pt-3">
      <div className="mb-1.5 text-[0.7rem] tracking-wide text-[var(--ink-faint)] uppercase">AI assist</div>
      <div className="flex flex-wrap gap-1.5">
        {ASSIST_ACTIONS.map((action) => (
          <button
            key={action}
            type="button"
            onClick={() => void runAction(action)}
            disabled={running !== null}
            className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[0.72rem] text-[var(--ink-soft)] disabled:opacity-50"
          >
            {ASSIST_ACTION_LABEL[action]}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowAsk(true)}
          disabled={running !== null}
          className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[0.72rem] text-[var(--ink-soft)] disabled:opacity-50"
        >
          Ask
        </button>
      </div>

      {showAsk && (
        <div className="mt-2 flex items-center gap-1.5">
          <input
            value={askText}
            onChange={(e) => setAskText(e.target.value)}
            placeholder="Ask about this project..."
            aria-label="Ask about this project"
            className="flex-1 rounded-lg border border-[var(--line)] bg-[var(--paper)] px-2 py-1 text-[0.76rem] text-[var(--ink)] outline-none"
          />
          <button
            type="button"
            onClick={() => {
              const q = askText.trim();
              if (!q) return;
              setAskText("");
              setShowAsk(false);
              void runAction("freeform_ask", q);
            }}
            className="rounded-lg bg-[var(--moss)] px-2.5 py-1 text-[0.72rem] text-white"
          >
            Go
          </button>
        </div>
      )}

      {running && <p className="mt-2 text-[0.76rem] text-[var(--ink-faint)]">Thinking…</p>}

      {error && (
        <div className="mt-2 rounded-lg border border-[var(--line)] p-2">
          <p className="text-[0.8rem] text-[var(--rust)]">{error}</p>
          <button type="button" onClick={() => setError(null)} className="mt-1 text-[0.7rem] text-[var(--ink-faint)]">
            Dismiss
          </button>
        </div>
      )}

      {list.length > 0 && (
        <ul className="mt-2 flex flex-col gap-2">
          {list.map((note) => (
            <li key={note.id} className="rounded-lg border border-[var(--line)] p-2">
              <div className="mb-1 flex items-center justify-between text-[0.66rem] text-[var(--ink-faint)]">
                <span>
                  {ASSIST_ACTION_LABEL[note.action as AssistAction] ?? note.action}
                  {note.question ? ` — "${note.question}"` : ""}
                </span>
                <span className="tabular-nums">
                  {new Date(note.created_at).toLocaleString([], {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <p className="text-[0.8rem] whitespace-pre-wrap text-[var(--ink)]">{note.content}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Status reports are real kept content (unlike the assist panel above) — this is their actual in-app home, per the plan. */
function ReportsSection({ project, reports }: { project: Project; reports: ProjectReport[] | undefined }) {
  const generateReport = useProjectsStore((s) => s.generateReport);
  const [generating, setGenerating] = useState(false);

  async function handleGenerate() {
    setGenerating(true);
    await generateReport(project);
    setGenerating(false);
  }

  const list = reports ?? [];

  return (
    <div className="mt-3 border-t border-dashed border-[var(--line)] pt-3">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[0.7rem] tracking-wide text-[var(--ink-faint)] uppercase">Status reports</span>
        <button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={generating}
          className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[0.7rem] text-[var(--ink-soft)] disabled:opacity-50"
        >
          {generating ? "Writing…" : "Write status report"}
        </button>
      </div>
      {list.length === 0 ? (
        <p className="text-[0.78rem] text-[var(--ink-faint)]">None yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((r) => (
            <li key={r.id} className="rounded-lg border border-[var(--line)] p-2 text-[0.8rem]">
              <div className="mb-1 text-[0.66rem] text-[var(--ink-faint)] tabular-nums">
                {new Date(r.generated_at).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
              {r.status === "pending" && <span className="text-[var(--ink-faint)]">Writing…</span>}
              {r.status === "failed" && (
                <span className="text-[var(--rust)]">Failed{r.failure_reason ? ` — ${r.failure_reason}` : ""}</span>
              )}
              {r.status === "ok" && <p className="whitespace-pre-wrap text-[var(--ink)]">{r.content}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProjectDetail({
  project,
  milestones,
  reports,
  assistNotes,
  onBack,
}: {
  project: Project;
  milestones: Milestone[] | undefined;
  reports: ProjectReport[] | undefined;
  assistNotes: ProjectAssistNote[] | undefined;
  onBack: () => void;
}) {
  const updateProject = useProjectsStore((s) => s.updateProject);
  const archiveProject = useProjectsStore((s) => s.archiveProject);
  const deleteProject = useProjectsStore((s) => s.deleteProject);
  const completeMilestone = useProjectsStore((s) => s.completeMilestone);
  const deleteMilestone = useProjectsStore((s) => s.deleteMilestone);
  const loadReports = useProjectsStore((s) => s.loadReports);
  const loadAssistNotes = useProjectsStore((s) => s.loadAssistNotes);

  useEffect(() => {
    loadReports(project.id);
    loadAssistNotes(project.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const [title, setTitle] = useState(project.title);
  const [description, setDescription] = useState(project.description ?? "");
  const [status, setStatus] = useState<ProjectStatus>(project.status);
  const [priority, setPriority] = useState<ProjectPriority>(project.priority);
  const [targetMonth, setTargetMonth] = useState(project.target_month);
  const [targetDatetime, setTargetDatetime] = useState(project.target_datetime);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await updateProject(project.id, {
      title: title.trim() || project.title,
      description: description.trim() || null,
      status,
      priority,
      targetMonth,
      targetDatetime,
    });
    setSaving(false);
    // Closes the card and returns to the list — per Jeremy's testing
    // feedback, hitting Save with no visible result read as broken.
    onBack();
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
    // Capped and centered so full-screen mode (where this panel's
    // parent stretches edge-to-edge across a real monitor at 2x zoom)
    // doesn't turn a simple stacked form into unreadably wide input
    // fields — pocket mode is already narrower than max-w-xl, so this
    // has no visible effect there.
    <div className="mx-auto flex h-full w-full max-w-xl flex-col overflow-y-auto">
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
          <input
            type="month"
            value={targetMonth}
            onChange={(e) => setTargetMonth(e.target.value)}
            aria-label="Target month"
            className="rounded-lg border border-[var(--line)] bg-[var(--paper)] px-2 py-1.5 text-[0.76rem] text-[var(--ink)]"
          />
        </label>
        <div className="flex flex-col gap-1">
          <span className="text-[0.66rem] tracking-wide text-[var(--ink-faint)] uppercase">
            Completion goal (optional)
          </span>
          <DateTimePicker value={targetDatetime} onChange={setTargetDatetime} />
        </div>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="rounded-lg bg-[var(--moss)] px-3 py-1.5 text-[0.78rem] text-white disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save changes"}
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

      <AssistPanel project={project} notes={assistNotes} />
      <ReportsSection project={project} reports={reports} />

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
  const reportsByProject = useProjectsStore((s) => s.reportsByProject);
  const assistNotesByProject = useProjectsStore((s) => s.assistNotesByProject);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [priority, setPriority] = useState<ProjectPriority>("medium");
  const [completionGoal, setCompletionGoal] = useState<string | null>(null);
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
    addProject({ title: trimmed, targetMonth: month, priority, targetDatetime: completionGoal });
    setTitle("");
    setPriority("medium");
    setCompletionGoal(null);
    setShowForm(false);
  }

  const expanded = projects.find((p) => p.id === expandedProjectId) ?? null;

  if (expanded) {
    return (
      <ProjectDetail
        project={expanded}
        milestones={milestonesByProject[expanded.id]}
        reports={reportsByProject[expanded.id]}
        assistNotes={assistNotesByProject[expanded.id]}
        onBack={() => setExpandedProjectId(null)}
      />
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="mb-3 text-[0.78rem] font-semibold text-[var(--ink)]">Projects</div>
      {projects.length === 0 ? (
        <p className="py-4 text-center text-[0.82rem] text-[var(--ink-faint)]">
          No projects yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
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
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                aria-label="Target month"
                className="rounded-lg border border-[var(--line)] bg-[var(--paper)] px-2 py-1.5 text-[0.78rem] text-[var(--ink)]"
              />
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
          <div className="flex flex-col gap-1">
            <span className="text-[0.68rem] tracking-wide text-[var(--ink-faint)] uppercase">
              Completion goal (optional)
            </span>
            <DateTimePicker value={completionGoal} onChange={setCompletionGoal} />
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
