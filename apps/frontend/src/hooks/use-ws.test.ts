// use-ws tests — covering WS manager directly (no React hook overhead)
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createWsManager, type PendingDoneRequest } from "./use-ws";
import type { ServerToClientEventType } from "@design-house/shared/events";

// ── Mock WebSocket ─────────────────────────────────────────────────

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState: number = MockWebSocket.CONNECTING;
  url: string;
  onopen: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onclose: ((e: CloseEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;

  private sent_messages: string[] = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent_messages.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ type: "close" } as CloseEvent);
  }

  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.({ type: "open" } as Event);
  }

  simulateMessage(data: unknown) {
    this.onmessage?.({
      type: "message",
      data: JSON.stringify(data),
    } as MessageEvent);
  }

  simulateClose() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ type: "close" } as CloseEvent);
  }

  getSentMessages(): unknown[] {
    return this.sent_messages.map((m) => JSON.parse(m));
  }

  static instances: MockWebSocket[] = [];
  static reset() {
    MockWebSocket.instances = [];
  }
}

// ── Helpers ────────────────────────────────────────────────────────

function createManager(overrides?: {
  projectSlug?: string | null;
  onEvent?: (e: ServerToClientEventType) => void;
  onStatusChange?: (s: "connecting" | "connected" | "disconnected") => void;
  pendingDones?: Map<string, PendingDoneRequest>;
  onReplayDone?: (req: PendingDoneRequest) => void;
}) {
  const onEvent = overrides?.onEvent ?? vi.fn();
  const onStatusChange = overrides?.onStatusChange ?? vi.fn();
  const pendingDones = overrides?.pendingDones ?? new Map();
  const onReplayDone = overrides?.onReplayDone ?? vi.fn();

  // Use undefined check (not ??) so explicit null is preserved
  const projectSlug = "projectSlug" in (overrides ?? {})
    ? overrides!.projectSlug ?? null
    : "test-project";

  const manager = createWsManager({
    projectSlug,
    wsUrl: "ws://localhost/ws",
    WebSocketClass: MockWebSocket as unknown as typeof WebSocket,
    onEvent,
    onStatusChange,
    getPendingDones: () => pendingDones,
    onReplayDone,
  });

  return { manager, onEvent, onStatusChange, onReplayDone };
}

function latestSocket(): MockWebSocket {
  return MockWebSocket.instances[MockWebSocket.instances.length - 1];
}

beforeEach(() => {
  MockWebSocket.reset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Tests ──────────────────────────────────────────────────────────

describe("WS manager — subscribe flow", () => {
  it("should connect and send subscribe message after open", () => {
    const { manager } = createManager({ projectSlug: "my-project" });
    manager.connect();

    const ws = latestSocket();
    ws.simulateOpen();

    const messages = ws.getSentMessages() as Array<{ type: string; projectSlug?: string }>;
    expect(messages.some((m) => m.type === "subscribe" && m.projectSlug === "my-project")).toBe(true);
  });

  it("should call onStatusChange with connected after open", () => {
    const onStatusChange = vi.fn();
    const { manager } = createManager({ onStatusChange });
    manager.connect();
    latestSocket().simulateOpen();
    expect(onStatusChange).toHaveBeenCalledWith("connected");
  });

  it("should dispatch parsed server events to onEvent", () => {
    const onEvent = vi.fn();
    const { manager } = createManager({ onEvent });
    manager.connect();
    latestSocket().simulateOpen();

    latestSocket().simulateMessage({
      type: "ready",
      projectSlug: "my-project",
    });

    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ready", projectSlug: "my-project" })
    );
  });

  it("should not dispatch events that fail schema parsing", () => {
    const onEvent = vi.fn();
    const { manager } = createManager({ onEvent });
    manager.connect();
    latestSocket().simulateOpen();

    latestSocket().simulateMessage({ type: "unknown-garbage" });

    expect(onEvent).not.toHaveBeenCalled();
  });

  it("should not send subscribe when projectSlug is null", () => {
    const { manager } = createManager({ projectSlug: null });
    manager.connect();
    latestSocket().simulateOpen();

    const messages = latestSocket().getSentMessages() as Array<{ type: string }>;
    expect(messages.some((m) => m.type === "subscribe")).toBe(false);
  });
});

describe("WS manager — reconnect with exponential backoff", () => {
  it("should attempt reconnect after disconnect", () => {
    const { manager } = createManager();
    manager.connect();
    latestSocket().simulateOpen();
    latestSocket().simulateClose();

    expect(MockWebSocket.instances).toHaveLength(1);
    // After 1s base delay, reconnect fires
    vi.advanceTimersByTime(1000);
    expect(MockWebSocket.instances).toHaveLength(2);
  });

  it("should use exponential backoff (1s, 2s, 4s...) across consecutive failures", () => {
    const { manager } = createManager();
    manager.connect();

    // First disconnect (never opened — consecutive failure)
    latestSocket().simulateClose();
    // attempt=0 → delay=1s
    vi.advanceTimersByTime(999);
    expect(MockWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(MockWebSocket.instances).toHaveLength(2);

    // Second disconnect (still never opened — consecutive)
    latestSocket().simulateClose();
    // attempt=1 → delay=2s
    vi.advanceTimersByTime(1999);
    expect(MockWebSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(MockWebSocket.instances).toHaveLength(3);
  });

  it("should cap reconnect delay at 30s", () => {
    const { manager } = createManager();

    // Simulate many disconnects to exhaust backoff
    manager.connect();
    for (let i = 0; i < 10; i++) {
      latestSocket().simulateOpen();
      latestSocket().simulateClose();
      vi.advanceTimersByTime(30_001);
    }

    // All 10 reconnects happened, no hang
    expect(MockWebSocket.instances.length).toBeGreaterThan(5);
  });

  it("should call onStatusChange with disconnected after close", () => {
    const onStatusChange = vi.fn();
    const { manager } = createManager({ onStatusChange });
    manager.connect();
    latestSocket().simulateOpen();
    latestSocket().simulateClose();
    expect(onStatusChange).toHaveBeenCalledWith("disconnected");
  });
});

describe("WS manager — ping/pong", () => {
  it("should send ping after 30s", () => {
    const { manager } = createManager();
    manager.connect();
    latestSocket().simulateOpen();

    vi.advanceTimersByTime(30_000);

    const messages = latestSocket().getSentMessages() as Array<{ type: string }>;
    expect(messages.some((m) => m.type === "ping")).toBe(true);
  });

  it("should reset missed pong count when pong received", () => {
    const onEvent = vi.fn();
    const { manager } = createManager({ onEvent });
    manager.connect();
    latestSocket().simulateOpen();

    vi.advanceTimersByTime(30_000);
    latestSocket().simulateMessage({ type: "pong" });
    vi.advanceTimersByTime(30_000);

    // should still be connected (no close triggered)
    expect(latestSocket().readyState).toBe(MockWebSocket.OPEN);
  });

  it("should close and reconnect when server misses 2+ pongs", () => {
    const { manager } = createManager();
    manager.connect();
    latestSocket().simulateOpen();

    // 3 ping intervals with no pong response → missedPongs becomes 3
    vi.advanceTimersByTime(90_001);

    // reconnect should have fired
    vi.advanceTimersByTime(1000);
    expect(MockWebSocket.instances.length).toBeGreaterThan(1);
  });
});

describe("WS manager — HMR pending replay", () => {
  it("should replay pending done-requests within 5s on reconnect", () => {
    const onReplayDone = vi.fn();
    const pendingDones = new Map<string, PendingDoneRequest>();
    const req: PendingDoneRequest = {
      correlationId: "corr-123",
      path: "index.html",
      startedAt: Date.now(),
    };
    pendingDones.set("corr-123", req);

    const { manager } = createManager({ onReplayDone, pendingDones });
    manager.connect();
    latestSocket().simulateOpen();

    expect(onReplayDone).toHaveBeenCalledWith(req);
  });

  it("should drop pending done-requests older than 5s on reconnect", () => {
    const onReplayDone = vi.fn();
    const pendingDones = new Map<string, PendingDoneRequest>();
    const req: PendingDoneRequest = {
      correlationId: "old-corr",
      path: "index.html",
      startedAt: Date.now() - 6_000, // 6 seconds ago
    };
    pendingDones.set("old-corr", req);

    const { manager } = createManager({ onReplayDone, pendingDones });
    manager.connect();
    latestSocket().simulateOpen();

    expect(onReplayDone).not.toHaveBeenCalled();
  });
});

describe("WS manager — send", () => {
  it("should send JSON data when socket is open", () => {
    const { manager } = createManager();
    manager.connect();
    latestSocket().simulateOpen();

    manager.send({ type: "user-message", projectSlug: "p", content: "hi", clientMessageId: "1" });

    const messages = latestSocket().getSentMessages() as Array<{ type: string }>;
    expect(messages.some((m) => m.type === "user-message")).toBe(true);
  });

  it("should not throw when socket is not open", () => {
    const { manager } = createManager();
    manager.connect();
    // Don't open — socket is in CONNECTING state
    expect(() => manager.send({ type: "ping" })).not.toThrow();
  });
});

describe("WS manager — destroy", () => {
  it("should close socket and stop reconnects after destroy", () => {
    const { manager } = createManager();
    manager.connect();
    latestSocket().simulateOpen();
    manager.destroy();
    latestSocket().simulateClose();

    vi.advanceTimersByTime(30_000);
    // No new socket created after destroy
    expect(MockWebSocket.instances).toHaveLength(1);
  });
});
