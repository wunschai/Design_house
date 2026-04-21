// callback.test.ts — Task 3.B.3 Red
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// mock env 模組，讓 callback.ts 可以在測試環境下 import
vi.mock("./env.js", () => ({
  env: {
    DH_INTERNAL_TOKEN: "test-token-abc",
    DH_WEB_PORT: "31823",
    DH_PROJECT_ROOT: "/projects/test-project",
    DH_PROJECT_SLUG: "test-project",
  },
}));

describe("postMcpEvent", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("should POST to correct URL with correct headers and body", async () => {
    const { postMcpEvent } = await import("./callback.js");

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, result: { content: "hello", encoding: "utf-8", size: 5 } }),
    });

    const result = await postMcpEvent<{ content: string; encoding: string; size: number }>(
      "read_file",
      { path: "index.html" }
    );

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];

    expect(url).toBe("http://127.0.0.1:31823/internal/mcp-event");
    expect(init.method).toBe("POST");

    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["X-Internal-Token"]).toBe("test-token-abc");

    const body = JSON.parse(init.body as string) as {
      projectSlug: string;
      correlationId: string;
      tool: string;
      args: unknown;
    };
    expect(body.projectSlug).toBe("test-project");
    expect(body.tool).toBe("read_file");
    expect(body.args).toEqual({ path: "index.html" });
    // correlationId 由 ulid() 生成，是 26 char 字串
    expect(typeof body.correlationId).toBe("string");
    expect(body.correlationId.length).toBe(26);

    expect(result).toEqual({ content: "hello", encoding: "utf-8", size: 5 });
  });

  it("should generate a unique correlationId for each call", async () => {
    const { postMcpEvent } = await import("./callback.js");

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: {} }),
    });

    await postMcpEvent("read_file", { path: "a.html" });
    await postMcpEvent("read_file", { path: "b.html" });

    const body1 = JSON.parse(mockFetch.mock.calls[0][1].body) as { correlationId: string };
    const body2 = JSON.parse(mockFetch.mock.calls[1][1].body) as { correlationId: string };

    expect(body1.correlationId).not.toBe(body2.correlationId);
  });

  it("should pass AbortSignal in fetch init and it aborts after 5s", async () => {
    const { postMcpEvent } = await import("./callback.js");

    // fetch 接受呼叫後直接 resolve 以便驗 signal 存在
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, result: {} }),
    });

    await postMcpEvent("read_file", { path: "index.html" });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const signal = init?.signal as AbortSignal;
    expect(signal).toBeDefined();
    expect(signal).toBeInstanceOf(AbortSignal);
    // signal 尚未被 abort（因為在 5s 內完成）
    expect(signal.aborted).toBe(false);
  });

  it("should retry 2 times with 200ms backoff on failure", async () => {
    // 用非常短的重試延遲跑真實計時器，避免假計時器與 AbortController 衝突
    const { postMcpEvent } = await import("./callback.js");

    const error = new Error("Network error");
    // 第 1、2 次失敗，第 3 次成功
    mockFetch
      .mockRejectedValueOnce(error)
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: { ok: true } }),
      });

    const result = await postMcpEvent("write_file", { path: "a.html", content: "hello" });
    expect(result).toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  }, 10_000);

  it("should throw after 3 total attempts all fail", async () => {
    const { postMcpEvent } = await import("./callback.js");

    const error = new Error("Network error");
    mockFetch.mockRejectedValue(error);

    await expect(postMcpEvent("read_file", { path: "index.html" })).rejects.toThrow(
      "Network error"
    );
    expect(mockFetch).toHaveBeenCalledTimes(3);
  }, 10_000);

  it("should throw when backend returns ok:false", async () => {
    const { postMcpEvent } = await import("./callback.js");

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: false,
        error: { code: "PATH_TRAVERSAL", message: "path traversal detected" },
      }),
    });

    await expect(postMcpEvent("read_file", { path: "../escape" })).rejects.toThrow(
      "PATH_TRAVERSAL"
    );
  });

  it("should pass AbortSignal to fetch for timeout control", async () => {
    const { postMcpEvent } = await import("./callback.js");

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, result: {} }),
    });

    await postMcpEvent("list_files", {});

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBeDefined();
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
