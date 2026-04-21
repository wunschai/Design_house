// Chat panel tests
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Chat from "./Chat";
import type { UseWsReturn } from "../hooks/use-ws";
import type { ApiMessage } from "../api/client";

// Mock API client
vi.mock("../api/client", () => ({
  listMessages: vi.fn().mockResolvedValue([]),
}));

import { listMessages } from "../api/client";
const mockListMessages = vi.mocked(listMessages);

// ── WS mock factory ─────────────────────────────────────────────────

type MockWs = UseWsReturn & { _trigger: (type: string, data: Record<string, unknown>) => void };

function createMockWs(): MockWs {
  const listeners = new Map<string, Set<(d: unknown) => void>>();
  const send_mock = vi.fn();

  return {
    on: vi.fn((type, listener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener as (d: unknown) => void);
      return () => listeners.get(type)?.delete(listener as (d: unknown) => void);
    }),
    send: send_mock,
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
  vi.clearAllMocks();
  mockListMessages.mockResolvedValue([]);
});

describe("Chat panel — initial render", () => {
  it("should render input and send button", async () => {
    const ws = createMockWs();
    render(<Chat projectSlug="test-project" ws={ws} />);
    await waitFor(() => {
      expect(screen.getByLabelText("訊息輸入")).toBeInTheDocument();
      expect(screen.getByLabelText("送出")).toBeInTheDocument();
    });
  });

  it("should load historical messages on mount", async () => {
    const messages: ApiMessage[] = [
      {
        id: "msg-1",
        projectSlug: "test-project",
        role: "user",
        content: "Hello",
        createdAt: "2024-01-01T00:00:00Z",
      },
    ];
    mockListMessages.mockResolvedValue(messages);

    render(<Chat projectSlug="test-project" ws={createMockWs()} />);

    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });
  });
});

describe("Chat panel — send message (AC-3.1 busy state)", () => {
  it("should disable input and show thinking indicator within 500ms of send", async () => {
    const ws = createMockWs();
    render(<Chat projectSlug="test-project" ws={ws} />);
    await waitFor(() => screen.getByLabelText("訊息輸入"));

    const input = screen.getByLabelText("訊息輸入");
    await userEvent.type(input, "test message");

    act(() => {
      fireEvent.click(screen.getByLabelText("送出"));
    });

    // Input should be disabled immediately (< 500ms)
    expect(input).toBeDisabled();
    expect(screen.getByLabelText("AI 思考中")).toBeInTheDocument();
  });

  it("should send user-message via WS when send button clicked", async () => {
    const ws = createMockWs();
    render(<Chat projectSlug="test-project" ws={ws} />);
    await waitFor(() => screen.getByLabelText("訊息輸入"));

    await userEvent.type(screen.getByLabelText("訊息輸入"), "hello world");
    fireEvent.click(screen.getByLabelText("送出"));

    expect(ws.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "user-message",
        projectSlug: "test-project",
        content: "hello world",
      })
    );
  });

  it("should not send empty message", async () => {
    const ws = createMockWs();
    render(<Chat projectSlug="test-project" ws={ws} />);
    await waitFor(() => screen.getByLabelText("訊息輸入"));

    fireEvent.click(screen.getByLabelText("送出"));
    expect(ws.send).not.toHaveBeenCalled();
  });

  it("should clear input after send", async () => {
    const ws = createMockWs();
    render(<Chat projectSlug="test-project" ws={ws} />);
    await waitFor(() => screen.getByLabelText("訊息輸入"));

    const input = screen.getByLabelText("訊息輸入") as HTMLInputElement;
    await userEvent.type(input, "test");
    fireEvent.click(screen.getByLabelText("送出"));

    expect(input.value).toBe("");
  });
});

describe("Chat panel — streaming (AC-3.3)", () => {
  it("should append chat-delta to messages in real time", async () => {
    const ws = createMockWs();
    render(<Chat projectSlug="test-project" ws={ws} />);
    await waitFor(() => screen.getByLabelText("訊息輸入"));

    act(() => {
      ws._trigger("chat-delta", { projectSlug: "test-project", messageId: "m1", delta: "Hello" });
    });
    expect(screen.getByText("Hello")).toBeInTheDocument();

    act(() => {
      ws._trigger("chat-delta", { projectSlug: "test-project", messageId: "m1", delta: " World" });
    });
    expect(screen.getByText("Hello World")).toBeInTheDocument();
  });

  it("should ignore chat-delta from other projects", async () => {
    const ws = createMockWs();
    render(<Chat projectSlug="test-project" ws={ws} />);
    await waitFor(() => screen.getByLabelText("訊息輸入"));

    act(() => {
      ws._trigger("chat-delta", { projectSlug: "other-project", messageId: "m1", delta: "Not mine" });
    });

    expect(screen.queryByText("Not mine")).not.toBeInTheDocument();
  });
});

describe("Chat panel — tool events (AC-3.4)", () => {
  it("should display tool-start with tool name and truncated input", async () => {
    const ws = createMockWs();
    render(<Chat projectSlug="test-project" ws={ws} />);
    await waitFor(() => screen.getByLabelText("訊息輸入"));

    act(() => {
      ws._trigger("tool-start", {
        projectSlug: "test-project",
        toolUseId: "tool-1",
        toolName: "write_file",
        inputSummary: "Writing index.html",
      });
    });

    expect(screen.getByLabelText("工具呼叫: write_file")).toBeInTheDocument();
    expect(screen.getByText("write_file")).toBeInTheDocument();
  });

  it("should truncate tool input summary at 200 chars", async () => {
    const ws = createMockWs();
    render(<Chat projectSlug="test-project" ws={ws} />);
    await waitFor(() => screen.getByLabelText("訊息輸入"));

    const longInput = "x".repeat(250);
    act(() => {
      ws._trigger("tool-start", {
        projectSlug: "test-project",
        toolUseId: "tool-2",
        toolName: "write_file",
        inputSummary: longInput,
      });
    });

    const chip = screen.getByLabelText("工具呼叫: write_file");
    expect(chip.textContent).toContain("…");
    expect(chip.textContent?.length).toBeLessThan(250);
  });
});

describe("Chat panel — cancel turn (AC-7.4)", () => {
  it("should show cancel button when turn is active", async () => {
    const ws = createMockWs();
    render(<Chat projectSlug="test-project" ws={ws} />);
    await waitFor(() => screen.getByLabelText("訊息輸入"));

    // Trigger message-ack to indicate turn is active
    act(() => {
      ws._trigger("message-ack", { clientMessageId: "c1", serverMessageId: "s1" });
    });

    expect(screen.getByLabelText("取消")).toBeInTheDocument();
  });

  it("should send cancel-turn on cancel button click", async () => {
    const ws = createMockWs();
    render(<Chat projectSlug="test-project" ws={ws} />);
    await waitFor(() => screen.getByLabelText("訊息輸入"));

    act(() => {
      ws._trigger("message-ack", { clientMessageId: "c1", serverMessageId: "s1" });
    });

    fireEvent.click(screen.getByLabelText("取消"));
    expect(ws.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: "cancel-turn", projectSlug: "test-project" })
    );
  });
});

describe("Chat panel — turn-end", () => {
  it("should re-enable input after turn-end event", async () => {
    const ws = createMockWs();
    render(<Chat projectSlug="test-project" ws={ws} />);
    await waitFor(() => screen.getByLabelText("訊息輸入"));

    const input = screen.getByLabelText("訊息輸入");
    await userEvent.type(input, "hello");
    fireEvent.click(screen.getByLabelText("送出"));
    expect(input).toBeDisabled();

    act(() => {
      ws._trigger("turn-end", { projectSlug: "test-project", messageId: "m1", reason: "complete" });
    });

    expect(input).not.toBeDisabled();
  });
});
