// @design-house/shared/events
import { z } from "zod";

// ── Error Code ────────────────────────────────────────────────────

export const ErrorCode = {
  CC_NOT_INSTALLED: "CC_NOT_INSTALLED",
  CC_NOT_AUTHENTICATED: "CC_NOT_AUTHENTICATED",
  CC_SPAWN_FAILED: "CC_SPAWN_FAILED",
  CC_TIMEOUT: "CC_TIMEOUT",
  MCP_TOOL_ERROR: "MCP_TOOL_ERROR",
  INVALID_MESSAGE: "INVALID_MESSAGE",
  PROJECT_NOT_FOUND: "PROJECT_NOT_FOUND",
  TURN_ALREADY_ACTIVE: "TURN_ALREADY_ACTIVE",
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

// ── Client → Server schemas ───────────────────────────────────────

export const subscribeSchema = z.object({
  type: z.literal("subscribe"),
  projectSlug: z.string().min(1),
});

export const userMessageSchema = z.object({
  type: z.literal("user-message"),
  projectSlug: z.string().min(1),
  content: z.string(),
  clientMessageId: z.string().min(1),
});

export const cancelTurnSchema = z.object({
  type: z.literal("cancel-turn"),
  projectSlug: z.string().min(1),
});

export const doneAckSchema = z.object({
  type: z.literal("done-ack"),
  correlationId: z.string().min(1),
  loaded: z.boolean(),
  consoleErrors: z.array(z.string()),
});

export const pingSchema = z.object({
  type: z.literal("ping"),
});

// ── Server → Client schemas ───────────────────────────────────────

export const readySchema = z.object({
  type: z.literal("ready"),
  projectSlug: z.string().min(1),
  sessionId: z.string().optional(),
});

export const messageAckSchema = z.object({
  type: z.literal("message-ack"),
  clientMessageId: z.string().min(1),
  serverMessageId: z.string().min(1),
});

export const chatDeltaSchema = z.object({
  type: z.literal("chat-delta"),
  projectSlug: z.string().min(1),
  messageId: z.string().min(1),
  delta: z.string(),
});

export const toolStartSchema = z.object({
  type: z.literal("tool-start"),
  projectSlug: z.string().min(1),
  toolUseId: z.string().min(1),
  toolName: z.string().min(1),
  inputSummary: z.string(),
});

export const toolResultSchema = z.object({
  type: z.literal("tool-result"),
  projectSlug: z.string().min(1),
  toolUseId: z.string().min(1),
  isError: z.boolean(),
  summary: z.string(),
});

export const fsChangeSchema = z.object({
  type: z.literal("fs-change"),
  projectSlug: z.string().min(1),
  op: z.enum(["write", "delete", "rename"]),
  path: z.string().min(1),
  oldPath: z.string().optional(),
});

export const showToUserSchema = z.object({
  type: z.literal("show-to-user"),
  projectSlug: z.string().min(1),
  path: z.string().min(1),
});

export const doneRequestSchema = z.object({
  type: z.literal("done-request"),
  projectSlug: z.string().min(1),
  correlationId: z.string().min(1),
  path: z.string().min(1),
});

export const turnEndSchema = z.object({
  type: z.literal("turn-end"),
  projectSlug: z.string().min(1),
  messageId: z.string().min(1),
  reason: z.enum(["complete", "error", "cancelled", "timeout"]),
});

export const errorSchema = z.object({
  type: z.literal("error"),
  projectSlug: z.string().min(1).optional(),
  code: z.string().min(1),
  message: z.string(),
});

export const pongSchema = z.object({
  type: z.literal("pong"),
});

// ── Discriminated Unions ──────────────────────────────────────────

export const ClientToServerEvent = z.discriminatedUnion("type", [
  subscribeSchema,
  userMessageSchema,
  cancelTurnSchema,
  doneAckSchema,
  pingSchema,
]);

export const ServerToClientEvent = z.discriminatedUnion("type", [
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
]);

// ── TypeScript types ──────────────────────────────────────────────

export type SubscribeEvent = z.infer<typeof subscribeSchema>;
export type UserMessageEvent = z.infer<typeof userMessageSchema>;
export type CancelTurnEvent = z.infer<typeof cancelTurnSchema>;
export type DoneAckEvent = z.infer<typeof doneAckSchema>;
export type PingEvent = z.infer<typeof pingSchema>;

export type ReadyEvent = z.infer<typeof readySchema>;
export type MessageAckEvent = z.infer<typeof messageAckSchema>;
export type ChatDeltaEvent = z.infer<typeof chatDeltaSchema>;
export type ToolStartEvent = z.infer<typeof toolStartSchema>;
export type ToolResultEvent = z.infer<typeof toolResultSchema>;
export type FsChangeEvent = z.infer<typeof fsChangeSchema>;
export type ShowToUserEvent = z.infer<typeof showToUserSchema>;
export type DoneRequestEvent = z.infer<typeof doneRequestSchema>;
export type TurnEndEvent = z.infer<typeof turnEndSchema>;
export type ErrorEvent = z.infer<typeof errorSchema>;
export type PongEvent = z.infer<typeof pongSchema>;

export type ClientToServerEventType = z.infer<typeof ClientToServerEvent>;
export type ServerToClientEventType = z.infer<typeof ServerToClientEvent>;
