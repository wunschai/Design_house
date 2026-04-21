// use-ws — WebSocket hook with reconnect, ping/pong, HMR protection
import { useEffect, useRef, useCallback } from "react";
import { ServerToClientEvent } from "@design-house/shared/events";
import type { ServerToClientEventType } from "@design-house/shared/events";

// ── 常數 ─────────────────────────────────────────────────────────────

const WS_URL = "/ws";
const PING_INTERVAL_MS = 30_000;
// PING_TIMEOUT_MS: 兩個 ping 週期未回 → reconnect (handled via missedPongs counter)
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const PENDING_REPLAY_TIMEOUT_MS = 5_000;

// ── Types ─────────────────────────────────────────────────────────────

export type WsEventType = ServerToClientEventType["type"];

export type WsListener<T extends WsEventType = WsEventType> = (
  event: Extract<ServerToClientEventType, { type: T }>
) => void;

export interface PendingDoneRequest {
  path: string;
  startedAt: number;
  correlationId: string;
}

export interface UseWsOptions {
  projectSlug: string | null;
  /** 連線狀態改變時的 callback */
  onStatusChange?: (status: "connecting" | "connected" | "disconnected") => void;
}

export interface UseWsReturn {
  /** 訂閱某類型的 WS 事件 */
  on: <T extends WsEventType>(type: T, listener: WsListener<T>) => () => void;
  /** 送出任意 JSON 物件 */
  send: (data: unknown) => void;
  /** 登記 in-flight done-request（HMR 保護用） */
  trackPendingDone: (req: PendingDoneRequest) => void;
  /** 清除已完成的 done-request */
  clearPendingDone: (correlationId: string) => void;
  /** 目前連線狀態 */
  status: "connecting" | "connected" | "disconnected";
}

// ── Internal WS manager (singleton per component instance) ──────────

/**
 * 建立並管理 WebSocket 連線，供 useWs hook 使用。
 * 抽出成工廠函式讓測試可以注入 MockWebSocket。
 */
export function createWsManager(options: {
  projectSlug: string | null;
  wsUrl?: string;
  WebSocketClass?: typeof WebSocket;
  onEvent: (event: ServerToClientEventType) => void;
  onStatusChange?: (status: "connecting" | "connected" | "disconnected") => void;
  getPendingDones: () => Map<string, PendingDoneRequest>;
  onReplayDone: (req: PendingDoneRequest) => void;
}) {
  const {
    projectSlug,
    wsUrl = WS_URL,
    WebSocketClass = WebSocket,
    onEvent,
    onStatusChange,
    getPendingDones,
    onReplayDone,
  } = options;

  let ws: WebSocket | null = null;
  let reconnectAttempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let missedPongs = 0;
  let destroyed = false;

  function setStatus(s: "connecting" | "connected" | "disconnected") {
    onStatusChange?.(s);
  }

  function clearTimers() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
  }

  function connect() {
    if (destroyed) return;
    clearTimers();
    setStatus("connecting");

    try {
      ws = new WebSocketClass(wsUrl);
    } catch {
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      if (destroyed) {
        ws?.close();
        return;
      }
      reconnectAttempt = 0;
      missedPongs = 0;
      setStatus("connected");

      // subscribe to project
      if (projectSlug) {
        ws?.send(JSON.stringify({ type: "subscribe", projectSlug }));
      }

      // replay any pending done requests (HMR reconnect protection)
      const now = Date.now();
      for (const req of getPendingDones().values()) {
        const elapsed = now - req.startedAt;
        if (elapsed > PENDING_REPLAY_TIMEOUT_MS) {
          console.warn(`[use-ws] Dropping stale pending done-request ${req.correlationId} (${elapsed}ms elapsed)`);
          continue;
        }
        onReplayDone(req);
      }

      // start ping loop
      pingTimer = setInterval(() => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;

        missedPongs++;
        if (missedPongs > 2) {
          // server 未回 2 次 ping → close + reconnect
          console.warn("[use-ws] Server missed 2 pongs, reconnecting");
          ws.close();
          return;
        }
        ws.send(JSON.stringify({ type: "ping" }));
      }, PING_INTERVAL_MS);
    };

    ws.onmessage = (event: MessageEvent) => {
      let data: unknown;
      try {
        data = JSON.parse(event.data as string);
      } catch {
        console.warn("[use-ws] Failed to parse WS message:", event.data);
        return;
      }

      const parsed = ServerToClientEvent.safeParse(data);
      if (!parsed.success) {
        console.warn("[use-ws] Unknown WS event:", data);
        return;
      }

      // pong resets missed count
      if (parsed.data.type === "pong") {
        missedPongs = 0;
      }

      onEvent(parsed.data);
    };

    ws.onclose = () => {
      if (destroyed) return;
      setStatus("disconnected");
      clearTimers();
      scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose 也會觸發，這裡不額外處理
    };
  }

  function scheduleReconnect() {
    if (destroyed) return;
    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(2, reconnectAttempt),
      RECONNECT_MAX_MS
    );
    reconnectAttempt++;
    reconnectTimer = setTimeout(connect, delay);
  }

  function send(data: unknown) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  function destroy() {
    destroyed = true;
    clearTimers();
    ws?.close();
    ws = null;
  }

  return { connect, send, destroy };
}

// ── React hook ───────────────────────────────────────────────────────

export function useWs(options: UseWsOptions): UseWsReturn {
  const { projectSlug, onStatusChange } = options;

  const listenersRef = useRef<Map<string, Set<WsListener<WsEventType>>>>(new Map());
  const pendingDonesRef = useRef<Map<string, PendingDoneRequest>>(new Map());
  const statusRef = useRef<"connecting" | "connected" | "disconnected">("disconnected");
  const managerRef = useRef<ReturnType<typeof createWsManager> | null>(null);

  const handleEvent = useCallback((event: ServerToClientEventType) => {
    const listeners = listenersRef.current.get(event.type);
    if (!listeners) return;
    for (const listener of listeners) {
      (listener as WsListener)(event);
    }
  }, []);

  const handleReplayDone = useCallback((req: PendingDoneRequest) => {
    // 讓外部 Preview panel 處理；透過合成事件廣播
    const listeners = listenersRef.current.get("done-request");
    if (!listeners) return;
    for (const listener of listeners) {
      (listener as WsListener)({
        type: "done-request",
        projectSlug: projectSlug ?? "",
        correlationId: req.correlationId,
        path: req.path,
      } as Extract<ServerToClientEventType, { type: "done-request" }>);
    }
  }, [projectSlug]);

  const handleStatusChange = useCallback((status: "connecting" | "connected" | "disconnected") => {
    statusRef.current = status;
    onStatusChange?.(status);
  }, [onStatusChange]);

  useEffect(() => {
    const manager = createWsManager({
      projectSlug,
      onEvent: handleEvent,
      onStatusChange: handleStatusChange,
      getPendingDones: () => pendingDonesRef.current,
      onReplayDone: handleReplayDone,
    });
    managerRef.current = manager;
    manager.connect();

    return () => {
      manager.destroy();
      managerRef.current = null;
    };
  }, [projectSlug, handleEvent, handleStatusChange, handleReplayDone]);

  const on = useCallback(<T extends WsEventType>(
    type: T,
    listener: WsListener<T>
  ): (() => void) => {
    const map = listenersRef.current;
    if (!map.has(type)) map.set(type, new Set());
    map.get(type)!.add(listener as unknown as WsListener<WsEventType>);
    return () => {
      map.get(type)?.delete(listener as unknown as WsListener<WsEventType>);
    };
  }, []);

  const send = useCallback((data: unknown) => {
    managerRef.current?.send(data);
  }, []);

  const trackPendingDone = useCallback((req: PendingDoneRequest) => {
    pendingDonesRef.current.set(req.correlationId, req);
  }, []);

  const clearPendingDone = useCallback((correlationId: string) => {
    pendingDonesRef.current.delete(correlationId);
  }, []);

  return {
    on,
    send,
    trackPendingDone,
    clearPendingDone,
    status: statusRef.current,
  };
}
