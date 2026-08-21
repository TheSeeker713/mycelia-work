import type { Repositories } from "../data";

export interface WorkContext {
  activeTaskTitle: string | null;
  activeProjectTitle: string | null;
  recentActivitySummary: string | null;
  recentReportSnippet: string | null;
  bookSnippet: string | null;
}

function snippet(text: string | null | undefined, max = 280): string | null {
  if (!text?.trim()) return null;
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

export async function loadWorkContext(repos: Repositories): Promise<WorkContext> {
  const dangling = await repos.taskSessions.listDangling();
  let activeTaskTitle: string | null = null;
  let activeProjectTitle: string | null = null;
  if (dangling[0]) {
    const task = await repos.tasks.getById(dangling[0].task_id);
    activeTaskTitle = task?.title ?? null;
    if (task?.project_id) {
      const project = await repos.projects.getById(task.project_id);
      activeProjectTitle = project?.title ?? null;
    }
  }

  const recentActivity = await repos.activitySessions.listAcceptedBetween(
    new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    new Date().toISOString(),
  );
  const recentActivitySummary =
    recentActivity.length === 0
      ? null
      : recentActivity
          .slice(0, 8)
          .map((s) => s.label || s.title || s.app)
          .join("; ");

  const reports = await repos.journals.listRecent(3);
  const recentReportSnippet = snippet(reports.find((j) => j.status === "ok")?.content);

  return {
    activeTaskTitle,
    activeProjectTitle,
    recentActivitySummary,
    recentReportSnippet,
    bookSnippet: null,
  };
}

export function formatContextForPrompt(ctx: WorkContext): string {
  const lines: string[] = [];
  if (ctx.activeTaskTitle) lines.push(`Open task: ${ctx.activeTaskTitle}`);
  if (ctx.activeProjectTitle) lines.push(`Project: ${ctx.activeProjectTitle}`);
  if (ctx.recentActivitySummary) lines.push(`Recent activity: ${ctx.recentActivitySummary}`);
  if (ctx.recentReportSnippet) lines.push(`Latest report: ${ctx.recentReportSnippet}`);
  if (ctx.bookSnippet) lines.push(`From the books: ${ctx.bookSnippet}`);
  return lines.length ? `Current context:\n${lines.join("\n")}` : "";
}
