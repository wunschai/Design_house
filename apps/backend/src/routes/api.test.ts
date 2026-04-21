import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildApp, generateInternalToken } from "../app.js";
import { createDb } from "../db/client.js";
import type { FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

let app: FastifyInstance;
let db: Database.Database;
let tmpDir: string;

beforeEach(async () => {
  tmpDir = join(os.tmpdir(), `dh-api-test-${Date.now()}`);
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

describe("POST /api/projects", () => {
  it("should create a project and return slug/name/createdAt", async () => {
    const resp = await app.inject({
      method: "POST",
      url: "/api/projects",
      body: { name: "My Project" },
    });
    expect(resp.statusCode).toBe(201);
    const body = JSON.parse(resp.body);
    expect(body.slug).toBe("my-project");
    expect(body.name).toBe("My Project");
    expect(body.createdAt).toBeTruthy();
  });

  it("should create the project directory", async () => {
    await app.inject({
      method: "POST",
      url: "/api/projects",
      body: { name: "dir-test" },
    });
    const { existsSync } = await import("node:fs");
    expect(existsSync(join(tmpDir, "dir-test"))).toBe(true);
  });

  it("should handle slug collision by appending -2", async () => {
    await app.inject({ method: "POST", url: "/api/projects", body: { name: "my-project" } });
    const resp = await app.inject({ method: "POST", url: "/api/projects", body: { name: "my-project" } });
    expect(resp.statusCode).toBe(201);
    const body = JSON.parse(resp.body);
    expect(body.slug).toBe("my-project-2");
  });

  it("should return 400 for empty name", async () => {
    const resp = await app.inject({
      method: "POST",
      url: "/api/projects",
      body: { name: "" },
    });
    expect(resp.statusCode).toBe(400);
  });
});

describe("GET /api/projects", () => {
  it("should return empty array when no projects", async () => {
    const resp = await app.inject({ method: "GET", url: "/api/projects" });
    expect(resp.statusCode).toBe(200);
    const body = JSON.parse(resp.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(0);
  });

  it("should return list of projects with messageCount", async () => {
    await app.inject({ method: "POST", url: "/api/projects", body: { name: "proj-a" } });
    await app.inject({ method: "POST", url: "/api/projects", body: { name: "proj-b" } });
    const resp = await app.inject({ method: "GET", url: "/api/projects" });
    const body = JSON.parse(resp.body);
    expect(body).toHaveLength(2);
    expect(body[0]).toHaveProperty("messageCount");
    expect(body[0]).toHaveProperty("slug");
    expect(body[0]).toHaveProperty("name");
    expect(body[0]).toHaveProperty("createdAt");
    expect(body[0]).toHaveProperty("lastActivityAt");
  });
});

describe("GET /api/projects/:slug", () => {
  it("should return a project by slug", async () => {
    await app.inject({ method: "POST", url: "/api/projects", body: { name: "my-project" } });
    const resp = await app.inject({ method: "GET", url: "/api/projects/my-project" });
    expect(resp.statusCode).toBe(200);
    const body = JSON.parse(resp.body);
    expect(body.slug).toBe("my-project");
  });

  it("should return 404 for non-existent project", async () => {
    const resp = await app.inject({ method: "GET", url: "/api/projects/nonexistent" });
    expect(resp.statusCode).toBe(404);
  });
});

describe("DELETE /api/projects/:slug", () => {
  it("should delete a project and return ok", async () => {
    await app.inject({ method: "POST", url: "/api/projects", body: { name: "to-delete" } });
    const resp = await app.inject({ method: "DELETE", url: "/api/projects/to-delete" });
    expect(resp.statusCode).toBe(200);
    const body = JSON.parse(resp.body);
    expect(body.ok).toBe(true);
  });

  it("should return 404 when deleting non-existent project", async () => {
    const resp = await app.inject({ method: "DELETE", url: "/api/projects/nonexistent" });
    expect(resp.statusCode).toBe(404);
  });
});

describe("GET /api/projects/:slug/messages", () => {
  it("should return empty array for new project", async () => {
    await app.inject({ method: "POST", url: "/api/projects", body: { name: "msg-test" } });
    const resp = await app.inject({ method: "GET", url: "/api/projects/msg-test/messages" });
    expect(resp.statusCode).toBe(200);
    const body = JSON.parse(resp.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(0);
  });

  it("should support limit query param", async () => {
    await app.inject({ method: "POST", url: "/api/projects", body: { name: "msg-test" } });
    const resp = await app.inject({
      method: "GET",
      url: "/api/projects/msg-test/messages?limit=5",
    });
    expect(resp.statusCode).toBe(200);
  });

  it("should return 404 for non-existent project", async () => {
    const resp = await app.inject({ method: "GET", url: "/api/projects/nonexistent/messages" });
    expect(resp.statusCode).toBe(404);
  });
});

describe("GET /api/projects/:slug/files", () => {
  it("should return file tree for a project", async () => {
    await app.inject({ method: "POST", url: "/api/projects", body: { name: "file-test" } });
    // 建立測試檔案
    writeFileSync(join(tmpDir, "file-test", "index.html"), "<html></html>");
    const resp = await app.inject({ method: "GET", url: "/api/projects/file-test/files" });
    expect(resp.statusCode).toBe(200);
    const body = JSON.parse(resp.body);
    expect(body.path).toBeDefined();
    expect(Array.isArray(body.entries)).toBe(true);
  });

  it("should return 404 for non-existent project", async () => {
    const resp = await app.inject({ method: "GET", url: "/api/projects/nonexistent/files" });
    expect(resp.statusCode).toBe(404);
  });
});

describe("GET /api/projects/:slug/files/*path (static serve)", () => {
  it("should serve an HTML file with correct Content-Type", async () => {
    await app.inject({ method: "POST", url: "/api/projects", body: { name: "static-test" } });
    writeFileSync(join(tmpDir, "static-test", "index.html"), "<html><body>Hello</body></html>");
    const resp = await app.inject({
      method: "GET",
      url: "/api/projects/static-test/files/index.html",
    });
    expect(resp.statusCode).toBe(200);
    expect(resp.headers["content-type"]).toContain("text/html");
  });

  it("should return 404 for non-existent file", async () => {
    await app.inject({ method: "POST", url: "/api/projects", body: { name: "static-test2" } });
    const resp = await app.inject({
      method: "GET",
      url: "/api/projects/static-test2/files/notexist.html",
    });
    expect(resp.statusCode).toBe(404);
  });

  it("should reject path traversal attempts", async () => {
    await app.inject({ method: "POST", url: "/api/projects", body: { name: "sec-test" } });
    const resp = await app.inject({
      method: "GET",
      url: "/api/projects/sec-test/files/..%2F..%2Fetc%2Fpasswd",
    });
    expect(resp.statusCode).toBeGreaterThanOrEqual(400);
  });
});
