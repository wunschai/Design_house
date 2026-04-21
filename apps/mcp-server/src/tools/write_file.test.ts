// write_file.test.ts — Task 3.B.7 Red
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

describe("writeFileTool", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-write-test-"));
    const envMod = await import("../env.js");
    (envMod.env as { DH_PROJECT_ROOT: string }).DH_PROJECT_ROOT = tmpDir;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should write file content and return ok with bytesWritten", async () => {
    const { writeFileTool } = await import("./write_file.js");
    const content = "<html>world</html>";

    const result = await writeFileTool({ path: "index.html", content });

    const filePath = path.join(tmpDir, "index.html");
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readFileSync(filePath, "utf-8")).toBe(content);
    expect(result).toEqual({
      ok: true,
      bytesWritten: Buffer.byteLength(content, "utf-8"),
    });
  });

  it("should auto-create intermediate directories", async () => {
    const { writeFileTool } = await import("./write_file.js");
    const content = "nested content";

    const result = await writeFileTool({ path: "sub/dir/file.html", content });

    const filePath = path.join(tmpDir, "sub", "dir", "file.html");
    expect(fs.existsSync(filePath)).toBe(true);
    expect(result).toMatchObject({ ok: true });
  });

  it("should overwrite existing file", async () => {
    const { writeFileTool } = await import("./write_file.js");
    const filePath = path.join(tmpDir, "overwrite.html");
    fs.writeFileSync(filePath, "old content");

    await writeFileTool({ path: "overwrite.html", content: "new content" });

    expect(fs.readFileSync(filePath, "utf-8")).toBe("new content");
  });

  it("should return isError with CONTENT_TOO_LARGE when content exceeds 5MB", async () => {
    const { writeFileTool } = await import("./write_file.js");
    // 5MB + 1 byte
    const bigContent = "x".repeat(5 * 1024 * 1024 + 1);

    const result = await writeFileTool({ path: "big.html", content: bigContent });

    expect(result).toMatchObject({
      isError: true,
      content: expect.arrayContaining([
        expect.objectContaining({ text: expect.stringContaining("CONTENT_TOO_LARGE") }),
      ]),
    });
    // 檔案不應被寫入
    expect(fs.existsSync(path.join(tmpDir, "big.html"))).toBe(false);
  });

  it("should return isError with PATH_TRAVERSAL for .. in path", async () => {
    const { writeFileTool } = await import("./write_file.js");

    const result = await writeFileTool({ path: "../escape.html", content: "bad" });

    expect(result).toMatchObject({
      isError: true,
      content: expect.arrayContaining([
        expect.objectContaining({ text: expect.stringContaining("PATH_TRAVERSAL") }),
      ]),
    });
  });

  it("should return isError with PATH_TRAVERSAL for absolute path", async () => {
    const { writeFileTool } = await import("./write_file.js");

    const result = await writeFileTool({ path: "/tmp/escape.html", content: "bad" });

    expect(result).toMatchObject({
      isError: true,
      content: expect.arrayContaining([
        expect.objectContaining({ text: expect.stringContaining("PATH_TRAVERSAL") }),
      ]),
    });
  });

  it("should return isError for extra fields in input (strict schema)", async () => {
    const { writeFileTool } = await import("./write_file.js");

    const result = await writeFileTool({
      path: "index.html",
      content: "hi",
      extra: "bad",
    } as { path: string; content: string });

    expect(result).toMatchObject({ isError: true });
  });
});
