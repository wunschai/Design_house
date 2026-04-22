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
import { getProject, insertMessage, getSession, insertRawLog } from "../db/client.js";
import { ulid } from "ulid";
import { isShortConceptualPrompt } from "@design-house/shared/weighted-length";
import { getHealthStatus } from "../cc/health.js";

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
  const deadSockets: WebSocket[] = [];
  for (const ws of clients) {
    if (ws.readyState !== 1 /* OPEN */) {
      deadSockets.push(ws);
      continue;
    }
    try {
      ws.send(json);
    } catch {
      // send 失敗（backpressure / 剛 close）→ 視為 dead，稍後清
      deadSockets.push(ws);
    }
  }
  for (const d of deadSockets) clients.delete(d);
  if (clients.size === 0) _pool.delete(projectSlug);
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
// 採 app-level（JSON 訊息）pong——client 收到 {type:"ping"} 後回 {type:"pong"}，
// 透過 socket.on("message") 裡的 pong case 呼叫 resetKeepaliveCounter 重置 missedPongs。
const PING_INTERVAL_MS = 30_000;

interface KeepaliveHandle {
  cleanup: () => void;
  reset: () => void;
}

function setupKeepalive(ws: WebSocket): KeepaliveHandle {
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

  return {
    cleanup: () => clearInterval(timer),
    reset: () => { missedPongs = 0; },
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
    let keepalive: KeepaliveHandle | null = null;

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

        case "pong": {
          // client 回應 server 的 app-level ping — 重置 missedPongs
          keepalive?.reset();
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
          if (!keepalive) {
            keepalive = setupKeepalive(socket);
          }

          // 回傳 ready + current session id
          const session = getSession(db, subscribedProject);
          const ready: ReadyEvent = {
            type: "ready",
            projectSlug: subscribedProject,
            ...(session?.cc_session_id ? { sessionId: session.cc_session_id } : {}),
          };
          sendEvent(socket, ready);

          // AC-7.1 / 7.2：若 CC health 不 ok，訂閱後立刻通知 UI
          const health = getHealthStatus();
          if (health && !health.ok) {
            sendError(socket, health.code, health.message, subscribedProject);
          }
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

          // AC-3.0 Understand heuristic — 若 project 首則訊息短而概念性，記 log（persona 層會依此發問；
          // backend 不 gate，但給 Playwright / 人工稽核可追蹤）。
          const isFirstTurn = !getSession(db, projectSlug)?.cc_session_id;
          if (isFirstTurn && isShortConceptualPrompt(content, 60)) {
            insertRawLog(db, {
              project_slug: projectSlug,
              source: "internal",
              severity: "warn",
              reason: "understand-heuristic-triggered",
              raw: `first-turn short prompt (weighted<60): ${content.slice(0, 200)}`,
            });
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
      keepalive?.cleanup();
    });

    socket.on("error", () => {
      keepalive?.cleanup();
    });
  });
}
