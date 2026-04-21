// list_files.test.ts — Task 3.B.9 Red
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

vi.mock("../callback.js", () => ({
  postMcpEvent: vi.fn(),
}));

vi.mock("../env.js", () => ({
  env: {
    DH_INTERNAL_TOKEN: "test-token",
    DH_WEB_PORT: "31823",
    DH_PROJECT_ROOT: "",
    DH_PROJECT_SLUG: "test-project",
  },
}));

describe("listFilesTool", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-list-test-"));
    const envMod = await import("../env.js");
    (envMod.env as { DH_PROJECT_ROOT: string }).DH_PROJECT_ROOT = tmpDir;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should list files at project root when no path given (depth=1)", async () => {
    const { listFilesTool } = await import("./list_files.js");
    fs.writeFileSync(path.join(tmpDir, "a.html"), "");
    fs.writeFileSync(path.join(tmpDir, "b.css"), "");
    fs.mkdirSync(path.join(tmpDir, "subdir"));

    const result = await listFilesTool({});

    expect(result).toMatchObject({
      path: ".",
      entries: expect.arrayContaining([
        expect.objectContaining({ name: "a.html", type: "file" }),
        expect.objectContaining({ name: "b.css", type: "file" }),
        expect.objectContaining({ name: "subdir", type: "dir" }),
      ]),
    });
    // 子目錄不列（depth=1）
    expect((result as { entries: { name: string }[] }).entries).toHaveLength(3);
  });

  it("should return entries sorted alphabetically", async () => {
    const { listFilesTool } = await import("./list_files.js");
    fs.writeFileSync(path.join(tmpDir, "z.html"), "");
    fs.writeFileSync(path.join(tmpDir, "a.html"), "");
    fs.writeFileSync(path.join(tmpDir, "m.html"), "");

    const result = await listFilesTool({}) as { entries: { name: string }[] };

    const names = result.entries.map((e) => e.name);
    expect(names).toEqual([...names].sort());
  });

  it("should list files recursively when depth > 1", async () => {
    const { listFilesTool } = await import("./list_files.js");
    fs.mkdirSync(path.join(tmpDir, "sub"));
    fs.writeFileSync(path.join(tmpDir, "sub", "deep.html"), "");
    fs.writeFileSync(path.join(tmpDir, "root.html"), "");

    const result = await listFilesTool({ depth: 2 }) as { entries: { name: string; type: string }[] };

    const names = result.entries.map((e) => e.name);
    expect(names).toContain("root.html");
    // 深層檔案應該被列出
    expect(names).toContain("deep.html");
  });

  it("should clamp depth to max 5", async () => {
    // 呼叫 depth=10 不應出錯，只走到 depth=5
    const { listFilesTool } = await import("./list_files.js");

    // schema .max(5) 會拒絕 depth=10
    const result = await listFilesTool({ depth: 10 });

    expect(result).toMatchObject({ isError: true });
  });

  it("should truncate entries when more than 1000 and set truncated:true", async () => {
    const { listFilesTool } = await import("./list_files.js");
    // 建立 1001 個檔案
    for (let i = 0; i < 1001; i++) {
      fs.writeFileSync(path.join(tmpDir, `file${i.toString().padStart(4, "0")}.txt`), "");
    }

    const result = await listFilesTool({}) as { entries: unknown[]; truncated?: boolean };

    expect(result.entries).toHaveLength(1000);
    expect(result.truncated).toBe(true);
  });

  it("should return isError with DIR_NOT_FOUND when path does not exist", async () => {
    const { listFilesTool } = await import("./list_files.js");

    const result = await listFilesTool({ path: "nonexistent" });

    expect(result).toMatchObject({
      isError: true,
      content: expect.arrayContaining([
        expect.objectContaining({ text: expect.stringContaining("DIR_NOT_FOUND") }),
      ]),
    });
  });

  it("should return isError with PATH_TRAVERSAL for .. in path", async () => {
    const { listFilesTool } = await import("./list_files.js");

    const result = await listFilesTool({ path: "../escape" });

    expect(result).toMatchObject({
      isError: true,
      content: expect.arrayContaining([
        expect.objectContaining({ text: expect.stringContaining("PATH_TRAVERSAL") }),
      ]),
    });
  });

  it("should skip symlinks pointing outside project root when listing", async () => {
    const { listFilesTool } = await import("./list_files.js");

    // 建立 projectRoot 外的目錄
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-outside-"));
    const symlinkPath = path.join(tmpDir, "evil-link");
    try {
      fs.symlinkSync(outsideDir, symlinkPath, "dir");
    } catch {
      // Windows 可能需要管理員權限，跳過
      fs.rmSync(outsideDir, { recursive: true, force: true });
      return;
    }

    fs.writeFileSync(path.join(tmpDir, "good.html"), "");

    const result = await listFilesTool({}) as { entries: { name: string }[] };

    const names = result.entries.map((e) => e.name);
    expect(names).toContain("good.html");
    expect(names).not.toContain("evil-link");

    fs.rmSync(outsideDir, { recursive: true, force: true });
  });

  it("should return isError for extra fields in input (strict schema)", async () => {
    const { listFilesTool } = await import("./list_files.js");

    const result = await listFilesTool({ path: ".", filter: "*.html" } as { path: string });

    expect(result).toMatchObject({ isError: true });
  });
});
