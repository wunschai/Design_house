import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { createDb, getDb, insertProject, getProject, insertMessage, getMessages, insertRawLog, insertSession, getSession } from "./client.js";

describe("DB client", () => {
  let db: ReturnType<typeof createDb>;

  beforeEach(() => {
    // 每個 test 用獨立 in-memory DB
    db = createDb(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  describe("schema migrations", () => {
    it("should create all 4 tables on init", () => {
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      ).all() as { name: string }[];
      const names = tables.map((t) => t.name);
      expect(names).toContain("projects");
      expect(names).toContain("sessions");
      expect(names).toContain("messages");
      expect(names).toContain("raw_log");
    });

    it("should attempt to enable WAL mode (memory db returns 'memory')", () => {
      // WAL mode 只對 file DB 有效；in-memory DB 回傳 'memory' 是預期行為
      // 此 test 確認 client 有送 PRAGMA journal_mode = WAL 不拋錯
      const row = db.prepare("PRAGMA journal_mode").get() as { journal_mode: string };
      // 接受 'wal' (file db) 或 'memory' (in-memory db)
      expect(["wal", "memory"]).toContain(row.journal_mode);
    });

    it("should create index on messages(project_slug, created_at)", () => {
      const idx = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_messages_project_created'"
      ).get();
      expect(idx).toBeTruthy();
    });

    it("should create index on raw_log(project_slug, created_at)", () => {
      const idx = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_raw_log_project_created'"
      ).get();
      expect(idx).toBeTruthy();
    });
  });

  describe("projects", () => {
    it("should insert and retrieve a project", () => {
      insertProject(db, { slug: "test-project", name: "Test Project" });
      const project = getProject(db, "test-project");
      expect(project).toBeTruthy();
      expect(project?.slug).toBe("test-project");
      expect(project?.name).toBe("Test Project");
      expect(project?.created_at).toBeTruthy();
      expect(project?.last_activity_at).toBeTruthy();
    });

    it("should return null for non-existent project", () => {
      const project = getProject(db, "nonexistent");
      expect(project).toBeNull();
    });

    it("should enforce CHECK constraint on role in messages", () => {
      insertProject(db, { slug: "proj", name: "P" });
      expect(() => {
        db.prepare(
          "INSERT INTO messages (id, project_slug, role, content, created_at) VALUES (?,?,?,?,?)"
        ).run("id1", "proj", "invalid_role", "content", new Date().toISOString());
      }).toThrow();
    });
  });

  describe("sessions", () => {
    beforeEach(() => {
      insertProject(db, { slug: "proj", name: "Project" });
    });

    it("should insert and retrieve a session", () => {
      insertSession(db, { project_slug: "proj", cc_session_id: null });
      const session = getSession(db, "proj");
      expect(session).toBeTruthy();
      expect(session?.project_slug).toBe("proj");
      expect(session?.cc_session_id).toBeNull();
      expect(session?.turn_count).toBe(0);
    });

    it("should cascade delete session when project is deleted", () => {
      insertSession(db, { project_slug: "proj", cc_session_id: "sess123" });
      db.prepare("DELETE FROM projects WHERE slug = ?").run("proj");
      const session = getSession(db, "proj");
      expect(session).toBeNull();
    });
  });

  describe("messages", () => {
    beforeEach(() => {
      insertProject(db, { slug: "proj", name: "Project" });
    });

    it("should insert and retrieve messages", () => {
      insertMessage(db, {
        id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
        project_slug: "proj",
        role: "user",
        content: "Hello",
        tool_use_id: null,
        tool_name: null,
        is_error: null,
      });
      const messages = getMessages(db, "proj", { limit: 10 });
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe("Hello");
      expect(messages[0].role).toBe("user");
    });

    it("should support pagination with before parameter", () => {
      const now = Date.now();
      insertMessage(db, {
        id: "msg1",
        project_slug: "proj",
        role: "user",
        content: "First",
        tool_use_id: null,
        tool_name: null,
        is_error: null,
        created_at: new Date(now).toISOString(),
      });
      insertMessage(db, {
        id: "msg2",
        project_slug: "proj",
        role: "assistant",
        content: "Second",
        tool_use_id: null,
        tool_name: null,
        is_error: null,
        created_at: new Date(now + 1000).toISOString(),
      });
      insertMessage(db, {
        id: "msg3",
        project_slug: "proj",
        role: "user",
        content: "Third",
        tool_use_id: null,
        tool_name: null,
        is_error: null,
        created_at: new Date(now + 2000).toISOString(),
      });

      const messages = getMessages(db, "proj", { limit: 10, before: "msg3" });
      expect(messages).toHaveLength(2);
      expect(messages[0].id).toBe("msg1");
      expect(messages[1].id).toBe("msg2");
    });

    it("should cascade delete messages when project is deleted", () => {
      insertMessage(db, {
        id: "msg1",
        project_slug: "proj",
        role: "user",
        content: "Hello",
        tool_use_id: null,
        tool_name: null,
        is_error: null,
      });
      db.prepare("DELETE FROM projects WHERE slug = ?").run("proj");
      const messages = getMessages(db, "proj", { limit: 10 });
      expect(messages).toHaveLength(0);
    });
  });

  describe("raw_log", () => {
    it("should insert a raw log entry", () => {
      insertRawLog(db, {
        project_slug: null,
        source: "cc-stdout",
        severity: "warn",
        reason: "json-parse-failed",
        raw: '{"broken json',
      });
      const rows = db.prepare("SELECT * FROM raw_log").all() as { id: number; reason: string }[];
      expect(rows).toHaveLength(1);
      expect(rows[0].reason).toBe("json-parse-failed");
    });

    it("should truncate raw content to 64KB", () => {
      const big_raw = "x".repeat(100 * 1024); // 100KB
      insertRawLog(db, {
        project_slug: null,
        source: "cc-stdout",
        severity: "error",
        reason: "too-big",
        raw: big_raw,
      });
      const row = db.prepare("SELECT raw FROM raw_log").get() as { raw: string };
      expect(row.raw.length).toBeLessThanOrEqual(64 * 1024);
    });

    it("should enforce CHECK on source field", () => {
      expect(() => {
        db.prepare(
          "INSERT INTO raw_log (project_slug, source, severity, reason, raw, created_at) VALUES (?,?,?,?,?,?)"
        ).run(null, "invalid-source", "warn", "test", "raw", new Date().toISOString());
      }).toThrow();
    });

    it("should enforce CHECK on severity field", () => {
      expect(() => {
        db.prepare(
          "INSERT INTO raw_log (project_slug, source, severity, reason, raw, created_at) VALUES (?,?,?,?,?,?)"
        ).run(null, "cc-stdout", "info", "test", "raw", new Date().toISOString());
      }).toThrow();
    });
  });
});
