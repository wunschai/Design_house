// App layout tests
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import App from "./App";

// Mock sub-panels to avoid their own effects/WS deps
vi.mock("./panels/Chat", () => ({
  default: ({ projectSlug }: { projectSlug: string }) => (
    <div data-testid="chat-panel">Chat:{projectSlug}</div>
  ),
}));
vi.mock("./panels/Workspace", () => ({
  default: ({ projectSlug }: { projectSlug: string }) => (
    <div data-testid="workspace-panel">Workspace:{projectSlug}</div>
  ),
}));

// Mock resizable panels (not supported in jsdom)
vi.mock("./components/ui/resizable", () => ({
  ResizablePanelGroup: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="panel-group">{children}</div>
  ),
  ResizablePanel: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="panel">{children}</div>
  ),
  ResizableHandle: () => <div data-testid="resize-handle" />,
}));

// Mock use-ws hook
vi.mock("./hooks/use-ws", () => ({
  useWs: vi.fn(() => ({
    on: vi.fn(() => () => {}),
    send: vi.fn(),
    trackPendingDone: vi.fn(),
    clearPendingDone: vi.fn(),
    status: "connected",
  })),
}));

// Mock API client
vi.mock("./api/client", () => ({
  listProjects: vi.fn().mockResolvedValue([
    { slug: "project-a", name: "Project A", createdAt: "2024-01-01" },
    { slug: "project-b", name: "Project B", createdAt: "2024-01-02" },
  ]),
  createProject: vi.fn().mockResolvedValue({
    slug: "new-proj", name: "New Project", createdAt: "2024-01-03",
  }),
  deleteProject: vi.fn().mockResolvedValue({ ok: true }),
  fileUrl: vi.fn((slug: string, path: string) => `/api/projects/${slug}/files/${path}`),
}));

// Reset zustand store
import { useProjectStore } from "./hooks/use-project";

beforeEach(() => {
  vi.clearAllMocks();
  useProjectStore.setState({ projects: [], current_slug: null, loading: false, error: null });
});

describe("App layout", () => {
  it("should render two panels (chat + workspace) after projects load", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId("chat-panel")).toBeInTheDocument();
      expect(screen.getByTestId("workspace-panel")).toBeInTheDocument();
    });
  });

  it("should render project switcher in header", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText("切換專案")).toBeInTheDocument();
    });
  });

  it("should show current project name in switcher", async () => {
    render(<App />);

    await waitFor(() => {
      // first project should be auto-selected
      expect(screen.getByText("Project A")).toBeInTheDocument();
    });
  });

  it("should show empty state when no projects", async () => {
    const { listProjects } = await import("./api/client");
    vi.mocked(listProjects).mockResolvedValueOnce([]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/尚無專案/)).toBeInTheDocument();
    });
  });
});

describe("App — project switcher", () => {
  it("should show project switcher button with current project name", async () => {
    render(<App />);
    await waitFor(() => screen.getByLabelText("切換專案"));

    // Project A should be visible as the current project in the button
    const btn = screen.getByLabelText("切換專案");
    expect(btn).toHaveTextContent("Project A");
  });

  it("should switch current project when store is updated directly", async () => {
    render(<App />);
    await waitFor(() => screen.getByTestId("chat-panel"));

    // Directly update store to simulate project switch
    act(() => {
      useProjectStore.setState({ current_slug: "project-b" });
    });

    await waitFor(() => {
      expect(screen.getByTestId("chat-panel")).toHaveTextContent("project-b");
    });
  });
});

describe("App — new project dialog", () => {
  it("should open dialog when 新增專案 is clicked", async () => {
    const { listProjects } = await import("./api/client");
    vi.mocked(listProjects).mockResolvedValueOnce([]);

    render(<App />);
    await waitFor(() => screen.getByText(/尚無專案/));

    fireEvent.click(screen.getByText("新增專案"));

    await waitFor(() => {
      expect(screen.getByLabelText("專案名稱輸入")).toBeInTheDocument();
    });
  });
});
