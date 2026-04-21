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

// ── RawLogRow ─────────────────────────────────────────────────────
// Edge-case 9 (spec): captures unexpected / syntactically invalid payloads
// from CC stdout/stderr or the MCP callback path for post-mortem debugging.
// Events that ADR-004 marks as "expected skip" (rate_limit_event, thinking,
// tool_use.caller, etc.) MUST NOT be written here.

export type RawLogSource = "cc-stdout" | "cc-stderr" | "mcp-callback" | "internal";
export type RawLogSeverity = "warn" | "error";

export interface RawLogRow {
  id: number;                              // AUTOINCREMENT
  project_slug: string | null;             // may be unknown at log time
  source: RawLogSource;
  severity: RawLogSeverity;
  reason: string;                          // e.g. 'json-parse-failed' / 'unknown-event-type'
  raw: string;                             // truncated to 64 KB
  created_at: string;                      // ISO 8601
}
