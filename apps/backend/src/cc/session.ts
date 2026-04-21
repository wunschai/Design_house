// Session orchestration — CC spawn 管理、session 延續
import type { WebSocket } from "@fastify/websocket";
import Database from "better-sqlite3";
import { getSession, insertSession, incrementTurnCount, updateSessionId } from "../db/client.js";
import { spawnCc } from "./spawner.js";
import type { ServerToClientEventType } from "@design-house/shared/events";
import { broadcast } from "../routes/ws.js";
import { ulid } from "ulid";

// 活躍 spawn map（用於 cancel + shutdown）
const _activeProcesses = new Map<string, { kill: () => void }>();

/** Shutdown 時 server.ts 會呼叫這個，一次 kill 所有進行中 CC subprocess。 */
export function killAllActiveProcesses(): void {
  for (const [, proc] of _activeProcesses) {
    try { proc.kill(); } catch { /* ignore */ }
  }
  _activeProcesses.clear();
}

/**
 * 處理 user-message：spawn CC、管理 session 延續。
 */
export async function handleUserMessage(
  projectSlug: string,
  content: string,
  db: Database.Database,
  _ws: WebSocket
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

  let resumeSessionId = session.cc_session_id ?? undefined;
  const messageId = ulid();

  // sendToClient 只廣播給 pool 的所有訂閱者（submitter 亦在 pool 內、會收到）；
  // 不再額外 ws.send() 避免 submitter 收到兩份。
  function sendToClient(event: ServerToClientEventType): void {
    broadcast(projectSlug, event);
  }

  // ADR-007：--resume 失敗偵測。CC 輸出特定錯誤字串時視為 session 無效、清欄位、改冷啟。
  let sessionInvalid = false;

  try {
    await spawnCc({
      projectSlug,
      userMessage: content,
      messageId,
      resumeSessionId,
      db,
      onEvent: (event) => {
        // 偵測 session 失效訊號（CC stderr 被 spawner 轉成 error event 帶特定 message）
        if (
          event.type === "error" &&
          typeof event.message === "string" &&
          (event.message.includes("session not found") ||
            event.message.includes("No such session") ||
            event.message.includes("invalid session"))
        ) {
          sessionInvalid = true;
        }
        sendToClient(event);
      },
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

  // ADR-007 fallback：若 --resume 的 session id 失效，清 DB 欄位、通知 UI、由下輪冷啟。
  // 目前只觸發「清欄位 + 通知」；下次 user-message 會 spawn 無 --resume 拿到新 id。
  if (sessionInvalid && resumeSessionId) {
    try {
      updateSessionId(db, projectSlug, null);
    } catch { /* DB closed */ }
    broadcast(projectSlug, {
      type: "error",
      projectSlug,
      code: "CC_SESSION_RESET",
      message: "CC session expired and has been reset. Please resend your message.",
    });
    resumeSessionId = undefined;
  }
}

/**
 * 取消當前進行中的 CC turn。
 */
export function cancelTurn(projectSlug: string): void {
  const proc = _activeProcesses.get(projectSlug);
  proc?.kill();
}
