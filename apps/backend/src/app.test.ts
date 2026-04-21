import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildApp, generateInternalToken } from "./app.js";
import { createDb } from "./db/client.js";
import type { FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

describe("Fastify app", () => {
  let app: FastifyInstance;
  let db: Database.Database;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(os.tmpdir(), `dh-app-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    db = createDb(":memory:");
    app = await buildApp({ db, projectsRoot: tmpDir });
  });

  afterEach(async () => {
    await app.close();
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should start and be ready to handle requests", async () => {
    const resp = await app.inject({ method: "GET", url: "/health" });
    expect(resp.statusCode).toBe(200);
    const body = JSON.parse(resp.body);
    expect(body.ok).toBe(true);
  });

  it("should return 404 for unknown routes", async () => {
    const resp = await app.inject({ method: "GET", url: "/unknown-route-xyz" });
    expect(resp.statusCode).toBe(404);
  });

  it("should have CORS configured for localhost origins", async () => {
    const resp = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "http://127.0.0.1:31823" },
    });
    expect(resp.statusCode).toBe(200);
    expect(resp.headers["access-control-allow-origin"]).toBeTruthy();
  });
});

describe("generateInternalToken", () => {
  it("should generate a 64-char hex string", () => {
    const token = generateInternalToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("should generate unique tokens each call", () => {
    const t1 = generateInternalToken();
    const t2 = generateInternalToken();
    expect(t1).not.toBe(t2);
  });
});
