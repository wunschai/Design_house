// WebSocket route — /ws
// 廣播 pool、事件 dispatch、ping/pong keepalive
import { FastifyInstance, FastifyPluginOptions } from "fastify";
import type { WebSocket } from "@fastify/websocket";
import Database from "better-sqlite3";
import { ClientToServerEvent, ErrorCode } from "@design-house/shared/events";
import type {
  ServerToClientEventType,
  ReadyEvent,
  ErrorEvent,
  PongEvent,
} from "@design-house/shared/events";
import { getProject, insertMessage, getSession } from "../db/client.js";
import { ulid } from "ulid";

// ── Broadcast pool ─────────────────────────────────────────────────

// Map<projectSlug, Set<WebSocket>>
const _pool = new Map<string, Set<WebSocket>>();

export function getPool(): Map<string, Set<WebSocket>> {
  return _pool;
}

export function broadcast(projectSlug: string, event: ServerToClientEventType): void {
  const clients = _pool.get(projectSlug);
  if (!clients) return;
  const json = JSON.stringify(event);
  for (const ws of clients) {
    if (ws.readyState === 1 /* OPEN */) {
      ws.send(json);
    }
  }
}

// ── Single-flight turn guard ───────────────────────────────────────

const _activeturns = new Map<string, boolean>();

export function isTurnActive(projectSlug: string): boolean {
  return _activeturns.get(projectSlug) === true;
}

export function setTurnActive(projectSlug: string, active: boolean): void {
  if (active) {
    _activeturns.set(projectSlug, true);
  } else {
    _activeturns.delete(projectSlug);
  }
}

// ── Helpers ────────────────────────────────────────────────────────

function sendEvent(ws: WebSocket, event: ServerToClientEventType): void {
  ws.send(JSON.stringify(event));
}

function sendError(ws: WebSocket, code: string, message: string, projectSlug?: string): void {
  const event: ErrorEvent = {
    type: "error",
    code,
    message,
    ...(projectSlug ? { projectSlug } : {}),
  };
  sendEvent(ws, event);
}

// NFR-7: ping/pong keepalive — 每 30s 發 ping；2 次 pong 不回 → close(1001)
const PING_INTERVAL_MS = 30_000;

function setupKeepalive(ws: WebSocket): () => void {
  let missedPongs = 0;

  const timer = setInterval(() => {
    if (ws.readyState !== 1 /* OPEN */) {
      clearInterval(timer);
      return;
    }
    if (missedPongs >= 2) {
      ws.close(1001, "ping timeout");
      clearInterval(timer);
      return;
    }
    missedPongs++;
    ws.send(JSON.stringify({ type: "ping" }));
  }, PING_INTERVAL_MS);

  // 收到 pong 時重置
  const handlePong = () => { missedPongs = 0; };
  ws.on("pong", handlePong);

  return () => {
    clearInterval(timer);
    ws.off("pong", handlePong);
  };
}

// ── WS plugin ─────────────────────────────────────────────────────

export interface WsRouteOptions extends FastifyPluginOptions {
  db: Database.Database;
}

export async function wsRoutes(app: FastifyInstance, opts: WsRouteOptions): Promise<void> {
  const { db } = opts;

  app.get("/ws", { websocket: true }, (socket, _req) => {
    let subscribedProject: string | null = null;
    let cleanupKeepalive: (() => void) | null = null;

    // 處理 pong（client 回應 server 的 ping）
    socket.on("pong", () => {
      // handled by keepalive setup
    });

    socket.on("message", (rawData) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawData.toString());
      } catch {
        sendError(socket, ErrorCode.INVALID_MESSAGE, "Invalid JSON");
        return;
      }

      const result = ClientToServerEvent.safeParse(parsed);
      if (!result.success) {
        sendError(socket, ErrorCode.INVALID_MESSAGE, "Unknown or invalid message type");
        return;
      }

      const msg = result.data;

      switch (msg.type) {
        case "ping": {
          const pong: PongEvent = { type: "pong" };
          sendEvent(socket, pong);
          break;
        }

        case "subscribe": {
          const project = getProject(db, msg.projectSlug);
          if (!project) {
            sendError(socket, ErrorCode.PROJECT_NOT_FOUND, `Project '${msg.projectSlug}' not found`);
            return;
          }

          // 從舊 project 的 pool 移除
          if (subscribedProject && subscribedProject !== msg.projectSlug) {
            const oldSet = _pool.get(subscribedProject);
            oldSet?.delete(socket);
          }

          subscribedProject = msg.projectSlug;
          if (!_pool.has(subscribedProject)) {
            _pool.set(subscribedProject, new Set());
          }
          _pool.get(subscribedProject)!.add(socket);

          // 啟動 keepalive
          if (!cleanupKeepalive) {
            cleanupKeepalive = setupKeepalive(socket);
          }

          // 回傳 ready + current session id
          const session = getSession(db, subscribedProject);
          const ready: ReadyEvent = {
            type: "ready",
            projectSlug: subscribedProject,
            ...(session?.cc_session_id ? { sessionId: session.cc_session_id } : {}),
          };
          sendEvent(socket, ready);
          break;
        }

        case "user-message": {
          const { projectSlug, content, clientMessageId } = msg;

          // 空 content 拒絕（邊界案例 8）
          if (!content.trim()) {
            sendError(socket, ErrorCode.INVALID_MESSAGE, "Message content cannot be empty", projectSlug);
            return;
          }

          // single-flight check
          if (isTurnActive(projectSlug)) {
            sendError(socket, ErrorCode.TURN_ALREADY_ACTIVE, "A turn is already in progress for this project", projectSlug);
            return;
          }

          // 持久化 user message
          const serverMessageId = ulid();
          insertMessage(db, {
            id: serverMessageId,
            project_slug: projectSlug,
            role: "user",
            content,
            tool_use_id: null,
            tool_name: null,
            is_error: null,
          });

          // ack
          sendEvent(socket, {
            type: "message-ack",
            clientMessageId,
            serverMessageId,
          });

          // 觸發 CC spawn（lazy import 避免循環依賴）
          setTurnActive(projectSlug, true);
          import("../cc/session.js").then(({ handleUserMessage }) => {
            return handleUserMessage(projectSlug, content, db, socket);
          }).catch((_err: unknown) => {
            // CC 啟動失敗或 DB 已關閉，靜默處理
          }).finally(() => {
            setTurnActive(projectSlug, false);
          });
          break;
        }

        case "cancel-turn": {
          import("../cc/session.js").then(({ cancelTurn }) => {
            cancelTurn(msg.projectSlug);
          }).catch(() => { /* ignore */ });
          break;
        }

        case "done-ack": {
          import("../internal/correlation-cache.js").then(({ resolveDoneAck }) => {
            resolveDoneAck(msg.correlationId, {
              ok: msg.loaded,
              timedOut: false,
              consoleErrors: msg.consoleErrors,
            });
          }).catch(() => { /* ignore */ });
          break;
        }
      }
    });

    socket.on("close", () => {
      // 清理 pool
      if (subscribedProject) {
        const set = _pool.get(subscribedProject);
        set?.delete(socket);
        if (set?.size === 0) {
          _pool.delete(subscribedProject);
        }
      }
      cleanupKeepalive?.();
    });

    socket.on("error", () => {
      cleanupKeepalive?.();
    });
  });
}
