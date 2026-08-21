import type { SqlExecutor } from "./sqlExecutor";
import { applyMigrations } from "./schema";
import { createProjectsRepository } from "./repositories/projectsRepository";
import { createTasksRepository } from "./repositories/tasksRepository";
import { createTaskSessionsRepository } from "./repositories/taskSessionsRepository";
import { createSessionEventsRepository } from "./repositories/sessionEventsRepository";
import { createNotesRepository } from "./repositories/notesRepository";
import { createTodosRepository } from "./repositories/todosRepository";
import { createJournalsRepository } from "./repositories/journalsRepository";
import { createJournalEntriesRepository } from "./repositories/journalEntriesRepository";
import { createResourceEventsRepository } from "./repositories/resourceEventsRepository";
import { createSettingsRepository } from "./repositories/settingsRepository";
import { createMilestonesRepository } from "./repositories/milestonesRepository";
import { createProjectReportsRepository } from "./repositories/projectReportsRepository";
import { createGamificationRepository } from "./repositories/gamificationRepository";
import { createProjectAssistNotesRepository } from "./repositories/projectAssistNotesRepository";
import { createActivityEventsRepository } from "./repositories/activityEventsRepository";

export * from "./types";
export * from "./sqlExecutor";
export { applyMigrations, MIGRATIONS } from "./schema";
export { createTauriSqlExecutor } from "./tauriSqlExecutor";

export function createRepositories(executor: SqlExecutor) {
  return {
    projects: createProjectsRepository(executor),
    tasks: createTasksRepository(executor),
    taskSessions: createTaskSessionsRepository(executor),
    sessionEvents: createSessionEventsRepository(executor),
    notes: createNotesRepository(executor),
    todos: createTodosRepository(executor),
    journals: createJournalsRepository(executor),
    journalEntries: createJournalEntriesRepository(executor),
    resourceEvents: createResourceEventsRepository(executor),
    settings: createSettingsRepository(executor),
    milestones: createMilestonesRepository(executor),
    projectReports: createProjectReportsRepository(executor),
    gamification: createGamificationRepository(executor),
    projectAssistNotes: createProjectAssistNotesRepository(executor),
    activityEvents: createActivityEventsRepository(executor),
  };
}

export type Repositories = ReturnType<typeof createRepositories>;

/** Convenience: applies migrations and hands back a ready-to-use repository bundle. */
export async function initDatabase(executor: SqlExecutor): Promise<Repositories> {
  await applyMigrations(executor);
  return createRepositories(executor);
}
