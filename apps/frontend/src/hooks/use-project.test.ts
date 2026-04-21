// use-project tests — Zustand store
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useProjectStore } from "./use-project";
import type { ApiProject } from "../api/client";

// Mock the API client
vi.mock("../api/client", () => ({
  listProjects: vi.fn(),
  createProject: vi.fn(),
  deleteProject: vi.fn(),
  getProject: vi.fn(),
}));

import { listProjects, createProject, deleteProject } from "../api/client";

const mockListProjects = vi.mocked(listProjects);
const mockCreateProject = vi.mocked(createProject);
const mockDeleteProject = vi.mocked(deleteProject);

const projectA: ApiProject = {
  slug: "project-a",
  name: "Project A",
  createdAt: "2024-01-01T00:00:00Z",
};

const projectB: ApiProject = {
  slug: "project-b",
  name: "Project B",
  createdAt: "2024-01-02T00:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  // Reset store state between tests
  useProjectStore.setState({
    projects: [],
    current_slug: null,
    loading: false,
    error: null,
  });
});

describe("useProjectStore — load", () => {
  it("should load projects and auto-select the first one", async () => {
    mockListProjects.mockResolvedValue([projectA, projectB]);

    const { result } = renderHook(() => useProjectStore());

    await act(async () => {
      await result.current.load();
    });

    expect(result.current.projects).toHaveLength(2);
    expect(result.current.current_slug).toBe("project-a");
    expect(result.current.loading).toBe(false);
  });

  it("should set error state when load fails", async () => {
    mockListProjects.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useProjectStore());

    await act(async () => {
      await result.current.load();
    });

    expect(result.current.error).toContain("Network error");
    expect(result.current.loading).toBe(false);
  });

  it("should set current_slug to null when no projects exist", async () => {
    mockListProjects.mockResolvedValue([]);

    const { result } = renderHook(() => useProjectStore());

    await act(async () => {
      await result.current.load();
    });

    expect(result.current.current_slug).toBeNull();
    expect(result.current.projects).toHaveLength(0);
  });
});

describe("useProjectStore — setCurrent", () => {
  it("should update current_slug", () => {
    useProjectStore.setState({ projects: [projectA, projectB], current_slug: "project-a" });

    const { result } = renderHook(() => useProjectStore());

    act(() => {
      result.current.setCurrent("project-b");
    });

    expect(result.current.current_slug).toBe("project-b");
  });

  it("should accept null to deselect", () => {
    useProjectStore.setState({ projects: [projectA], current_slug: "project-a" });

    const { result } = renderHook(() => useProjectStore());

    act(() => {
      result.current.setCurrent(null);
    });

    expect(result.current.current_slug).toBeNull();
  });
});

describe("useProjectStore — create", () => {
  it("should add project to list and set it as current", async () => {
    mockCreateProject.mockResolvedValue(projectB);
    useProjectStore.setState({ projects: [projectA], current_slug: "project-a" });

    const { result } = renderHook(() => useProjectStore());

    await act(async () => {
      await result.current.create("Project B");
    });

    expect(mockCreateProject).toHaveBeenCalledWith("Project B");
    expect(result.current.projects).toHaveLength(2);
    expect(result.current.current_slug).toBe("project-b");
  });

  it("should return the created project", async () => {
    mockCreateProject.mockResolvedValue(projectA);

    const { result } = renderHook(() => useProjectStore());
    let created: ApiProject | undefined;

    await act(async () => {
      created = await result.current.create("Project A");
    });

    expect(created?.slug).toBe("project-a");
  });
});

describe("useProjectStore — remove", () => {
  it("should remove project from list", async () => {
    mockDeleteProject.mockResolvedValue({ ok: true });
    useProjectStore.setState({ projects: [projectA, projectB], current_slug: "project-a" });

    const { result } = renderHook(() => useProjectStore());

    await act(async () => {
      await result.current.remove("project-b");
    });

    expect(result.current.projects).toHaveLength(1);
    expect(result.current.projects[0].slug).toBe("project-a");
  });

  it("should switch to first remaining project when current is deleted", async () => {
    mockDeleteProject.mockResolvedValue({ ok: true });
    useProjectStore.setState({ projects: [projectA, projectB], current_slug: "project-a" });

    const { result } = renderHook(() => useProjectStore());

    await act(async () => {
      await result.current.remove("project-a");
    });

    expect(result.current.current_slug).toBe("project-b");
  });

  it("should set current to null when last project is deleted", async () => {
    mockDeleteProject.mockResolvedValue({ ok: true });
    useProjectStore.setState({ projects: [projectA], current_slug: "project-a" });

    const { result } = renderHook(() => useProjectStore());

    await act(async () => {
      await result.current.remove("project-a");
    });

    expect(result.current.current_slug).toBeNull();
    expect(result.current.projects).toHaveLength(0);
  });
});
