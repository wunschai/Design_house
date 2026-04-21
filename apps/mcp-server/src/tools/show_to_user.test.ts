// show_to_user.test.ts — Task 3.B.11 Red
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

describe("showToUserTool", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-show-test-"));
    const envMod = await import("../env.js");
    (envMod.env as { DH_PROJECT_ROOT: string }).DH_PROJECT_ROOT = tmpDir;
    mockPostMcpEvent.mockClear();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should call postMcpEvent and return ok:true immediately (fire-and-forget)", async () => {
    const { showToUserTool } = await import("./show_to_user.js");
    // show_to_user 不需要檔案存在（只做 path guard + fire event）
    // 但 realpath 要求 path 存在 OR 只做字串 guard — 此處我們讓檔案存在
    fs.writeFileSync(path.join(tmpDir, "index.html"), "<html/>");

    mockPostMcpEvent.mockResolvedValueOnce({ ok: true });

    const result = await showToUserTool({ path: "index.html" });

    expect(mockPostMcpEvent).toHaveBeenCalledOnce();
    expect(mockPostMcpEvent).toHaveBeenCalledWith("show_to_user", { path: "index.html" });
    expect(result).toEqual({ ok: true });
  });

  it("should return ok:true without waiting for UI ack", async () => {
    const { showToUserTool } = await import("./show_to_user.js");
    fs.writeFileSync(path.join(tmpDir, "design.html"), "<html/>");

    // fire-and-forget: callback never resolves but tool still returns ok:true
    let resolveCallback!: () => void;
    mockPostMcpEvent.mockImplementationOnce(
      () => new Promise<{ ok: true }>((res) => { resolveCallback = () => res({ ok: true }); })
    );

    const result = await showToUserTool({ path: "design.html" });

    // tool 應立即回傳，不等 postMcpEvent 完成
    expect(result).toEqual({ ok: true });
    // 之後 resolve callback（不影響結果）
    resolveCallback();
  });

  it("should return isError with PATH_TRAVERSAL for .. in path", async () => {
    const { showToUserTool } = await import("./show_to_user.js");

    const result = await showToUserTool({ path: "../escape.html" });

    expect(result).toMatchObject({
      isError: true,
      content: expect.arrayContaining([
        expect.objectContaining({ text: expect.stringContaining("PATH_TRAVERSAL") }),
      ]),
    });
    expect(mockPostMcpEvent).not.toHaveBeenCalled();
  });

  it("should return isError with PATH_TRAVERSAL for absolute path", async () => {
    const { showToUserTool } = await import("./show_to_user.js");

    const result = await showToUserTool({ path: "/etc/passwd" });

    expect(result).toMatchObject({
      isError: true,
      content: expect.arrayContaining([
        expect.objectContaining({ text: expect.stringContaining("PATH_TRAVERSAL") }),
      ]),
    });
  });

  it("should return isError for extra fields in input (strict schema)", async () => {
    const { showToUserTool } = await import("./show_to_user.js");

    const result = await showToUserTool({
      path: "index.html",
      extra: "bad",
    } as { path: string });

    expect(result).toMatchObject({ isError: true });
  });
});
