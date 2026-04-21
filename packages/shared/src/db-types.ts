// @design-house/shared/db-types

// ── MessageRole ───────────────────────────────────────────────────

export type MessageRole = "user" | "assistant" | "tool_use" | "tool_result";

// ── ProjectRow ────────────────────────────────────────────────────

export interface ProjectRow {
  slug: string;
  name: string;
  created_at: string;       // ISO 8601
  last_activity_at: string; // ISO 8601
}

// ── SessionRow ────────────────────────────────────────────────────

export interface SessionRow {
  project_slug: string;
  cc_session_id: string | null; // null before first turn
  turn_count: number;
  created_at: string;           // ISO 8601
  last_used_at: string;         // ISO 8601
}

// ── MessageRow ────────────────────────────────────────────────────

export interface MessageRow {
  id: string;                // ULID
  project_slug: string;
  role: MessageRole;
  content: string;
  tool_use_id: string | null;
  tool_name: string | null;
  is_error: 0 | 1 | null;   // SQLite has no boolean
  created_at: string;        // ISO 8601
}
