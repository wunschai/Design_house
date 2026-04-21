// Fastify app factory — 建立並設定所有 plugins
import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyWebsocket from "@fastify/websocket";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import type { FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import { createDb } from "./db/client.js";
import { apiRoutes } from "./routes/api.js";
import { wsRoutes } from "./routes/ws.js";
import { internalRoutes } from "./routes/internal.js";

// ── Token ───────────────────────────────────────────────────────────

// 啟動時生成一次性 internal token（64-char hex = 32 bytes）
export function generateInternalToken(): string {
  return randomBytes(32).toString("hex");
}

// 單例 token，module 載入時生成
export const INTERNAL_TOKEN = generateInternalToken();

// ── App 選項 ────────────────────────────────────────────────────────

export interface AppOptions {
  db?: Database.Database;
  projectsRoot?: string;
}

// ── buildApp ────────────────────────────────────────────────────────

export async function buildApp(opts: AppOptions = {}): Promise<FastifyInstance> {
  const projectsRoot = opts.projectsRoot ?? join(process.cwd(), "projects");
  mkdirSync(projectsRoot, { recursive: true });

  const db = opts.db ?? createDb(join(process.cwd(), ".data", "design_house.db"));

  const app = Fastify({
    logger: false,
    // /internal 路由允許最大 10MB body
    bodyLimit: 10 * 1024 * 1024,
  });

  // 只允許 localhost 來源的 CORS
  await app.register(fastifyCors, {
    origin: (origin, cb) => {
      if (
        !origin ||
        /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin) ||
        /^https?:\/\/localhost(:\d+)?$/.test(origin)
      ) {
        cb(null, true);
      } else {
        cb(new Error("Not allowed"), false);
      }
    },
  });

  // WebSocket plugin
  await app.register(fastifyWebsocket);

  // health check
  app.get("/health", async (_req, _reply) => {
    return { ok: true };
  });

  // REST API routes
  await app.register(apiRoutes, { db, projectsRoot });

  // WebSocket routes
  await app.register(wsRoutes, { db });

  // Internal MCP callback routes
  await app.register(internalRoutes, { db, projectsRoot });

  return app;
}
