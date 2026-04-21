// FileTree panel tests
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import FileTree from "./FileTree";
import type { UseWsReturn, WsEventType, WsListener } from "../hooks/use-ws";
import type { FileTree as FileTreeData } from "../api/client";

// Mock API client
vi.mock("../api/client", () => ({
  listFiles: vi.fn(),
}));

import { listFiles } from "../api/client";
const mockListFiles = vi.mocked(listFiles);

// ── WS mock ─────────────────────────────────────────────────────────────

function createMockWs(): UseWsReturn & {
  _trigger: <T extends WsEventType>(type: T, data: object) => void;
} {
  const listeners = new Map<string, Set<WsListener<WsEventType>>>();

  return {
    on: vi.fn((type, listener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener as WsListener<WsEventType>);
      return () => listeners.get(type)?.delete(listener as WsListener<WsEventType>);
    }),
    send: vi.fn(),
    trackPendingDone: vi.fn(),
    clearPendingDone: vi.fn(),
    status: "connected",
    _trigger: (type, data) => {
      const ls = listeners.get(type);
      if (!ls) return;
      for (const l of ls) {
        (l as (d: unknown) => void)({ type, ...data });
      }
    },
  };
}

const baseTree: FileTreeData = {
  path: ".",
  entries: [
    { name: "index.html", type: "file", size: 1024 },
    { name: "style.css", type: "file", size: 512 },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockListFiles.mockResolvedValue(baseTree);
});

describe("FileTree panel — initial load", () => {
  it("should load and display files on mount", async () => {
    const ws = createMockWs();
    render(<FileTree projectSlug="test-project" ws={ws} onSelect={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByLabelText("index.html")).toBeInTheDocument();
      expect(screen.getByLabelText("style.css")).toBeInTheDocument();
    });

    expect(mockListFiles).toHaveBeenCalledWith("test-project", { depth: 5 });
  });

  it("should show loading state initially", () => {
    // Make listFiles hang
    mockListFiles.mockReturnValue(new Promise(() => {}));
    const ws = createMockWs();
    render(<FileTree projectSlug="test-project" ws={ws} onSelect={vi.fn()} />);

    expect(screen.getByText("載入中…")).toBeInTheDocument();
  });

  it("should show empty state when no files", async () => {
    mockListFiles.mockResolvedValue({ path: ".", entries: [] });
    const ws = createMockWs();
    render(<FileTree projectSlug="test-project" ws={ws} onSelect={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("（空）")).toBeInTheDocument();
    });
  });
});

describe("FileTree panel — file selection", () => {
  it("should call onSelect with filename when file clicked", async () => {
    const onSelect = vi.fn();
    const ws = createMockWs();
    render(<FileTree projectSlug="test-project" ws={ws} onSelect={onSelect} />);

    await waitFor(() => screen.getByLabelText("index.html"));
    fireEvent.click(screen.getByLabelText("index.html"));

    expect(onSelect).toHaveBeenCalledWith("index.html");
  });
});

describe("FileTree panel — fs-change updates", () => {
  it("should add new file when fs-change write event received", async () => {
    const ws = createMockWs();
    render(<FileTree projectSlug="test-project" ws={ws} onSelect={vi.fn()} />);
    await waitFor(() => screen.getByLabelText("index.html"));

    act(() => {
      ws._trigger("fs-change", {
        projectSlug: "test-project",
        op: "write",
        path: "app.js",
      });
    });

    expect(screen.getByLabelText("app.js")).toBeInTheDocument();
  });

  it("should remove file when fs-change delete event received", async () => {
    const ws = createMockWs();
    render(<FileTree projectSlug="test-project" ws={ws} onSelect={vi.fn()} />);
    await waitFor(() => screen.getByLabelText("index.html"));

    act(() => {
      ws._trigger("fs-change", {
        projectSlug: "test-project",
        op: "delete",
        path: "style.css",
      });
    });

    expect(screen.queryByLabelText("style.css")).not.toBeInTheDocument();
  });

  it("should rename file when fs-change rename event received", async () => {
    const ws = createMockWs();
    render(<FileTree projectSlug="test-project" ws={ws} onSelect={vi.fn()} />);
    await waitFor(() => screen.getByLabelText("index.html"));

    act(() => {
      ws._trigger("fs-change", {
        projectSlug: "test-project",
        op: "rename",
        path: "home.html",
        oldPath: "index.html",
      });
    });

    expect(screen.queryByLabelText("index.html")).not.toBeInTheDocument();
    expect(screen.getByLabelText("home.html")).toBeInTheDocument();
  });

  it("should ignore fs-change events from other projects", async () => {
    const ws = createMockWs();
    render(<FileTree projectSlug="test-project" ws={ws} onSelect={vi.fn()} />);
    await waitFor(() => screen.getByLabelText("index.html"));

    act(() => {
      ws._trigger("fs-change", {
        projectSlug: "other-project",
        op: "delete",
        path: "index.html",
      });
    });

    // index.html should still be there
    expect(screen.getByLabelText("index.html")).toBeInTheDocument();
  });
});
