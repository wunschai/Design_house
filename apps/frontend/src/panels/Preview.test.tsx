// Preview panel tests — using createPreviewHandlers for core logic
// jsdom does not support real iframe cross-frame API, so we test
// the internal handlers directly via the exported test utility.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import Preview, { createPreviewHandlers } from "./Preview";
import type { UseWsReturn } from "../hooks/use-ws";

// ── WS mock ─────────────────────────────────────────────────────────────

function createMockWs(): UseWsReturn & {
  _trigger: (type: string, data: object) => void;
} {
  const listeners = new Map<string, Set<(d: unknown) => void>>();
  return {
    on: vi.fn((type, listener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener as (d: unknown) => void);
      return () => listeners.get(type)?.delete(listener as (d: unknown) => void);
    }),
    send: vi.fn(),
    trackPendingDone: vi.fn(),
    clearPendingDone: vi.fn(),
    status: "connected",
    _trigger: (type, data) => {
      const ls = listeners.get(type);
      if (!ls) return;
      for (const l of ls) l({ type, ...data });
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Handler-level tests ──────────────────────────────────────────────

describe("Preview handlers — show-to-user", () => {
  it("should update src when show-to-user is called", () => {
    const ws = createMockWs();
    const onSetSrc = vi.fn();

    const handlers = createPreviewHandlers("test-project", ws, {
      onSetSrc,
      onSetLoadError: vi.fn(),
    });

    handlers.handleShowToUser("index.html");

    expect(onSetSrc).toHaveBeenCalledWith("/api/projects/test-project/files/index.html");
  });

  it("should call onPathChange when show-to-user triggers navigation", () => {
    const ws = createMockWs();
    const onPathChange = vi.fn();

    const handlers = createPreviewHandlers("test-project", ws, {
      onSetSrc: vi.fn(),
      onSetLoadError: vi.fn(),
      onPathChange,
    });

    handlers.handleShowToUser("about.html");
    expect(onPathChange).toHaveBeenCalledWith("about.html");
  });
});

describe("Preview handlers — done-request flow (AC-4.2/4.3)", () => {
  it("should navigate to path on done-request", () => {
    const ws = createMockWs();
    const onSetSrc = vi.fn();

    const handlers = createPreviewHandlers("test-project", ws, {
      onSetSrc,
      onSetLoadError: vi.fn(),
    });

    handlers.handleDoneRequest("corr-1", "index.html");

    expect(onSetSrc).toHaveBeenCalledWith("/api/projects/test-project/files/index.html");
  });

  it("should track pending done for HMR replay", () => {
    const ws = createMockWs();

    const handlers = createPreviewHandlers("test-project", ws, {
      onSetSrc: vi.fn(),
      onSetLoadError: vi.fn(),
    });

    handlers.handleDoneRequest("corr-123", "index.html");

    expect(ws.trackPendingDone).toHaveBeenCalledWith(
      expect.objectContaining({ correlationId: "corr-123", path: "index.html" })
    );
  });

  it("should send done-ack with loaded:true after iframe load + 3s", () => {
    const ws = createMockWs();

    const handlers = createPreviewHandlers("test-project", ws, {
      onSetSrc: vi.fn(),
      onSetLoadError: vi.fn(),
    });

    handlers.handleDoneRequest("corr-1", "index.html");
    handlers.handleIframeLoad(); // simulate iframe load event

    // 3s collection window
    act(() => {
      vi.advanceTimersByTime(3_000);
    });

    expect(ws.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "done-ack",
        correlationId: "corr-1",
        loaded: true,
        consoleErrors: [],
      })
    );
    expect(ws.clearPendingDone).toHaveBeenCalledWith("corr-1");
  });

  it("should send done-ack with loaded:false when load times out (AC-4.5)", () => {
    const ws = createMockWs();
    const onSetLoadError = vi.fn();

    const handlers = createPreviewHandlers("test-project", ws, {
      onSetSrc: vi.fn(),
      onSetLoadError,
    });

    handlers.handleDoneRequest("corr-timeout", "slow.html");
    // Don't call handleIframeLoad — simulate timeout

    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    expect(ws.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "done-ack",
        correlationId: "corr-timeout",
        loaded: false,
        consoleErrors: [],
      })
    );
    expect(onSetLoadError).toHaveBeenCalledWith(true);
  });

  it("should clear previous pending when new done-request arrives (spec §4.1 条 5)", () => {
    const ws = createMockWs();
    const onSetSrc = vi.fn();

    const handlers = createPreviewHandlers("test-project", ws, {
      onSetSrc,
      onSetLoadError: vi.fn(),
    });

    // First request
    handlers.handleDoneRequest("corr-1", "a.html");
    // Second request comes in before first loads
    handlers.handleDoneRequest("corr-2", "b.html");

    // Load fires
    handlers.handleIframeLoad();

    act(() => {
      vi.advanceTimersByTime(3_000);
    });

    // Should only ack the second request
    const acks = vi.mocked(ws.send).mock.calls.filter(
      (c) => (c[0] as { type: string }).type === "done-ack"
    );
    expect(acks).toHaveLength(1);
    expect(acks[0][0]).toMatchObject({ correlationId: "corr-2" });
  });
});

// ── Component-level rendering tests ─────────────────────────────────────

describe("Preview component — render", () => {
  it("should show empty state when no currentPath", () => {
    const ws = createMockWs();
    render(
      <Preview projectSlug="test-project" currentPath={null} ws={ws} />
    );
    expect(screen.getByText("尚未選取檔案")).toBeInTheDocument();
  });

  it("should render iframe when currentPath is provided", () => {
    const ws = createMockWs();
    render(
      <Preview projectSlug="test-project" currentPath="index.html" ws={ws} />
    );
    const iframe = screen.getByLabelText("預覽 iframe");
    expect(iframe).toBeInTheDocument();
    expect(iframe.getAttribute("src")).toBe("/api/projects/test-project/files/index.html");
  });

  it("should have correct sandbox attribute", () => {
    const ws = createMockWs();
    render(
      <Preview projectSlug="test-project" currentPath="index.html" ws={ws} />
    );
    const iframe = screen.getByLabelText("預覽 iframe");
    expect(iframe.getAttribute("sandbox")).toBe("allow-scripts allow-same-origin");
  });

  it("should update iframe src when show-to-user WS event received", () => {
    const ws = createMockWs();
    const { rerender } = render(
      <Preview projectSlug="test-project" currentPath="index.html" ws={ws} />
    );

    act(() => {
      ws._trigger("show-to-user", { projectSlug: "test-project", path: "about.html" });
    });

    // After act, React has re-rendered synchronously
    const iframe = screen.getByLabelText("預覽 iframe");
    expect(iframe.getAttribute("src")).toBe("/api/projects/test-project/files/about.html");
    // suppress unused rerender warning
    void rerender;
  });

  it("should ignore show-to-user events from other projects", () => {
    const ws = createMockWs();
    render(
      <Preview projectSlug="test-project" currentPath="index.html" ws={ws} />
    );

    act(() => {
      ws._trigger("show-to-user", { projectSlug: "other-project", path: "other.html" });
    });

    const iframe = screen.getByLabelText("預覽 iframe");
    expect(iframe.getAttribute("src")).toBe("/api/projects/test-project/files/index.html");
  });

  it("should navigate iframe when done-request WS event received", () => {
    const ws = createMockWs();
    render(
      <Preview projectSlug="test-project" currentPath={null} ws={ws} />
    );

    act(() => {
      ws._trigger("done-request", {
        projectSlug: "test-project",
        correlationId: "corr-abc",
        path: "result.html",
      });
    });

    const iframe = screen.getByLabelText("預覽 iframe");
    expect(iframe.getAttribute("src")).toBe("/api/projects/test-project/files/result.html");
  });
});
