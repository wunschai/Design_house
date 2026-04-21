// Session orchestration — CC spawn 管理、session 延續
import type { WebSocket } from "@fastify/websocket";
import Database from "better-sqlite3";
import { getSession, insertSession, incrementTurnCount } from "../db/client.js";
import { spawnCc } from "./spawner.js";
import type { ServerToClientEventType } from "@design-house/shared/events";
import { broadcast } from "../routes/ws.js";
import { ulid } from "ulid";

// 活躍 spawn map（用於 cancel）
const _activeProcesses = new Map<string, { kill: () => void }>();

/**
 * 處理 user-message：spawn CC、管理 session 延續。
 */
export async function handleUserMessage(
  projectSlug: string,
  content: string,
  db: Database.Database,
  ws: WebSocket
): Promise<void> {
  // 確認 session（DB 可能已關閉，使用 try/catch 保護）
  let session;
  try {
    session = getSession(db, projectSlug);
    if (!session) {
      insertSession(db, { project_slug: projectSlug, cc_session_id: null });
      session = getSession(db, projectSlug)!;
    }
  } catch {
    // DB 已關閉（測試 teardown 或 server 重啟）
    return;
  }

  const resumeSessionId = session.cc_session_id ?? undefined;
  const messageId = ulid();

  function sendToClient(event: ServerToClientEventType): void {
    ws.send(JSON.stringify(event));
    // 也廣播給其他訂閱者
    broadcast(projectSlug, event);
  }

  try {
    await spawnCc({
      projectSlug,
      userMessage: content,
      messageId,
      resumeSessionId,
      db,
      onEvent: sendToClient,
      registerCancel: (killFn) => {
        _activeProcesses.set(projectSlug, { kill: killFn });
      },
    });
  } finally {
    _activeProcesses.delete(projectSlug);
    try {
      incrementTurnCount(db, projectSlug);
    } catch {
      // DB 已關閉
    }
  }
}

/**
 * 取消當前進行中的 CC turn。
 */
export function cancelTurn(projectSlug: string): void {
  const proc = _activeProcesses.get(projectSlug);
  proc?.kill();
}
