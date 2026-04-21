// DB client — better-sqlite3 連線管理與 typed helpers
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import type { ProjectRow, SessionRow, MessageRow, RawLogRow } from "@design-house/shared/db-types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const RAW_MAX_BYTES = 64 * 1024; // 64KB

// ── 建立連線 + 執行 migrations ─────────────────────────────────────

export function createDb(path: string): Database.Database {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // 執行 schema migrations
  const schemaPath = join(__dirname, "schema.sql");
  const schema = readFileSync(schemaPath, "utf-8");
  db.exec(schema);

  return db;
}

// 單例 db instance（supply via env or default path）
let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    const dbPath = process.env["DB_PATH"] ?? join(process.cwd(), ".data", "design_house.db");
    _db = createDb(dbPath);
  }
  return _db;
}

// ── projects helpers ───────────────────────────────────────────────

export function insertProject(
  db: Database.Database,
  args: { slug: string; name: string }
): void {
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO projects (slug, name, created_at, last_activity_at) VALUES (?, ?, ?, ?)"
  ).run(args.slug, args.name, now, now);
}

export function getProject(
  db: Database.Database,
  slug: string
): ProjectRow | null {
  const row = db.prepare("SELECT * FROM projects WHERE slug = ?").get(slug);
  return (row as ProjectRow) ?? null;
}

export function listProjects(db: Database.Database): ProjectRow[] {
  return db.prepare("SELECT * FROM projects ORDER BY last_activity_at DESC").all() as ProjectRow[];
}

export function deleteProject(db: Database.Database, slug: string): void {
  db.prepare("DELETE FROM projects WHERE slug = ?").run(slug);
}

export function updateProjectActivity(db: Database.Database, slug: string): void {
  db.prepare("UPDATE projects SET last_activity_at = ? WHERE slug = ?").run(
    new Date().toISOString(),
    slug
  );
}

// ── sessions helpers ───────────────────────────────────────────────

export function insertSession(
  db: Database.Database,
  args: { project_slug: string; cc_session_id: string | null }
): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO sessions (project_slug, cc_session_id, turn_count, created_at, last_used_at)
     VALUES (?, ?, 0, ?, ?)`
  ).run(args.project_slug, args.cc_session_id, now, now);
}

export function getSession(
  db: Database.Database,
  project_slug: string
): SessionRow | null {
  const row = db.prepare("SELECT * FROM sessions WHERE project_slug = ?").get(project_slug);
  return (row as SessionRow) ?? null;
}

export function updateSessionId(
  db: Database.Database,
  project_slug: string,
  cc_session_id: string | null
): void {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE sessions SET cc_session_id = ?, last_used_at = ? WHERE project_slug = ?`
  ).run(cc_session_id, now, project_slug);
}

export function incrementTurnCount(
  db: Database.Database,
  project_slug: string
): void {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE sessions SET turn_count = turn_count + 1, last_used_at = ? WHERE project_slug = ?`
  ).run(now, project_slug);
}

export function clearSessionId(db: Database.Database, project_slug: string): void {
  db.prepare("UPDATE sessions SET cc_session_id = NULL WHERE project_slug = ?").run(project_slug);
}

// ── messages helpers ───────────────────────────────────────────────

export interface InsertMessageArgs {
  id: string;
  project_slug: string;
  role: MessageRow["role"];
  content: string;
  tool_use_id: string | null;
  tool_name: string | null;
  is_error: 0 | 1 | null;
  created_at?: string;
}

export function insertMessage(
  db: Database.Database,
  args: InsertMessageArgs
): void {
  const created_at = args.created_at ?? new Date().toISOString();
  db.prepare(
    `INSERT INTO messages (id, project_slug, role, content, tool_use_id, tool_name, is_error, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    args.id,
    args.project_slug,
    args.role,
    args.content,
    args.tool_use_id,
    args.tool_name,
    args.is_error,
    created_at
  );
}

export function getMessages(
  db: Database.Database,
  project_slug: string,
  opts: { limit: number; before?: string }
): MessageRow[] {
  if (opts.before) {
    // 取 before 那筆的 created_at，再查之前的
    const ref = db
      .prepare("SELECT created_at FROM messages WHERE id = ?")
      .get(opts.before) as { created_at: string } | undefined;
    if (!ref) return [];
    return db
      .prepare(
        `SELECT * FROM messages
         WHERE project_slug = ? AND created_at < ?
         ORDER BY created_at ASC
         LIMIT ?`
      )
      .all(project_slug, ref.created_at, opts.limit) as MessageRow[];
  }
  return db
    .prepare(
      `SELECT * FROM messages
       WHERE project_slug = ?
       ORDER BY created_at ASC
       LIMIT ?`
    )
    .all(project_slug, opts.limit) as MessageRow[];
}

export function countMessages(db: Database.Database, project_slug: string): number {
  const row = db
    .prepare("SELECT COUNT(*) as cnt FROM messages WHERE project_slug = ?")
    .get(project_slug) as { cnt: number };
  return row.cnt;
}

// ── raw_log helpers ────────────────────────────────────────────────

export interface InsertRawLogArgs {
  project_slug: string | null;
  source: RawLogRow["source"];
  severity: RawLogRow["severity"];
  reason: string;
  raw: string;
}

export function insertRawLog(
  db: Database.Database,
  args: InsertRawLogArgs
): void {
  const truncated = args.raw.slice(0, RAW_MAX_BYTES);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO raw_log (project_slug, source, severity, reason, raw, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(args.project_slug, args.source, args.severity, args.reason, truncated, now);
}
