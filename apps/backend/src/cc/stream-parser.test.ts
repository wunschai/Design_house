import { describe, it, expect, beforeEach } from "vitest";
import { parseStreamLine, _clearBufferForTesting } from "./stream-parser.js";
import { createDb } from "../db/client.js";
import type Database from "better-sqlite3";

let db: Database.Database;

beforeEach(() => {
  db = createDb(":memory:");
  _clearBufferForTesting();
  // 建立測試用專案
  db.prepare("INSERT INTO projects (slug, name, created_at, last_activity_at) VALUES (?,?,?,?)").run(
    "test-proj", "Test", new Date().toISOString(), new Date().toISOString()
  );
});

describe("stream-parser", () => {
  describe("system event", () => {
    it("should skip system init and return no events", () => {
      const line = JSON.stringify({ type: "system", subtype: "init", session_id: "sess123", cwd: "/tmp", model: "claude-3" });
      const events = parseStreamLine(line, "test-proj", "msg-id", db);
      expect(events).toHaveLength(0);
    });
  });

  describe("assistant text event", () => {
    it("should emit chat-delta for text content", () => {
      const line = JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: "Hello world" }] },
        session_id: "sess123",
      });
      const events = parseStreamLine(line, "test-proj", "msg-id", db);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("chat-delta");
      if (events[0].type === "chat-delta") {
        expect(events[0].delta).toBe("Hello world");
        expect(events[0].projectSlug).toBe("test-proj");
      }
    });

    it("should skip thinking content blocks", () => {
      const line = JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "thinking", thinking: "some thinking", signature: "sig" }] },
      });
      const events = parseStreamLine(line, "test-proj", "msg-id", db);
      expect(events).toHaveLength(0);
    });

    it("should emit tool-start for tool_use content blocks", () => {
      const line = JSON.stringify({
        type: "assistant",
        message: {
          content: [{
            type: "tool_use",
            id: "tool-1",
            name: "mcp__design_house__write_file",
            input: { path: "index.html", content: "<html>" },
          }],
        },
      });
      const events = parseStreamLine(line, "test-proj", "msg-id", db);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("tool-start");
      if (events[0].type === "tool-start") {
        expect(events[0].toolUseId).toBe("tool-1");
        expect(events[0].toolName).toBe("mcp__design_house__write_file");
        expect(events[0].inputSummary).toContain("index.html");
      }
    });

    it("should truncate inputSummary at 200 chars", () => {
      const bigInput = { path: "file.html", content: "x".repeat(500) };
      const line = JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "tool_use", id: "t1", name: "write_file", input: bigInput }] },
      });
      const events = parseStreamLine(line, "test-proj", "msg-id", db);
      const toolStart = events.find((e) => e.type === "tool-start");
      expect(toolStart).toBeTruthy();
      if (toolStart?.type === "tool-start") {
        expect(toolStart.inputSummary.length).toBeLessThanOrEqual(201); // 200 + "…"
      }
    });

    it("should ignore caller field in tool_use block", () => {
      const line = JSON.stringify({
        type: "assistant",
        message: {
          content: [{
            type: "tool_use",
            id: "t2",
            name: "read_file",
            input: { path: "x.html" },
            caller: "some-caller",
          }],
        },
      });
      const events = parseStreamLine(line, "test-proj", "msg-id", db);
      expect(events[0].type).toBe("tool-start");
    });

    it("should chunk large deltas into 16KB frames", () => {
      const bigText = "a".repeat(70 * 1024); // 70KB
      const line = JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: bigText }] },
      });
      const events = parseStreamLine(line, "test-proj", "msg-id", db);
      expect(events.length).toBeGreaterThan(1);
      for (const ev of events) {
        if (ev.type === "chat-delta") {
          expect(ev.delta.length).toBeLessThanOrEqual(16 * 1024);
        }
      }
    });
  });

  describe("user tool_result event", () => {
    it("should emit tool-result for tool_result content blocks", () => {
      const line = JSON.stringify({
        type: "user",
        message: {
          content: [{
            type: "tool_result",
            tool_use_id: "tool-1",
            content: "file written",
            is_error: false,
          }],
        },
      });
      const events = parseStreamLine(line, "test-proj", "msg-id", db);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("tool-result");
      if (events[0].type === "tool-result") {
        expect(events[0].toolUseId).toBe("tool-1");
        expect(events[0].isError).toBe(false);
      }
    });

    it("should propagate is_error=true", () => {
      const line = JSON.stringify({
        type: "user",
        message: {
          content: [{
            type: "tool_result",
            tool_use_id: "tool-2",
            content: "error occurred",
            is_error: true,
          }],
        },
      });
      const events = parseStreamLine(line, "test-proj", "msg-id", db);
      expect(events[0].type).toBe("tool-result");
      if (events[0].type === "tool-result") {
        expect(events[0].isError).toBe(true);
      }
    });
  });

  describe("rate_limit_event", () => {
    it("should skip rate_limit_event", () => {
      const line = JSON.stringify({ type: "rate_limit_event", rate_limit_info: {} });
      const events = parseStreamLine(line, "test-proj", "msg-id", db);
      expect(events).toHaveLength(0);
    });
  });

  describe("result events", () => {
    it("should emit turn-end reason:complete for result.success", () => {
      const line = JSON.stringify({
        type: "result",
        subtype: "success",
        result: "done",
        session_id: "sess",
        is_error: false,
      });
      const events = parseStreamLine(line, "test-proj", "msg-id", db);
      expect(events.some((e) => e.type === "turn-end" && e.reason === "complete")).toBe(true);
    });

    it("should emit turn-end reason:error + error CC_MAX_TURNS for error_max_turns", () => {
      const line = JSON.stringify({
        type: "result",
        subtype: "error_max_turns",
        is_error: true,
        terminal_reason: "max_turns",
      });
      const events = parseStreamLine(line, "test-proj", "msg-id", db);
      expect(events.some((e) => e.type === "turn-end" && e.reason === "error")).toBe(true);
      expect(events.some((e) => e.type === "error" && e.code === "CC_MAX_TURNS")).toBe(true);
    });

    it("should emit turn-end reason:error + error CC_EXECUTION_ERROR for error_during_execution", () => {
      const line = JSON.stringify({
        type: "result",
        subtype: "error_during_execution",
        is_error: true,
      });
      const events = parseStreamLine(line, "test-proj", "msg-id", db);
      expect(events.some((e) => e.type === "turn-end" && e.reason === "error")).toBe(true);
      expect(events.some((e) => e.type === "error" && e.code === "CC_EXECUTION_ERROR")).toBe(true);
    });
  });

  describe("error handling", () => {
    it("should write raw_log for JSON parse failure", () => {
      const line = "this is not json{{{";
      const events = parseStreamLine(line, "test-proj", "msg-id", db);
      expect(events).toHaveLength(0);
      const logs = db.prepare("SELECT * FROM raw_log WHERE reason = 'json-parse-failed'").all();
      expect(logs).toHaveLength(1);
    });

    it("should write raw_log for unknown event type", () => {
      const line = JSON.stringify({ type: "totally-unknown-type", data: "x" });
      const events = parseStreamLine(line, "test-proj", "msg-id", db);
      expect(events).toHaveLength(0);
      const logs = db.prepare("SELECT * FROM raw_log WHERE reason = 'unknown-event-type'").all();
      expect(logs).toHaveLength(1);
    });
  });
});
