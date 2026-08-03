# Phase 1 — Visual design mockup

`phase1-mockup.html` is the approved design reference for the pocket-book
shell, reviewed live with Jeremy across four revisions (also published as
a Claude Artifact during review — this file is the durable, version-controlled
copy so the design doesn't only exist behind an external link).

Open it directly in a browser to click through all states, including the
Projects/Kanban board (5th pull-tab, "Projects" — compact read-only preview
in the pocket view, full board behind "Expand to full board").

## What it establishes

- **Palette**: warm paper neutrals (`#f5f3ec` light default), moss-green
  accent, amber for todos/alerts, muted rust reserved for stopped/urgent
  states. Both light and dark themes fully specified — light is the
  default everywhere, dark is a real user setting, not banned.
- **Shape**: a compact 340×480 "pocket book" window, not a dashboard.
  Secondary content (Tasks, Notes, Todos, Library) lives as pull-tab
  compartments on the same view, not separate screens you need a map to
  find.
- **Notes**: zen mode (full-screen writing) auto-timestamps each new
  paragraph, autosaves continuously, and clears back to empty on close —
  everything written gets archived into a **library** (organized into
  user-created **books** with title/subject/author, or left unfiled) that
  supports full-text reading and an "Edit with AI" prompt per note.
  Inline AI ghost-text suggestions appear while typing (Tab to accept).
- **Idle handling**: a soft, auto-dismissing toast for short idle gaps
  (not a blocking dialog), separate from the forgot-to-clock-out
  check-in for long gaps.
- **Forgot-to-clock-out check-in**: tappable bucketed answers for the
  simple case, plus a free-text "something else" path that opens a real
  adaptive back-and-forth for a genuinely chaotic day, resolving into
  multiple separate estimated time blocks instead of one guess.
- **Recap**: a plain-language daily/weekly summary card (not a chat),
  pulling from the same logged sessions and todos as everything else.
- **Shell behavior**: always-on-top toggle and system tray minimization
  are core, not Phase-5 add-ons — the tray/pocket-book shell likely needs
  to be built before timer functionality is wired back in during Phase 4.
- **Projects/Kanban (added rev 4)**: a fifth pull-tab, "Projects," alongside
  Tasks/Notes/Todos/Library. The pocket view shows a compact, genuinely
  read-only preview (top 3 projects by month then priority). "Expand to
  full board" opens a full-screen view with two switchable views over the
  same project data — **Board** (columns = planned/in progress/done,
  drag-and-drop between columns) and **Timeline** (columns = month,
  cards priority-sorted within each). Projects contain Tasks (a project
  card shows linked-task progress, e.g. "1/2 tasks"). Clicking a card
  opens a detail view with its description, linked tasks, an inline
  "+ link a task" form, and a "✨ Ask AI" panel with four actions: break
  into sub-tasks (with a real "add as tasks" apply), suggest
  scheduling/priority, tighten the description, and a freeform ask-
  anything box. A "+ New project" form creates projects with title,
  description, target month, and priority.

## Known limitation carried into this file

The dark-mode theming fix that landed during review (custom-property
scoping — `color` doesn't re-resolve on inheritance the way `--ink` does)
is a real CSS lesson worth remembering when Phase 3 rebuilds this for
real in Tailwind: any component that doesn't explicitly reference a
themed token itself will inherit an already-resolved value from its
ancestor, not a live one.
