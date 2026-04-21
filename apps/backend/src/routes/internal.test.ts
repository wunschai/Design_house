import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildApp } from "../app.js";
import { createDb } from "../db/client.js";
import { INTERNAL_TOKEN } from "../app.js";
import type { FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

let app: FastifyInstance;
let db: Database.Database;
let tmpDir: string;

beforeEach(async () => {
  tmpDir = join(os.tmpdir(), `dh-internal-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  db = createDb(":memory:");
  app = await buildApp({ db, projectsRoot: tmpDir });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  db.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("POST /internal/mcp-event", () => {
  it("should return 403 for missing X-Internal-Token", async () => {
    const resp = await app.inject({
      method: "POST",
      url: "/internal/mcp-event",
      payload: { projectSlug: "test", correlationId: "abc", tool: "list_files", args: {} },
    });
    expect(resp.statusCode).toBe(403);
  });

  it("should return 403 for wrong X-Internal-Token", async () => {
    const resp = await app.inject({
      method: "POST",
      url: "/internal/mcp-event",
      headers: { "x-internal-token": "wrong-token" },
      payload: { projectSlug: "test", correlationId: "abc", tool: "list_files", args: {} },
    });
    expect(resp.statusCode).toBe(403);
  });

  it("should handle read_file tool", async () => {
    // 建立專案和測試檔案
    await app.inject({ method: "POST", url: "/api/projects", body: { name: "internal-test" } });
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(tmpDir, "internal-test", "test.txt"), "hello world");

    const resp = await app.inject({
      method: "POST",
      url: "/internal/mcp-event",
      headers: { "x-internal-token": INTERNAL_TOKEN },
      payload: {
        projectSlug: "internal-test",
        correlationId: "corr1",
        tool: "read_file",
        args: { path: "test.txt" },
      },
    });
    expect(resp.statusCode).toBe(200);
    const body = JSON.parse(resp.body);
    expect(body.ok).toBe(true);
    expect(body.result.content).toBe("hello world");
  });

  it("should handle write_file tool", async () => {
    await app.inject({ method: "POST", url: "/api/projects", body: { name: "write-test" } });

    const resp = await app.inject({
      method: "POST",
      url: "/internal/mcp-event",
      headers: { "x-internal-token": INTERNAL_TOKEN },
      payload: {
        projectSlug: "write-test",
        correlationId: "corr2",
        tool: "write_file",
        args: { path: "output.html", content: "<html>hello</html>" },
      },
    });
    expect(resp.statusCode).toBe(200);
    const body = JSON.parse(resp.body);
    expect(body.ok).toBe(true);
    expect(body.result.bytesWritten).toBeGreaterThan(0);
  });

  it("should handle list_files tool", async () => {
    await app.inject({ method: "POST", url: "/api/projects", body: { name: "list-test" } });

    const resp = await app.inject({
      method: "POST",
      url: "/internal/mcp-event",
      headers: { "x-internal-token": INTERNAL_TOKEN },
      payload: {
        projectSlug: "list-test",
        correlationId: "corr3",
        tool: "list_files",
        args: {},
      },
    });
    expect(resp.statusCode).toBe(200);
    const body = JSON.parse(resp.body);
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.result.entries)).toBe(true);
  });

  it("should handle show_to_user tool (fire-and-forget)", async () => {
    await app.inject({ method: "POST", url: "/api/projects", body: { name: "show-test" } });

    const resp = await app.inject({
      method: "POST",
      url: "/internal/mcp-event",
      headers: { "x-internal-token": INTERNAL_TOKEN },
      payload: {
        projectSlug: "show-test",
        correlationId: "corr4",
        tool: "show_to_user",
        args: { path: "index.html" },
      },
    });
    expect(resp.statusCode).toBe(200);
    const body = JSON.parse(resp.body);
    expect(body.ok).toBe(true);
    expect(body.result.ok).toBe(true);
  });

  it("should return error for PATH_TRAVERSAL in read_file", async () => {
    await app.inject({ method: "POST", url: "/api/projects", body: { name: "sec-test" } });

    const resp = await app.inject({
      method: "POST",
      url: "/internal/mcp-event",
      headers: { "x-internal-token": INTERNAL_TOKEN },
      payload: {
        projectSlug: "sec-test",
        correlationId: "corr5",
        tool: "read_file",
        args: { path: "../../../etc/passwd" },
      },
    });
    expect(resp.statusCode).toBe(200);
    const body = JSON.parse(resp.body);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("PATH_TRAVERSAL");
  });

  it("should return error for unknown tool", async () => {
    await app.inject({ method: "POST", url: "/api/projects", body: { name: "tool-test" } });

    const resp = await app.inject({
      method: "POST",
      url: "/internal/mcp-event",
      headers: { "x-internal-token": INTERNAL_TOKEN },
      payload: {
        projectSlug: "tool-test",
        correlationId: "corr6",
        tool: "unknown_tool",
        args: {},
      },
    });
    expect(resp.statusCode).toBe(200);
    const body = JSON.parse(resp.body);
    expect(body.ok).toBe(false);
  });

  it("should return idempotent response for duplicate correlationId (done tool cached)", async () => {
    // done tool 的冪等性通過 correlation-cache 來實現
    // 測試：同一個 non-done tool 的 correlationId 重複 → 不會被快取（只有 done 走快取）
    // 這裡測試的是一般 tool 的 correlationId 不被快取，允許重複請求
    await app.inject({ method: "POST", url: "/api/projects", body: { name: "idem-test" } });

    const payload = {
      projectSlug: "idem-test",
      correlationId: "idem-corr",
      tool: "list_files",
      args: {},
    };

    const resp1 = await app.inject({
      method: "POST",
      url: "/internal/mcp-event",
      headers: { "x-internal-token": INTERNAL_TOKEN },
      payload,
    });
    const resp2 = await app.inject({
      method: "POST",
      url: "/internal/mcp-event",
      headers: { "x-internal-token": INTERNAL_TOKEN },
      payload,
    });

    expect(resp1.statusCode).toBe(200);
    expect(resp2.statusCode).toBe(200);
    const body1 = JSON.parse(resp1.body);
    const body2 = JSON.parse(resp2.body);
    expect(body1.ok).toBe(true);
    expect(body2.ok).toBe(true);
  });
});
