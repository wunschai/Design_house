// REST API routes — /api/projects 及子路由
import { FastifyInstance, FastifyPluginOptions } from "fastify";
import Database from "better-sqlite3";
import { mkdirSync, existsSync, statSync, readdirSync, readFileSync } from "node:fs";
import { join, extname, sep as PATH_SEP } from "node:path";
import {
  insertProject,
  getProject,
  listProjects,
  deleteProject,
  insertSession,
  getMessages,
  countMessages,
} from "../db/client.js";
import { normalizeSlug, resolveSlugCollision } from "../util/slug.js";
import { joinProject } from "@design-house/shared/paths";
import type { ProjectRow, MessageRow } from "@design-house/shared/db-types";

// Content-Type mapping per 副檔名
const MIME_MAP: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
};

function getMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return MIME_MAP[ext] ?? "application/octet-stream";
}

function toApiProject(row: ProjectRow, messageCount: number) {
  return {
    slug: row.slug,
    name: row.name,
    createdAt: row.created_at,
    lastActivityAt: row.last_activity_at,
    messageCount,
  };
}

function toApiMessage(row: MessageRow) {
  return {
    id: row.id,
    projectSlug: row.project_slug,
    role: row.role,
    content: row.content,
    toolUseId: row.tool_use_id ?? undefined,
    toolName: row.tool_name ?? undefined,
    isError: row.is_error !== null ? row.is_error === 1 : undefined,
    createdAt: row.created_at,
  };
}

interface FileEntry {
  name: string;
  type: "file" | "dir";
  size?: number;
}

function buildFileTree(
  dirPath: string,
  relativePath: string,
  _depth: number,
  _maxDepth: number
): { path: string; entries: FileEntry[] } {
  const entries: FileEntry[] = [];

  if (!existsSync(dirPath)) {
    return { path: relativePath || ".", entries };
  }

  try {
    const items = readdirSync(dirPath, { withFileTypes: true });
    for (const item of items) {
      // Skip symlinks（AC-8.3）
      if (item.isSymbolicLink()) continue;

      if (item.isFile()) {
        const stat = statSync(join(dirPath, item.name));
        entries.push({ name: item.name, type: "file", size: stat.size });
      } else if (item.isDirectory()) {
        entries.push({ name: item.name, type: "dir" });
      }
    }
    // Sort by name
    entries.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    // ignore read errors
  }

  return { path: relativePath || ".", entries };
}

export interface ApiRouteOptions extends FastifyPluginOptions {
  db: Database.Database;
  projectsRoot: string;
}

export async function apiRoutes(app: FastifyInstance, opts: ApiRouteOptions): Promise<void> {
  const { db, projectsRoot } = opts;

  // POST /api/projects
  app.post<{ Body: { name?: string } }>("/api/projects", async (req, reply) => {
    const name = req.body?.name?.trim();
    if (!name) {
      return reply.status(400).send({ error: "name is required" });
    }

    // 取得現有 slugs 作碰撞檢查
    const existing = listProjects(db).map((p) => p.slug);
    const baseSlug = normalizeSlug(name, Date.now());
    const slug = resolveSlugCollision(baseSlug, new Set(existing));

    // 建立 project 目錄
    const projectDir = join(projectsRoot, slug);
    mkdirSync(projectDir, { recursive: true });

    // 寫入 DB
    insertProject(db, { slug, name });
    insertSession(db, { project_slug: slug, cc_session_id: null });

    const project = getProject(db, slug)!;
    return reply.status(201).send({
      slug: project.slug,
      name: project.name,
      createdAt: project.created_at,
    });
  });

  // GET /api/projects
  app.get("/api/projects", async (_req, reply) => {
    const projects = listProjects(db);
    const result = projects.map((p) => toApiProject(p, countMessages(db, p.slug)));
    return reply.send(result);
  });

  // GET /api/projects/:slug
  app.get<{ Params: { slug: string } }>("/api/projects/:slug", async (req, reply) => {
    const project = getProject(db, req.params.slug);
    if (!project) return reply.status(404).send({ error: "Project not found" });
    return reply.send({
      slug: project.slug,
      name: project.name,
      createdAt: project.created_at,
      lastActivityAt: project.last_activity_at,
    });
  });

  // DELETE /api/projects/:slug
  app.delete<{ Params: { slug: string } }>("/api/projects/:slug", async (req, reply) => {
    const project = getProject(db, req.params.slug);
    if (!project) return reply.status(404).send({ error: "Project not found" });
    deleteProject(db, req.params.slug);
    return reply.send({ ok: true });
  });

  // GET /api/projects/:slug/messages
  app.get<{
    Params: { slug: string };
    Querystring: { limit?: string; before?: string };
  }>("/api/projects/:slug/messages", async (req, reply) => {
    const project = getProject(db, req.params.slug);
    if (!project) return reply.status(404).send({ error: "Project not found" });

    const limit = Math.min(parseInt(req.query.limit ?? "50", 10) || 50, 200);
    const before = req.query.before;
    const messages = getMessages(db, req.params.slug, { limit, before });
    return reply.send(messages.map(toApiMessage));
  });

  // GET /api/projects/:slug/files  (file tree)
  app.get<{
    Params: { slug: string };
    Querystring: { path?: string; depth?: string };
  }>("/api/projects/:slug/files", async (req, reply) => {
    const project = getProject(db, req.params.slug);
    if (!project) return reply.status(404).send({ error: "Project not found" });

    const projectDir = join(projectsRoot, req.params.slug);
    const relPath = req.query.path ?? ".";
    const depth = Math.min(parseInt(req.query.depth ?? "1", 10) || 1, 5);

    const tree = buildFileTree(projectDir, relPath, 0, depth);
    return reply.send(tree);
  });

  // GET /api/projects/:slug/files/*  (static serve)
  app.get<{
    Params: { slug: string; "*": string };
  }>("/api/projects/:slug/files/*", async (req, reply) => {
    const project = getProject(db, req.params.slug);
    if (!project) return reply.status(404).send({ error: "Project not found" });

    const filePath = req.params["*"];
    if (!filePath) return reply.status(404).send({ error: "File path required" });

    let resolvedPath: string;
    let joined: string;
    try {
      // joinProject 會拒絕 path traversal（PathTraversalError）
      joined = joinProject(join(projectsRoot, req.params.slug), filePath);
    } catch {
      return reply.status(400).send({ error: "Invalid path" });
    }

    // 先確認檔案存在（realpathSync 對不存在的路徑會拋 ENOENT）
    if (!existsSync(joined)) {
      return reply.status(404).send({ error: "File not found" });
    }

    try {
      // realpathSync 驗證 symlink 邊界（AC-8.3）
      const { realpathSync } = await import("node:fs");
      resolvedPath = realpathSync(joined);
      const projectDirResolved = realpathSync(join(projectsRoot, req.params.slug));
      // 用 sep 防 prefix-sibling bypass（e.g. /projects/foo vs /projects/foobar）
      if (resolvedPath !== projectDirResolved && !resolvedPath.startsWith(projectDirResolved + PATH_SEP)) {
        return reply.status(403).send({ error: "Path traversal denied" });
      }
    } catch {
      return reply.status(400).send({ error: "Invalid path" });
    }

    const stat = statSync(resolvedPath);
    if (!stat.isFile()) {
      return reply.status(400).send({ error: "Not a file" });
    }

    const content = readFileSync(resolvedPath);
    const mimeType = getMimeType(resolvedPath);

    reply.header("Content-Type", mimeType);
    return reply.send(content);
  });
}
