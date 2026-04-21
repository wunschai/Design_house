// @design-house/shared/db-types.test.ts
import { describe, it, expectTypeOf } from "vitest";
import type {
  ProjectRow,
  SessionRow,
  MessageRow,
  MessageRole,
} from "./db-types.js";

// ── ProjectRow ────────────────────────────────────────────────────

describe("ProjectRow", () => {
  it("should have string slug", () => {
    expectTypeOf<ProjectRow["slug"]>().toEqualTypeOf<string>();
  });

  it("should have string name", () => {
    expectTypeOf<ProjectRow["name"]>().toEqualTypeOf<string>();
  });

  it("should have string created_at (ISO 8601)", () => {
    expectTypeOf<ProjectRow["created_at"]>().toEqualTypeOf<string>();
  });

  it("should have string last_activity_at (ISO 8601)", () => {
    expectTypeOf<ProjectRow["last_activity_at"]>().toEqualTypeOf<string>();
  });

  it("should be assignable from a valid row object", () => {
    const row: ProjectRow = {
      slug: "my-project",
      name: "My Project",
      created_at: "2026-04-20T00:00:00Z",
      last_activity_at: "2026-04-20T01:00:00Z",
    };
    expectTypeOf(row).toMatchTypeOf<ProjectRow>();
  });
});

// ── SessionRow ────────────────────────────────────────────────────

describe("SessionRow", () => {
  it("should have string project_slug", () => {
    expectTypeOf<SessionRow["project_slug"]>().toEqualTypeOf<string>();
  });

  it("should have nullable cc_session_id", () => {
    expectTypeOf<SessionRow["cc_session_id"]>().toEqualTypeOf<string | null>();
  });

  it("should have number turn_count", () => {
    expectTypeOf<SessionRow["turn_count"]>().toEqualTypeOf<number>();
  });

  it("should have string created_at", () => {
    expectTypeOf<SessionRow["created_at"]>().toEqualTypeOf<string>();
  });

  it("should have string last_used_at", () => {
    expectTypeOf<SessionRow["last_used_at"]>().toEqualTypeOf<string>();
  });

  it("should be assignable with null cc_session_id (first turn)", () => {
    const row: SessionRow = {
      project_slug: "my-project",
      cc_session_id: null,
      turn_count: 0,
      created_at: "2026-04-20T00:00:00Z",
      last_used_at: "2026-04-20T00:00:00Z",
    };
    expectTypeOf(row).toMatchTypeOf<SessionRow>();
  });

  it("should be assignable with non-null cc_session_id (after first turn)", () => {
    const row: SessionRow = {
      project_slug: "my-project",
      cc_session_id: "session-abc-123",
      turn_count: 3,
      created_at: "2026-04-20T00:00:00Z",
      last_used_at: "2026-04-20T02:00:00Z",
    };
    expectTypeOf(row).toMatchTypeOf<SessionRow>();
  });
});

// ── MessageRow ────────────────────────────────────────────────────

describe("MessageRow", () => {
  it("should have string id (ULID)", () => {
    expectTypeOf<MessageRow["id"]>().toEqualTypeOf<string>();
  });

  it("should have string project_slug", () => {
    expectTypeOf<MessageRow["project_slug"]>().toEqualTypeOf<string>();
  });

  it("should have MessageRole role", () => {
    expectTypeOf<MessageRow["role"]>().toEqualTypeOf<MessageRole>();
  });

  it("should have string content", () => {
    expectTypeOf<MessageRow["content"]>().toEqualTypeOf<string>();
  });

  it("should have nullable tool_use_id", () => {
    expectTypeOf<MessageRow["tool_use_id"]>().toEqualTypeOf<string | null>();
  });

  it("should have nullable tool_name", () => {
    expectTypeOf<MessageRow["tool_name"]>().toEqualTypeOf<string | null>();
  });

  it("should have is_error as 0 | 1 | null (SQLite no bool)", () => {
    expectTypeOf<MessageRow["is_error"]>().toEqualTypeOf<0 | 1 | null>();
  });

  it("should have string created_at", () => {
    expectTypeOf<MessageRow["created_at"]>().toEqualTypeOf<string>();
  });

  it("should be assignable as user message row", () => {
    const row: MessageRow = {
      id: "01HX000000000000000000000",
      project_slug: "my-project",
      role: "user",
      content: "Hello",
      tool_use_id: null,
      tool_name: null,
      is_error: null,
      created_at: "2026-04-20T00:00:00Z",
    };
    expectTypeOf(row).toMatchTypeOf<MessageRow>();
  });

  it("should be assignable as tool_use message row", () => {
    const row: MessageRow = {
      id: "01HX000000000000000000001",
      project_slug: "my-project",
      role: "tool_use",
      content: '{"path":"index.html"}',
      tool_use_id: "tool-123",
      tool_name: "read_file",
      is_error: null,
      created_at: "2026-04-20T00:00:00Z",
    };
    expectTypeOf(row).toMatchTypeOf<MessageRow>();
  });

  it("should be assignable as tool_result with is_error = 1", () => {
    const row: MessageRow = {
      id: "01HX000000000000000000002",
      project_slug: "my-project",
      role: "tool_result",
      content: "File not found",
      tool_use_id: "tool-123",
      tool_name: null,
      is_error: 1,
      created_at: "2026-04-20T00:00:00Z",
    };
    expectTypeOf(row).toMatchTypeOf<MessageRow>();
  });
});

// ── MessageRole ───────────────────────────────────────────────────

describe("MessageRole", () => {
  it("should include user", () => {
    const role: MessageRole = "user";
    expectTypeOf(role).toMatchTypeOf<MessageRole>();
  });

  it("should include assistant", () => {
    const role: MessageRole = "assistant";
    expectTypeOf(role).toMatchTypeOf<MessageRole>();
  });

  it("should include tool_use", () => {
    const role: MessageRole = "tool_use";
    expectTypeOf(role).toMatchTypeOf<MessageRole>();
  });

  it("should include tool_result", () => {
    const role: MessageRole = "tool_result";
    expectTypeOf(role).toMatchTypeOf<MessageRole>();
  });
});
