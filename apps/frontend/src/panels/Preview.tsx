// Preview panel — iframe + done-request handling + HMR protection
import { useState, useEffect, useRef, useCallback } from "react";
import { fileUrl } from "../api/client";
import type { UseWsReturn } from "../hooks/use-ws";

// ── Constants ──────────────────────────────────────────────────────────
const LOAD_TIMEOUT_MS = 5_000;
const ERROR_COLLECT_MS = 3_000;

// ── Types ──────────────────────────────────────────────────────────────

export interface PreviewProps {
  projectSlug: string;
  currentPath: string | null;
  ws: UseWsReturn;
  onPathChange?: (path: string) => void;
}

export interface PendingDoneState {
  correlation_id: string;
  path: string;
  started_at: number;
}

// ── Exported handler types for testing ─────────────────────────────────

export interface IframeHookHandlers {
  handleDoneRequest: (correlationId: string, path: string) => void;
  handleShowToUser: (path: string) => void;
  handleIframeLoad: () => void;
}

// ── Component ──────────────────────────────────────────────────────────

export default function Preview({ projectSlug, currentPath, ws, onPathChange }: PreviewProps) {
  const [iframe_src, set_iframe_src] = useState<string | null>(null);
  const [load_error, set_load_error] = useState(false);
  const iframe_ref = useRef<HTMLIFrameElement>(null);
  const errors_ref = useRef<string[]>([]);
  const pending_done_ref = useRef<PendingDoneState | null>(null);
  const load_timer_ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const error_collect_timer_ref = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync prop → iframe src
  useEffect(() => {
    if (currentPath && projectSlug) {
      set_iframe_src(fileUrl(projectSlug, currentPath));
      set_load_error(false);
    }
  }, [currentPath, projectSlug]);

  // ── iframe onLoad hook ──────────────────────────────────────────────

  const handleIframeLoad = useCallback(() => {
    const win = iframe_ref.current?.contentWindow;
    if (!win) return;

    // 重置錯誤收集（per-load）
    errors_ref.current = [];
    set_load_error(false);

    // 清除載入超時計時器
    if (load_timer_ref.current) {
      clearTimeout(load_timer_ref.current);
      load_timer_ref.current = null;
    }

    // 掛 error listener（比 console.error 更 robust — artifact 無法覆寫）
    win.addEventListener("error", (e: ErrorEvent) => {
      errors_ref.current.push(
        `${e.message} (${e.filename}:${e.lineno}:${e.colno})`
      );
    });

    // 包 console.error（以 defineProperty 包一層）
    try {
      const win_as_any = win as unknown as { console: { error: (...args: unknown[]) => void } };
      const orig_err = win_as_any.console.error.bind(win_as_any.console);
      win_as_any.console.error = (...args: unknown[]) => {
        errors_ref.current.push(args.map(String).join(" "));
        orig_err(...args);
      };
    } catch {
      // ignore if console is not accessible (cross-origin)
    }

    // 若有 pending done-request，等 3s 收集 errors 後送 ack
    if (pending_done_ref.current) {
      const pending = pending_done_ref.current;

      // Clear any existing collect timer
      if (error_collect_timer_ref.current) {
        clearTimeout(error_collect_timer_ref.current);
      }

      error_collect_timer_ref.current = setTimeout(() => {
        ws.send({
          type: "done-ack",
          correlationId: pending.correlation_id,
          loaded: true,
          consoleErrors: [...errors_ref.current],
        });
        ws.clearPendingDone(pending.correlation_id);
        pending_done_ref.current = null;
        error_collect_timer_ref.current = null;
      }, ERROR_COLLECT_MS);
    }
  }, [ws]);

  // ── WS event handlers ────────────────────────────────────────────────

  useEffect(() => {
    const unsubs: Array<() => void> = [];

    // show-to-user → navigate iframe
    unsubs.push(ws.on("show-to-user", (event) => {
      if (event.projectSlug !== projectSlug) return;
      set_iframe_src(fileUrl(projectSlug, event.path));
      set_load_error(false);
      onPathChange?.(event.path);
    }));

    // done-request → navigate + collect errors + send ack
    unsubs.push(ws.on("done-request", (event) => {
      if (event.projectSlug !== projectSlug) return;

      // 清除舊的計時器
      if (load_timer_ref.current) clearTimeout(load_timer_ref.current);
      if (error_collect_timer_ref.current) clearTimeout(error_collect_timer_ref.current);

      const pending: PendingDoneState = {
        correlation_id: event.correlationId,
        path: event.path,
        started_at: Date.now(),
      };
      pending_done_ref.current = pending;
      errors_ref.current = [];

      // track for HMR replay
      ws.trackPendingDone({
        correlationId: event.correlationId,
        path: event.path,
        startedAt: pending.started_at,
      });

      // Navigate iframe
      set_iframe_src(fileUrl(projectSlug, event.path));
      set_load_error(false);
      onPathChange?.(event.path);

      // 5s timeout — if load hasn't fired, send ack with loaded:false
      load_timer_ref.current = setTimeout(() => {
        if (pending_done_ref.current?.correlation_id !== event.correlationId) return;

        ws.send({
          type: "done-ack",
          correlationId: event.correlationId,
          loaded: false,
          consoleErrors: [],
        });
        ws.clearPendingDone(event.correlationId);
        pending_done_ref.current = null;
        set_load_error(true);
        load_timer_ref.current = null;
      }, LOAD_TIMEOUT_MS);
    }));

    return () => unsubs.forEach((fn) => fn());
  }, [projectSlug, ws, onPathChange]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (load_timer_ref.current) clearTimeout(load_timer_ref.current);
      if (error_collect_timer_ref.current) clearTimeout(error_collect_timer_ref.current);
    };
  }, []);

  // ── Render ────────────────────────────────────────────────────────────

  if (!iframe_src) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        尚未選取檔案
      </div>
    );
  }

  if (load_error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-sm">
        <p className="text-destructive">預覽載入失敗（逾時）</p>
        <button
          className="text-primary underline"
          onClick={() => {
            set_load_error(false);
            set_iframe_src((s) => (s ? s + "" : s)); // force re-render
          }}
        >
          重試
        </button>
      </div>
    );
  }

  return (
    <iframe
      ref={iframe_ref}
      src={iframe_src}
      sandbox="allow-scripts allow-same-origin"
      onLoad={handleIframeLoad}
      className="w-full h-full border-0"
      title="預覽"
      aria-label="預覽 iframe"
    />
  );
}

// ── Exported test utilities ─────────────────────────────────────────────

/**
 * 供測試直接呼叫 Preview 內部邏輯的工廠函式。
 * 不用 React，直接模擬行為。
 */
export function createPreviewHandlers(
  projectSlug: string,
  ws: UseWsReturn,
  callbacks: {
    onSetSrc: (src: string | null) => void;
    onSetLoadError: (v: boolean) => void;
    onPathChange?: (path: string) => void;
  }
): IframeHookHandlers {
  const errors_ref = { current: [] as string[] };
  const pending_ref = { current: null as PendingDoneState | null };
  const load_timer = { current: null as ReturnType<typeof setTimeout> | null };
  const collect_timer = { current: null as ReturnType<typeof setTimeout> | null };
  const mock_content_window = { current: null as unknown };

  function handleIframeLoad() {
    const win = mock_content_window.current as {
      addEventListener?: (type: string, fn: (e: unknown) => void) => void;
      console?: { error: (...args: unknown[]) => void };
    } | null;

    errors_ref.current = [];
    if (load_timer.current) {
      clearTimeout(load_timer.current);
      load_timer.current = null;
    }

    if (win) {
      win.addEventListener?.("error", (e: unknown) => {
        const ev = e as ErrorEvent;
        errors_ref.current.push(`${ev.message} (${ev.filename}:${ev.lineno}:${ev.colno})`);
      });
    }

    if (pending_ref.current) {
      const pending = pending_ref.current;
      if (collect_timer.current) clearTimeout(collect_timer.current);

      collect_timer.current = setTimeout(() => {
        ws.send({
          type: "done-ack",
          correlationId: pending.correlation_id,
          loaded: true,
          consoleErrors: [...errors_ref.current],
        });
        ws.clearPendingDone(pending.correlation_id);
        pending_ref.current = null;
        collect_timer.current = null;
      }, ERROR_COLLECT_MS);
    }
  }

  function handleDoneRequest(correlationId: string, path: string) {
    if (load_timer.current) clearTimeout(load_timer.current);
    if (collect_timer.current) clearTimeout(collect_timer.current);

    const pending: PendingDoneState = {
      correlation_id: correlationId,
      path,
      started_at: Date.now(),
    };
    pending_ref.current = pending;
    errors_ref.current = [];

    ws.trackPendingDone({ correlationId, path, startedAt: pending.started_at });
    callbacks.onSetSrc(fileUrl(projectSlug, path));
    callbacks.onSetLoadError(false);
    callbacks.onPathChange?.(path);

    load_timer.current = setTimeout(() => {
      if (pending_ref.current?.correlation_id !== correlationId) return;
      ws.send({
        type: "done-ack",
        correlationId,
        loaded: false,
        consoleErrors: [],
      });
      ws.clearPendingDone(correlationId);
      pending_ref.current = null;
      callbacks.onSetLoadError(true);
      load_timer.current = null;
    }, LOAD_TIMEOUT_MS);
  }

  function handleShowToUser(path: string) {
    callbacks.onSetSrc(fileUrl(projectSlug, path));
    callbacks.onSetLoadError(false);
    callbacks.onPathChange?.(path);
  }

  return { handleDoneRequest, handleShowToUser, handleIframeLoad };
}
