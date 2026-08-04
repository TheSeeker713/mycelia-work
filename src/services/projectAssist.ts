import voiceNotes from "../../docs/reference/authentic-voice-notes.md?raw";
import type { Project, ProjectReport, Repositories } from "../data";
import type { OpenClawClient } from "./openclawClient";

export type AssistAction = "sub_tasks" | "scheduling_suggestion" | "tighten_description" | "freeform_ask";

export const ASSIST_ACTION_LABEL: Record<AssistAction, string> = {
  sub_tasks: "Sub-tasks",
  scheduling_suggestion: "Scheduling suggestion",
  tighten_description: "Tighten description",
  freeform_ask: "Ask",
};

function projectContext(project: Project): string {
  return `Project: ${project.title}\nDescription: ${project.description ?? "(none)"}\nStatus: ${project.status}\nTarget month: ${project.target_month}`;
}

/**
 * These four are transient — shown once, not persisted as their own
 * rows (per the plan: "anything that isn't meant to persist as app
 * content ... toast, then discard from view, but still logged locally
 * per Phase 9's logging policy"). Only the status report (a separate
 * function below) gets a real database home.
 */
export function buildAssistPrompt(action: AssistAction, project: Project, freeformQuestion?: string): string {
  const context = projectContext(project);
  switch (action) {
    case "sub_tasks":
      return `${context}\n\nBreak this project down into a short list of concrete sub-tasks. Return them as a plain bulleted list, nothing else — no preamble, no closing summary.`;
    case "scheduling_suggestion":
      return `${context}\n\nSuggest a realistic target timeframe for finishing this project, with one short sentence of reasoning. Be concise — 2-3 sentences total.`;
    case "tighten_description":
      return `${context}\n\nRewrite the project description to be tighter and clearer, 2-3 sentences max. Return only the rewritten description, nothing else.`;
    case "freeform_ask":
      return `${context}\n\n${freeformQuestion ?? ""}`;
  }
}

/** Fails soft to null (not throwing) — the assist panel treats a null result the same as any other "couldn't get an answer" case. */
export async function runProjectAssist(
  action: AssistAction,
  project: Project,
  client: OpenClawClient,
  freeformQuestion?: string,
): Promise<string | null> {
  try {
    const result = await client.runOnce({
      sessionKey: `project-assist-${project.id}`,
      message: buildAssistPrompt(action, project, freeformQuestion),
      timeoutSecs: 45,
    });
    return result.text.trim() || null;
  } catch {
    return null;
  }
}

/**
 * The status report *is* real kept content — same idea as the session
 * journal (docs/reference/authentic-voice-notes.md included directly
 * in the prompt, same as journal generation, so it reads in Jeremy's
 * actual voice rather than generic AI-report tone), persisted to
 * project_reports rather than shown once and discarded. No file export
 * — its home is the project's own report/history surface in-app, per
 * the plan.
 */
export function buildStatusReportPrompt(project: Project): string {
  return `${voiceNotes}

---

Using the voice rules above, write a short first-person status update
as Jeremy on the project below — where it stands, what's been done,
what's next. A few sentences, not a full journal entry. Output ONLY
the status update text itself — no preamble, no meta-commentary, no
markdown title.

${projectContext(project)}`;
}

/** Always resolves the report to `ok` or `failed` — never leaves it dangling `pending` on a thrown error, same contract as runJournalGeneration. */
export async function runProjectReportGeneration(params: {
  repos: Pick<Repositories, "projectReports">;
  client: OpenClawClient;
  reportId: string;
  project: Project;
}): Promise<ProjectReport> {
  const { repos, client, reportId, project } = params;
  try {
    const result = await client.runOnce({
      sessionKey: `project-report-${project.id}`,
      message: buildStatusReportPrompt(project),
      timeoutSecs: 180,
    });
    await repos.projectReports.markResult(reportId, { status: "ok", content: result.text, modelUsed: result.model });
  } catch (err) {
    const failureReason = err instanceof Error ? err.message : String(err);
    await repos.projectReports.markResult(reportId, { status: "failed", failureReason });
  }
  const updated = (await repos.projectReports.listByProject(project.id)).find((r) => r.id === reportId);
  if (!updated) {
    throw new Error(`project report ${reportId} disappeared during generation`);
  }
  return updated;
}
