import { create, type StoreApi, type UseBoundStore } from "zustand";
import type { Repositories } from "../data";
import {
  DECLINE_MESSAGE,
  MAX_CLARIFY_ROUNDS,
  matchProjectExact,
  routeCapture,
  type CaptureLayer1Result,
} from "../services/captureAgent";
import type { OllamaClient } from "../services/ollamaClient";
import type { OpenClawClient } from "../services/openclawClient";

export type CapturePhase =
  | "idle"
  | "thinking"
  | "clarify"
  | "project_pick"
  | "confirmed"
  | "declined"
  | "blocked_no_session";

export type FiledAction = "create_note" | "create_todo" | "create_milestone";

export interface ConfirmedFiling {
  action: FiledAction;
  id: string;
  /** What shows in the confirmation toast. */
  summary: string;
  /** The underlying text — reused as-is if the user corrects this to a different destination, so nothing has to be retyped. */
  rawText: string;
}

export interface PendingMilestone {
  milestoneName: string;
  targetDate: string | null;
}

export interface CaptureState {
  phase: CapturePhase;
  clarifyQuestion: string | null;
  pendingMilestone: PendingMilestone | null;
  declineMessage: string | null;
  confirmed: ConfirmedFiling | null;
  submit: (text: string, activeSessionId: string | null) => Promise<void>;
  respondToClarify: (text: string, activeSessionId: string | null) => Promise<void>;
  pickProjectForMilestone: (projectId: string) => Promise<void>;
  /** note<->todo, or todo/note -> milestone (which reopens project_pick) — never milestone -> milestone, there's nothing to correct to. */
  correctTo: (action: "create_note" | "create_todo" | "milestone", activeSessionId: string | null) => Promise<void>;
  /** Back to idle from confirmed/declined/blocked_no_session. */
  dismiss: () => void;
}

/** Shown when the agent resolves to create_note (directly, via clarify fallback, or via a correction) but nothing's clocked in — notes have always required an active task_session (Phase 2's data model). */
export const NO_SESSION_MESSAGE = "Clock into a task first — notes need something to attach to.";

export function createCaptureStore(
  repos: Repositories,
  deps: { ollamaClient: OllamaClient; openClawClient: OpenClawClient },
): UseBoundStore<StoreApi<CaptureState>> {
  let originalText = "";
  let clarifyRound = 0;

  return create<CaptureState>((set, get) => {
    async function fileNote(body: string, activeSessionId: string | null) {
      if (!activeSessionId) {
        set({ phase: "blocked_no_session" });
        return;
      }
      const note = await repos.notes.create(activeSessionId, body);
      set({
        phase: "confirmed",
        confirmed: { action: "create_note", id: note.id, summary: note.body, rawText: note.body },
      });
    }

    async function fileTodo(text: string, alertAt: string | null) {
      const todo = await repos.todos.create(text, alertAt);
      set({
        phase: "confirmed",
        confirmed: { action: "create_todo", id: todo.id, summary: todo.text, rawText: todo.text },
      });
    }

    async function handleResult(result: CaptureLayer1Result, activeSessionId: string | null) {
      switch (result.action) {
        case "decline":
          set({ phase: "declined", declineMessage: DECLINE_MESSAGE });
          return;

        case "clarify": {
          if (clarifyRound >= MAX_CLARIFY_ROUNDS) {
            await fileNote(originalText, activeSessionId);
            return;
          }
          clarifyRound += 1;
          set({ phase: "clarify", clarifyQuestion: result.clarifyingQuestion });
          return;
        }

        case "create_note":
          await fileNote(result.payload.body, activeSessionId);
          return;

        case "create_todo":
          await fileTodo(result.payload.text, result.payload.alertAt);
          return;

        case "create_milestone": {
          const projects = await repos.projects.list();
          const match = matchProjectExact(result.payload.projectTitleHint, projects);
          if (!match) {
            set({
              phase: "project_pick",
              pendingMilestone: {
                milestoneName: result.payload.milestoneName,
                targetDate: result.payload.targetDate,
              },
            });
            return;
          }
          const milestone = await repos.milestones.create(
            match.id,
            result.payload.milestoneName,
            result.payload.targetDate,
          );
          set({
            phase: "confirmed",
            confirmed: {
              action: "create_milestone",
              id: milestone.id,
              summary: `${milestone.name} — ${match.title}`,
              rawText: milestone.name,
            },
          });
          return;
        }
      }
    }

    return {
      phase: "idle",
      clarifyQuestion: null,
      pendingMilestone: null,
      declineMessage: null,
      confirmed: null,

      async submit(text, activeSessionId) {
        originalText = text;
        clarifyRound = 0;
        set({ phase: "thinking", declineMessage: null, confirmed: null, clarifyQuestion: null });
        const result = await routeCapture(text, deps);
        await handleResult(result, activeSessionId);
      },

      async respondToClarify(text, activeSessionId) {
        const question = get().clarifyQuestion;
        if (!question) return;
        set({ phase: "thinking" });
        const result = await routeCapture(text, deps, { originalText, question });
        await handleResult(result, activeSessionId);
      },

      async pickProjectForMilestone(projectId) {
        const pending = get().pendingMilestone;
        if (!pending) return;
        const [milestone, projects] = await Promise.all([
          repos.milestones.create(projectId, pending.milestoneName, pending.targetDate),
          repos.projects.list(),
        ]);
        const project = projects.find((p) => p.id === projectId);
        set({
          phase: "confirmed",
          pendingMilestone: null,
          confirmed: {
            action: "create_milestone",
            id: milestone.id,
            summary: project ? `${milestone.name} — ${project.title}` : milestone.name,
            rawText: milestone.name,
          },
        });
      },

      async correctTo(action, activeSessionId) {
        const current = get().confirmed;
        if (!current) return;

        if (current.action === "create_note") await repos.notes.delete(current.id);
        else if (current.action === "create_todo") await repos.todos.delete(current.id);
        else await repos.milestones.delete(current.id);

        if (action === "create_note") {
          await fileNote(current.rawText, activeSessionId);
        } else if (action === "create_todo") {
          await fileTodo(current.rawText, null);
        } else {
          set({
            phase: "project_pick",
            confirmed: null,
            pendingMilestone: { milestoneName: current.rawText, targetDate: null },
          });
        }
      },

      dismiss() {
        set({
          phase: "idle",
          clarifyQuestion: null,
          pendingMilestone: null,
          declineMessage: null,
          confirmed: null,
        });
      },
    };
  });
}

export type CaptureStore = ReturnType<typeof createCaptureStore>;
