// read_file.test.ts — Task 3.B.5 Red
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
    DH_PROJECT_ROOT: "",  // 會在 beforeEach 覆蓋
    DH_PROJECT_SLUG: "test-project",
  },
}));

describe("readFileTool", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-test-"));
    // 更新 mock env 的 project root
    const envMod = await import("../env.js");
    (envMod.env as { DH_PROJECT_ROOT: string }).DH_PROJECT_ROOT = tmpDir;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should read file content and return content with size", async () => {
    const { readFileTool } = await import("./read_file.js");
    const filePath = path.join(tmpDir, "index.html");
    fs.writeFileSync(filePath, "<html>hello</html>", "utf-8");

    const result = await readFileTool({ path: "index.html" });

    expect(result).toEqual({
      content: "<html>hello</html>",
      encoding: "utf-8",
      size: Buffer.byteLength("<html>hello</html>", "utf-8"),
    });
  });

  it("should return isError true with FILE_NOT_FOUND when file does not exist", async () => {
    const { readFileTool } = await import("./read_file.js");

    const result = await readFileTool({ path: "missing.html" });

    expect(result).toMatchObject({
      isError: true,
      content: expect.arrayContaining([
        expect.objectContaining({ text: expect.stringContaining("FILE_NOT_FOUND") }),
      ]),
    });
  });

  it("should return isError true with PATH_TRAVERSAL for .. in path", async () => {
    const { readFileTool } = await import("./read_file.js");

    const result = await readFileTool({ path: "../escape/secret.txt" });

    expect(result).toMatchObject({
      isError: true,
      content: expect.arrayContaining([
        expect.objectContaining({ text: expect.stringContaining("PATH_TRAVERSAL") }),
      ]),
    });
  });

  it("should return isError true with PATH_TRAVERSAL for absolute path", async () => {
    const { readFileTool } = await import("./read_file.js");

    const result = await readFileTool({ path: "/etc/passwd" });

    expect(result).toMatchObject({
      isError: true,
      content: expect.arrayContaining([
        expect.objectContaining({ text: expect.stringContaining("PATH_TRAVERSAL") }),
      ]),
    });
  });

  it("should return isError true with PATH_TRAVERSAL when symlink escapes project root", async () => {
    const { readFileTool } = await import("./read_file.js");

    // 建立一個指向 projectRoot 外的 symlink
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-outside-"));
    const outsideFile = path.join(outsideDir, "secret.txt");
    fs.writeFileSync(outsideFile, "secret content");
    const symlinkPath = path.join(tmpDir, "evil-link.html");
    try {
      fs.symlinkSync(outsideFile, symlinkPath);
    } catch {
      // Windows 可能需要管理員權限建立 symlink，跳過此測試
      fs.rmSync(outsideDir, { recursive: true, force: true });
      return;
    }

    const result = await readFileTool({ path: "evil-link.html" });

    expect(result).toMatchObject({
      isError: true,
      content: expect.arrayContaining([
        expect.objectContaining({ text: expect.stringContaining("PATH_TRAVERSAL") }),
      ]),
    });

    fs.rmSync(outsideDir, { recursive: true, force: true });
  });

  it("should return isError true with invalid input (extra field)", async () => {
    const { readFileTool } = await import("./read_file.js");

    // strict schema 拒絕額外欄位
    const result = await readFileTool({ path: "index.html", extra: "bad" } as { path: string });

    expect(result).toMatchObject({ isError: true });
  });
});
