// @design-house/shared/events.test.ts
import { describe, it, expect } from "vitest";
import {
  subscribeSchema,
  userMessageSchema,
  cancelTurnSchema,
  doneAckSchema,
  pingSchema,
  readySchema,
  messageAckSchema,
  chatDeltaSchema,
  toolStartSchema,
  toolResultSchema,
  fsChangeSchema,
  showToUserSchema,
  doneRequestSchema,
  turnEndSchema,
  errorSchema,
  pongSchema,
  ClientToServerEvent,
  ServerToClientEvent,
  ErrorCode,
} from "./events.js";

// ── Client → Server ──────────────────────────────────────────────

describe("subscribeSchema", () => {
  it("should accept valid subscribe payload", () => {
    const result = subscribeSchema.safeParse({ type: "subscribe", projectSlug: "my-project" });
    expect(result.success).toBe(true);
  });

  it("should reject missing projectSlug", () => {
    const result = subscribeSchema.safeParse({ type: "subscribe" });
    expect(result.success).toBe(false);
  });

  it("should reject empty projectSlug", () => {
    const result = subscribeSchema.safeParse({ type: "subscribe", projectSlug: "" });
    expect(result.success).toBe(false);
  });

  it("should reject wrong type literal", () => {
    const result = subscribeSchema.safeParse({ type: "sub", projectSlug: "proj" });
    expect(result.success).toBe(false);
  });
});

describe("userMessageSchema", () => {
  it("should accept valid user-message payload", () => {
    const result = userMessageSchema.safeParse({
      type: "user-message",
      projectSlug: "my-project",
      content: "Hello world",
      clientMessageId: "client-123",
    });
    expect(result.success).toBe(true);
  });

  it("should reject missing content", () => {
    const result = userMessageSchema.safeParse({
      type: "user-message",
      projectSlug: "my-project",
      clientMessageId: "client-123",
    });
    expect(result.success).toBe(false);
  });

  it("should reject empty clientMessageId", () => {
    const result = userMessageSchema.safeParse({
      type: "user-message",
      projectSlug: "my-project",
      content: "Hello",
      clientMessageId: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("cancelTurnSchema", () => {
  it("should accept valid cancel-turn payload", () => {
    const result = cancelTurnSchema.safeParse({ type: "cancel-turn", projectSlug: "my-project" });
    expect(result.success).toBe(true);
  });

  it("should reject empty projectSlug", () => {
    const result = cancelTurnSchema.safeParse({ type: "cancel-turn", projectSlug: "" });
    expect(result.success).toBe(false);
  });
});

describe("doneAckSchema", () => {
  it("should accept valid done-ack payload", () => {
    const result = doneAckSchema.safeParse({
      type: "done-ack",
      correlationId: "corr-123",
      loaded: true,
      consoleErrors: [],
    });
    expect(result.success).toBe(true);
  });

  it("should accept done-ack with console errors", () => {
    const result = doneAckSchema.safeParse({
      type: "done-ack",
      correlationId: "corr-123",
      loaded: false,
      consoleErrors: ["TypeError: undefined is not a function"],
    });
    expect(result.success).toBe(true);
  });

  it("should reject empty correlationId", () => {
    const result = doneAckSchema.safeParse({
      type: "done-ack",
      correlationId: "",
      loaded: true,
      consoleErrors: [],
    });
    expect(result.success).toBe(false);
  });

  it("should reject non-boolean loaded", () => {
    const result = doneAckSchema.safeParse({
      type: "done-ack",
      correlationId: "corr-123",
      loaded: "yes",
      consoleErrors: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("pingSchema", () => {
  it("should accept valid ping payload", () => {
    const result = pingSchema.safeParse({ type: "ping" });
    expect(result.success).toBe(true);
  });

  it("should reject wrong type literal", () => {
    const result = pingSchema.safeParse({ type: "pong" });
    expect(result.success).toBe(false);
  });
});

// ── Server → Client ──────────────────────────────────────────────

describe("readySchema", () => {
  it("should accept ready without sessionId", () => {
    const result = readySchema.safeParse({ type: "ready", projectSlug: "my-project" });
    expect(result.success).toBe(true);
  });

  it("should accept ready with sessionId", () => {
    const result = readySchema.safeParse({
      type: "ready",
      projectSlug: "my-project",
      sessionId: "session-abc",
    });
    expect(result.success).toBe(true);
  });

  it("should reject empty projectSlug", () => {
    const result = readySchema.safeParse({ type: "ready", projectSlug: "" });
    expect(result.success).toBe(false);
  });
});

describe("messageAckSchema", () => {
  it("should accept valid message-ack payload", () => {
    const result = messageAckSchema.safeParse({
      type: "message-ack",
      clientMessageId: "client-123",
      serverMessageId: "server-456",
    });
    expect(result.success).toBe(true);
  });

  it("should reject empty clientMessageId", () => {
    const result = messageAckSchema.safeParse({
      type: "message-ack",
      clientMessageId: "",
      serverMessageId: "server-456",
    });
    expect(result.success).toBe(false);
  });
});

describe("chatDeltaSchema", () => {
  it("should accept valid chat-delta payload", () => {
    const result = chatDeltaSchema.safeParse({
      type: "chat-delta",
      projectSlug: "my-project",
      messageId: "msg-123",
      delta: "Hello ",
    });
    expect(result.success).toBe(true);
  });

  it("should accept empty string delta", () => {
    const result = chatDeltaSchema.safeParse({
      type: "chat-delta",
      projectSlug: "my-project",
      messageId: "msg-123",
      delta: "",
    });
    expect(result.success).toBe(true);
  });

  it("should reject missing messageId", () => {
    const result = chatDeltaSchema.safeParse({
      type: "chat-delta",
      projectSlug: "my-project",
      delta: "Hello",
    });
    expect(result.success).toBe(false);
  });
});

describe("toolStartSchema", () => {
  it("should accept valid tool-start payload", () => {
    const result = toolStartSchema.safeParse({
      type: "tool-start",
      projectSlug: "my-project",
      toolUseId: "tool-use-123",
      toolName: "read_file",
      inputSummary: '{"path":"index.html"}',
    });
    expect(result.success).toBe(true);
  });

  it("should reject empty toolUseId", () => {
    const result = toolStartSchema.safeParse({
      type: "tool-start",
      projectSlug: "my-project",
      toolUseId: "",
      toolName: "read_file",
      inputSummary: "{}",
    });
    expect(result.success).toBe(false);
  });

  it("should accept optional parentToolUseId when null", () => {
    const result = toolStartSchema.safeParse({
      type: "tool-start",
      projectSlug: "my-project",
      toolUseId: "tool-use-123",
      toolName: "read_file",
      inputSummary: "{}",
      parentToolUseId: null,
    });
    expect(result.success).toBe(true);
  });

  it("should accept optional parentToolUseId when set (nested ctx)", () => {
    const result = toolStartSchema.safeParse({
      type: "tool-start",
      projectSlug: "my-project",
      toolUseId: "tool-use-123",
      toolName: "read_file",
      inputSummary: "{}",
      parentToolUseId: "parent-use-abc",
    });
    expect(result.success).toBe(true);
  });

  it("should reject empty-string parentToolUseId", () => {
    const result = toolStartSchema.safeParse({
      type: "tool-start",
      projectSlug: "my-project",
      toolUseId: "tool-use-123",
      toolName: "read_file",
      inputSummary: "{}",
      parentToolUseId: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("toolResultSchema", () => {
  it("should accept valid tool-result payload (no error)", () => {
    const result = toolResultSchema.safeParse({
      type: "tool-result",
      projectSlug: "my-project",
      toolUseId: "tool-use-123",
      isError: false,
      summary: "Read 200 bytes",
    });
    expect(result.success).toBe(true);
  });

  it("should accept valid tool-result payload (with error)", () => {
    const result = toolResultSchema.safeParse({
      type: "tool-result",
      projectSlug: "my-project",
      toolUseId: "tool-use-123",
      isError: true,
      summary: "File not found",
    });
    expect(result.success).toBe(true);
  });

  it("should reject non-boolean isError", () => {
    const result = toolResultSchema.safeParse({
      type: "tool-result",
      projectSlug: "my-project",
      toolUseId: "tool-use-123",
      isError: "true",
      summary: "ok",
    });
    expect(result.success).toBe(false);
  });
});

describe("fsChangeSchema", () => {
  it("should accept fs-change write op", () => {
    const result = fsChangeSchema.safeParse({
      type: "fs-change",
      projectSlug: "my-project",
      op: "write",
      path: "index.html",
    });
    expect(result.success).toBe(true);
  });

  it("should accept fs-change rename op with oldPath", () => {
    const result = fsChangeSchema.safeParse({
      type: "fs-change",
      projectSlug: "my-project",
      op: "rename",
      path: "new-name.html",
      oldPath: "old-name.html",
    });
    expect(result.success).toBe(true);
  });

  it("should accept fs-change delete op", () => {
    const result = fsChangeSchema.safeParse({
      type: "fs-change",
      projectSlug: "my-project",
      op: "delete",
      path: "index.html",
    });
    expect(result.success).toBe(true);
  });

  it("should reject invalid op value", () => {
    const result = fsChangeSchema.safeParse({
      type: "fs-change",
      projectSlug: "my-project",
      op: "modify",
      path: "index.html",
    });
    expect(result.success).toBe(false);
  });

  it("should reject empty path", () => {
    const result = fsChangeSchema.safeParse({
      type: "fs-change",
      projectSlug: "my-project",
      op: "write",
      path: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("showToUserSchema", () => {
  it("should accept valid show-to-user payload", () => {
    const result = showToUserSchema.safeParse({
      type: "show-to-user",
      projectSlug: "my-project",
      path: "index.html",
    });
    expect(result.success).toBe(true);
  });

  it("should reject empty path", () => {
    const result = showToUserSchema.safeParse({
      type: "show-to-user",
      projectSlug: "my-project",
      path: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("doneRequestSchema", () => {
  it("should accept valid done-request payload", () => {
    const result = doneRequestSchema.safeParse({
      type: "done-request",
      projectSlug: "my-project",
      correlationId: "corr-123",
      path: "index.html",
    });
    expect(result.success).toBe(true);
  });

  it("should reject empty correlationId", () => {
    const result = doneRequestSchema.safeParse({
      type: "done-request",
      projectSlug: "my-project",
      correlationId: "",
      path: "index.html",
    });
    expect(result.success).toBe(false);
  });
});

describe("turnEndSchema", () => {
  it("should accept turn-end with reason complete", () => {
    const result = turnEndSchema.safeParse({
      type: "turn-end",
      projectSlug: "my-project",
      messageId: "msg-123",
      reason: "complete",
    });
    expect(result.success).toBe(true);
  });

  it("should accept turn-end with reason error", () => {
    const result = turnEndSchema.safeParse({
      type: "turn-end",
      projectSlug: "my-project",
      messageId: "msg-123",
      reason: "error",
    });
    expect(result.success).toBe(true);
  });

  it("should accept turn-end with reason cancelled", () => {
    const result = turnEndSchema.safeParse({
      type: "turn-end",
      projectSlug: "my-project",
      messageId: "msg-123",
      reason: "cancelled",
    });
    expect(result.success).toBe(true);
  });

  it("should accept turn-end with reason timeout", () => {
    const result = turnEndSchema.safeParse({
      type: "turn-end",
      projectSlug: "my-project",
      messageId: "msg-123",
      reason: "timeout",
    });
    expect(result.success).toBe(true);
  });

  it("should reject invalid reason", () => {
    const result = turnEndSchema.safeParse({
      type: "turn-end",
      projectSlug: "my-project",
      messageId: "msg-123",
      reason: "done",
    });
    expect(result.success).toBe(false);
  });
});

describe("errorSchema", () => {
  it("should accept error without projectSlug", () => {
    const result = errorSchema.safeParse({
      type: "error",
      code: "CC_NOT_INSTALLED",
      message: "claude CLI is not installed",
    });
    expect(result.success).toBe(true);
  });

  it("should accept error with projectSlug", () => {
    const result = errorSchema.safeParse({
      type: "error",
      projectSlug: "my-project",
      code: "PROJECT_NOT_FOUND",
      message: "Project does not exist",
    });
    expect(result.success).toBe(true);
  });

  it("should reject missing code", () => {
    const result = errorSchema.safeParse({
      type: "error",
      message: "Something went wrong",
    });
    expect(result.success).toBe(false);
  });
});

describe("pongSchema", () => {
  it("should accept valid pong payload", () => {
    const result = pongSchema.safeParse({ type: "pong" });
    expect(result.success).toBe(true);
  });
});

// ── Discriminated Unions ──────────────────────────────────────────

describe("ClientToServerEvent discriminated union", () => {
  it("should parse subscribe as ClientToServerEvent", () => {
    const result = ClientToServerEvent.safeParse({ type: "subscribe", projectSlug: "proj" });
    expect(result.success).toBe(true);
  });

  it("should parse ping as ClientToServerEvent", () => {
    const result = ClientToServerEvent.safeParse({ type: "ping" });
    expect(result.success).toBe(true);
  });

  it("should reject unknown client event type", () => {
    const result = ClientToServerEvent.safeParse({ type: "unknown-event" });
    expect(result.success).toBe(false);
  });
});

describe("ServerToClientEvent discriminated union", () => {
  it("should parse ready as ServerToClientEvent", () => {
    const result = ServerToClientEvent.safeParse({ type: "ready", projectSlug: "proj" });
    expect(result.success).toBe(true);
  });

  it("should parse pong as ServerToClientEvent", () => {
    const result = ServerToClientEvent.safeParse({ type: "pong" });
    expect(result.success).toBe(true);
  });

  it("should reject unknown server event type", () => {
    const result = ServerToClientEvent.safeParse({ type: "unknown-event" });
    expect(result.success).toBe(false);
  });
});

// ── ErrorCode ────────────────────────────────────────────────────

describe("ErrorCode", () => {
  it("should contain CC_NOT_INSTALLED", () => {
    expect(ErrorCode.CC_NOT_INSTALLED).toBeDefined();
  });

  it("should contain CC_NOT_AUTHENTICATED", () => {
    expect(ErrorCode.CC_NOT_AUTHENTICATED).toBeDefined();
  });

  it("should contain CC_SPAWN_FAILED", () => {
    expect(ErrorCode.CC_SPAWN_FAILED).toBeDefined();
  });

  it("should contain CC_TIMEOUT", () => {
    expect(ErrorCode.CC_TIMEOUT).toBeDefined();
  });

  it("should contain MCP_TOOL_ERROR", () => {
    expect(ErrorCode.MCP_TOOL_ERROR).toBeDefined();
  });

  it("should contain INVALID_MESSAGE", () => {
    expect(ErrorCode.INVALID_MESSAGE).toBeDefined();
  });

  it("should contain PROJECT_NOT_FOUND", () => {
    expect(ErrorCode.PROJECT_NOT_FOUND).toBeDefined();
  });

  it("should contain TURN_ALREADY_ACTIVE", () => {
    expect(ErrorCode.TURN_ALREADY_ACTIVE).toBeDefined();
  });
});
