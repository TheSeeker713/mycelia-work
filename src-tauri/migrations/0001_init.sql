CREATE TABLE tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  tag TEXT,
  billable INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE TABLE task_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks (id),
  clocked_in_at TEXT NOT NULL,
  clocked_out_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'on_break', 'stopped')),
  is_estimated INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE session_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_session_id INTEGER NOT NULL REFERENCES task_sessions (id),
  type TEXT NOT NULL CHECK (
    type IN (
      'clock_in',
      'break_start',
      'break_resume',
      'clock_out',
      'reconstructed'
    )
  ),
  occurred_at TEXT NOT NULL
);

CREATE TABLE notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_session_id INTEGER NOT NULL REFERENCES task_sessions (id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  alert_at TEXT,
  snooze_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE journals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER REFERENCES tasks (id),
  task_session_id INTEGER REFERENCES task_sessions (id),
  generated_at TEXT NOT NULL,
  model_used TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'ok', 'failed')),
  content TEXT,
  exported_path TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('session', 'weekly'))
);

CREATE TABLE resource_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_at TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (
    kind IN ('throttled', 'deferred_job', 'killed_subprocess')
  ),
  detail TEXT
);

CREATE INDEX idx_task_sessions_task_id ON task_sessions (task_id);
CREATE INDEX idx_task_sessions_status ON task_sessions (status);
CREATE INDEX idx_session_events_session_id ON session_events (task_session_id);
CREATE INDEX idx_notes_session_id ON notes (task_session_id);
CREATE INDEX idx_todos_alert_at ON todos (alert_at);
