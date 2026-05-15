-- Create session_folders table first (referenced by sessions.folder_id)
CREATE TABLE IF NOT EXISTS session_folders (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- ALTER TABLE sessions: add new columns
ALTER TABLE sessions ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN folder_id TEXT REFERENCES session_folders(id) ON DELETE SET NULL;
ALTER TABLE sessions ADD COLUMN parent_session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL;
ALTER TABLE sessions ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

-- ALTER TABLE projects: add new columns
ALTER TABLE projects ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN icon TEXT;
ALTER TABLE projects ADD COLUMN color TEXT;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_session_folders_project_id ON session_folders(project_id);
CREATE INDEX IF NOT EXISTS idx_sessions_folder_id ON sessions(folder_id);
CREATE INDEX IF NOT EXISTS idx_sessions_parent_session_id ON sessions(parent_session_id);
