// API client tests — Red phase
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  listProjects,
  createProject,
  getProject,
  deleteProject,
  listMessages,
  listFiles,
  fileUrl,
} from "./client";

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockReset();
});

function mockResponse(data: unknown, status = 200) {
  mockFetch.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  });
}

describe("listProjects", () => {
  it("should GET /api/projects and return array", async () => {
    const projects = [{ slug: "my-project", name: "My Project", createdAt: "2024-01-01" }];
    mockResponse(projects);

    const result = await listProjects();

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/projects",
      expect.objectContaining({ headers: expect.anything() })
    );
    expect(result).toEqual(projects);
  });

  it("should throw on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal Server Error"),
    });

    await expect(listProjects()).rejects.toThrow("HTTP 500");
  });
});

describe("createProject", () => {
  it("should POST /api/projects with name in body", async () => {
    const project = { slug: "new-project", name: "New Project", createdAt: "2024-01-01" };
    mockResponse(project, 201);

    const result = await createProject("New Project");

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/projects",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "New Project" }),
      })
    );
    expect(result).toEqual(project);
  });
});

describe("getProject", () => {
  it("should GET /api/projects/:slug", async () => {
    const project = { slug: "test-slug", name: "Test", createdAt: "2024-01-01" };
    mockResponse(project);

    const result = await getProject("test-slug");

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/projects/test-slug",
      expect.anything()
    );
    expect(result.slug).toBe("test-slug");
  });

  it("should throw 404 when project not found", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: () => Promise.resolve("Project not found"),
    });

    await expect(getProject("nonexistent")).rejects.toThrow("HTTP 404");
  });
});

describe("deleteProject", () => {
  it("should DELETE /api/projects/:slug", async () => {
    mockResponse({ ok: true });

    const result = await deleteProject("test-slug");

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/projects/test-slug",
      expect.objectContaining({ method: "DELETE" })
    );
    expect(result).toEqual({ ok: true });
  });
});

describe("listMessages", () => {
  it("should GET /api/projects/:slug/messages without options", async () => {
    mockResponse([]);

    await listMessages("my-slug");

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/projects/my-slug/messages",
      expect.anything()
    );
  });

  it("should append limit and before query params when provided", async () => {
    mockResponse([]);

    await listMessages("my-slug", { limit: 20, before: "01ABCD" });

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("limit=20");
    expect(url).toContain("before=01ABCD");
  });

  it("should append only limit when before is not provided", async () => {
    mockResponse([]);

    await listMessages("my-slug", { limit: 10 });

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("limit=10");
    expect(url).not.toContain("before=");
  });
});

describe("listFiles", () => {
  it("should GET /api/projects/:slug/files without options", async () => {
    mockResponse({ path: ".", entries: [] });

    const result = await listFiles("my-slug");

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/projects/my-slug/files",
      expect.anything()
    );
    expect(result.entries).toEqual([]);
  });

  it("should append path and depth query params when provided", async () => {
    mockResponse({ path: "src", entries: [] });

    await listFiles("my-slug", { path: "src", depth: 3 });

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("path=src");
    expect(url).toContain("depth=3");
  });
});

describe("fileUrl", () => {
  it("should return correct URL for iframe src", () => {
    const url = fileUrl("my-project", "index.html");
    expect(url).toBe("/api/projects/my-project/files/index.html");
  });

  it("should handle nested paths", () => {
    const url = fileUrl("my-project", "assets/style.css");
    expect(url).toBe("/api/projects/my-project/files/assets/style.css");
  });
});
