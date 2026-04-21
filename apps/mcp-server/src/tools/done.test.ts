// done.test.ts — Task 3.B.13 Red
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const mockPostMcpEvent = vi.fn();

vi.mock("../callback.js", () => ({
  postMcpEvent: mockPostMcpEvent,
}));

vi.mock("../env.js", () => ({
  env: {
    DH_INTERNAL_TOKEN: "test-token",
    DH_WEB_PORT: "31823",
    DH_PROJECT_ROOT: "",
    DH_PROJECT_SLUG: "test-project",
  },
}));

describe("doneTool", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-done-test-"));
    const envMod = await import("../env.js");
    (envMod.env as { DH_PROJECT_ROOT: string }).DH_PROJECT_ROOT = tmpDir;
    mockPostMcpEvent.mockClear();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should block and return backend result on success with no console errors", async () => {
    const { doneTool } = await import("./done.js");
    fs.writeFileSync(path.join(tmpDir, "index.html"), "<html/>");

    mockPostMcpEvent.mockResolvedValueOnce({
      ok: true,
      timedOut: false,
      consoleErrors: [],
    });

    const result = await doneTool({ path: "index.html" });

    expect(mockPostMcpEvent).toHaveBeenCalledOnce();
    expect(mockPostMcpEvent).toHaveBeenCalledWith("done", { path: "index.html" });
    expect(result).toEqual({
      ok: true,
      timedOut: false,
      consoleErrors: [],
    });
  });

  it("should return result with consoleErrors when UI reports JS errors", async () => {
    const { doneTool } = await import("./done.js");
    fs.writeFileSync(path.join(tmpDir, "index.html"), "<html/>");

    mockPostMcpEvent.mockResolvedValueOnce({
      ok: true,
      timedOut: false,
      consoleErrors: ["ReferenceError: foo is not defined"],
    });

    const result = await doneTool({ path: "index.html" });

    expect(result).toEqual({
      ok: true,
      timedOut: false,
      consoleErrors: ["ReferenceError: foo is not defined"],
    });
  });

  it("should return ok:false timedOut:true when backend times out (UI no ack in 5s)", async () => {
    const { doneTool } = await import("./done.js");
    fs.writeFileSync(path.join(tmpDir, "index.html"), "<html/>");

    mockPostMcpEvent.mockResolvedValueOnce({
      ok: false,
      timedOut: true,
      consoleErrors: [],
    });

    const result = await doneTool({ path: "index.html" });

    expect(result).toEqual({
      ok: false,
      timedOut: true,
      consoleErrors: [],
    });
  });

  it("should pass path to postMcpEvent args", async () => {
    const { doneTool } = await import("./done.js");
    fs.writeFileSync(path.join(tmpDir, "design.html"), "<html/>");

    mockPostMcpEvent.mockResolvedValueOnce({
      ok: true,
      timedOut: false,
      consoleErrors: [],
    });

    await doneTool({ path: "design.html" });

    expect(mockPostMcpEvent).toHaveBeenCalledWith("done", { path: "design.html" });
  });

  it("should return isError with PATH_TRAVERSAL for .. in path", async () => {
    const { doneTool } = await import("./done.js");

    const result = await doneTool({ path: "../escape.html" });

    expect(result).toMatchObject({
      isError: true,
      content: expect.arrayContaining([
        expect.objectContaining({ text: expect.stringContaining("PATH_TRAVERSAL") }),
      ]),
    });
    expect(mockPostMcpEvent).not.toHaveBeenCalled();
  });

  it("should return isError with PATH_TRAVERSAL for absolute path", async () => {
    const { doneTool } = await import("./done.js");

    const result = await doneTool({ path: "/tmp/evil.html" });

    expect(result).toMatchObject({
      isError: true,
      content: expect.arrayContaining([
        expect.objectContaining({ text: expect.stringContaining("PATH_TRAVERSAL") }),
      ]),
    });
  });

  it("should return isError for extra fields in input (strict schema)", async () => {
    const { doneTool } = await import("./done.js");

    const result = await doneTool({
      path: "index.html",
      extra: "bad",
    } as { path: string });

    expect(result).toMatchObject({ isError: true });
  });

  it("should propagate error as isError when postMcpEvent throws", async () => {
    const { doneTool } = await import("./done.js");
    fs.writeFileSync(path.join(tmpDir, "index.html"), "<html/>");

    mockPostMcpEvent.mockRejectedValueOnce(new Error("backend unreachable"));

    const result = await doneTool({ path: "index.html" });

    expect(result).toMatchObject({ isError: true });
  });
});
