-- Design_house SQLite schema — owned by backend
-- WAL mode is set at connection time (PRAGMA journal_mode=WAL)

CREATE TABLE IF NOT EXISTS projects (
  slug             TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  created_at       TEXT NOT NULL,
  last_activity_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  project_slug  TEXT PRIMARY KEY REFERENCES projects(slug) ON DELETE CASCADE,
  cc_session_id TEXT,
  turn_count    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  last_used_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id           TEXT PRIMARY KEY,
  project_slug TEXT NOT NULL REFERENCES projects(slug) ON DELETE CASCADE,
  role         TEXT NOT NULL CHECK (role IN ('user','assistant','tool_use','tool_result')),
  content      TEXT NOT NULL,
  tool_use_id  TEXT,
  tool_name    TEXT,
  is_error     INTEGER,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_project_created ON messages(project_slug, created_at);

CREATE TABLE IF NOT EXISTS raw_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  project_slug TEXT REFERENCES projects(slug) ON DELETE SET NULL,
  source       TEXT NOT NULL CHECK (source IN ('cc-stdout','cc-stderr','mcp-callback','internal')),
  severity     TEXT NOT NULL CHECK (severity IN ('warn','error')),
  reason       TEXT NOT NULL,
  raw          TEXT NOT NULL,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_raw_log_project_created ON raw_log(project_slug, created_at);
