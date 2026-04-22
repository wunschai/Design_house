// /internal/mcp-event handler
// 接收 mcp-server 的 HTTP callback、執行對應工具邏輯、回傳結果
import { FastifyInstance, FastifyPluginOptions, FastifyRequest } from "fastify";
import Database from "better-sqlite3";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, realpathSync } from "node:fs";
import { join, dirname, sep as PATH_SEP } from "node:path";
import { timingSafeEqual } from "node:crypto";
import { INTERNAL_TOKEN } from "../app.js";
import { joinProject, PathTraversalError } from "@design-house/shared/paths";
import { getCachedResponse, registerPending } from "../internal/correlation-cache.js";
import { broadcast } from "./ws.js";

/** 往上找第一個存在的祖先資料夾（若 filePath 本身存在則回它自己）。 */
function resolveExistingAncestor(filePath: string): string | null {
  let p = filePath;
  while (p) {
    if (existsSync(p)) return p;
    const parent = dirname(p);
    if (parent === p) return null; // root
    p = parent;
  }
  return null;
}

/** 檢查給定絕對路徑的 realpath 是否仍落在 projectRoot 內（AC-8.3 symlink guard）。 */
function isWithinProjectRoot(filePath: string, projectRoot: string): boolean {
  const ancestor = resolveExistingAncestor(filePath);
  if (!ancestor) return false;
  try {
    const resolved = realpathSync(ancestor);
    const rootResolved = realpathSync(projectRoot);
    return resolved === rootResolved || resolved.startsWith(rootResolved + PATH_SEP);
  } catch {
    return false;
  }
}

const MAX_WRITE_BYTES = 5 * 1024 * 1024; // 5MB (NFR-8)

// ── Tool handlers ───────────────────────────────────────────────────

interface ToolResult {
  ok: boolean;
  result?: unknown;
  error?: { code: string; message: string };
}

async function handleReadFile(
  projectRoot: string,
  args: { path?: string }
): Promise<ToolResult> {
  if (!args.path) {
    return { ok: false, error: { code: "READ_ERROR", message: "path is required" } };
  }

  let filePath: string;
  try {
    filePath = joinProject(projectRoot, args.path);
  } catch (e) {
    if (e instanceof PathTraversalError) {
      return { ok: false, error: { code: "PATH_TRAVERSAL", message: e.message } };
    }
    throw e;
  }

  // realpathSync guard（AC-8.3）
  try {
    const resolved = realpathSync(filePath);
    const rootResolved = realpathSync(projectRoot);
    // 用 sep 防 prefix-sibling bypass（e.g. /ws/projects/foo vs /ws/projects/foobar）
    if (resolved !== rootResolved && !resolved.startsWith(rootResolved + PATH_SEP)) {
      return { ok: false, error: { code: "PATH_TRAVERSAL", message: "Path escapes project root" } };
    }
  } catch {
    // file doesn't exist
    return { ok: false, error: { code: "FILE_NOT_FOUND", message: `File not found: ${args.path}` } };
  }

  if (!existsSync(filePath)) {
    return { ok: false, error: { code: "FILE_NOT_FOUND", message: `File not found: ${args.path}` } };
  }

  try {
    const content = readFileSync(filePath, "utf-8");
    const size = Buffer.byteLength(content, "utf-8");
    return { ok: true, result: { content, encoding: "utf-8", size } };
  } catch (e) {
    return { ok: false, error: { code: "READ_ERROR", message: (e as Error).message } };
  }
}

async function handleWriteFile(
  projectRoot: string,
  args: { path?: string; content?: string }
): Promise<ToolResult> {
  if (!args.path) {
    return { ok: false, error: { code: "WRITE_ERROR", message: "path is required" } };
  }
  if (args.content === undefined) {
    return { ok: false, error: { code: "WRITE_ERROR", message: "content is required" } };
  }

  // content size check（NFR-8）
  const byteSize = Buffer.byteLength(args.content, "utf-8");
  if (byteSize > MAX_WRITE_BYTES) {
    return { ok: false, error: { code: "CONTENT_TOO_LARGE", message: "Content exceeds 5MB limit" } };
  }

  let filePath: string;
  try {
    filePath = joinProject(projectRoot, args.path);
  } catch (e) {
    if (e instanceof PathTraversalError) {
      return { ok: false, error: { code: "PATH_TRAVERSAL", message: e.message } };
    }
    throw e;
  }

  // realpath guard（AC-8.3）— 先檢查路徑上最深的現存祖先是否仍在 projectRoot 內，
  // 避免中間目錄是 symlink 指向外部時 mkdirSync 沿著 symlink 寫出 root 外。
  if (!isWithinProjectRoot(filePath, projectRoot)) {
    return {
      ok: false,
      error: { code: "PATH_TRAVERSAL", message: "write target escapes project root (symlink guard)" },
    };
  }

  try {
    // 自動建立中間目錄
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, args.content, "utf-8");

    // 寫入後再檢一次 realpath（防 race / 剛被 replace 成 symlink 的情況）
    if (!isWithinProjectRoot(filePath, projectRoot)) {
      return {
        ok: false,
        error: { code: "PATH_TRAVERSAL", message: "post-write symlink escape detected" },
      };
    }

    return { ok: true, result: { ok: true, bytesWritten: byteSize } };
  } catch (e) {
    return { ok: false, error: { code: "WRITE_ERROR", message: (e as Error).message } };
  }
}

async function handleListFiles(
  projectRoot: string,
  args: { path?: string; depth?: number }
): Promise<ToolResult> {
  const relPath = args.path ?? ".";
  const depth = Math.min(args.depth ?? 1, 5);

  let dirPath: string;
  if (relPath === ".") {
    dirPath = projectRoot;
  } else {
    try {
      dirPath = joinProject(projectRoot, relPath);
    } catch (e) {
      if (e instanceof PathTraversalError) {
        return { ok: false, error: { code: "PATH_TRAVERSAL", message: (e as Error).message } };
      }
      throw e;
    }
  }

  if (!existsSync(dirPath)) {
    return { ok: false, error: { code: "DIR_NOT_FOUND", message: `Directory not found: ${relPath}` } };
  }

  const entries: { name: string; type: "file" | "dir"; size?: number }[] = [];
  let truncated = false;
  const MAX_ENTRIES = 1000;

  function readDir(dir: string, currentDepth: number): void {
    if (currentDepth > depth || entries.length >= MAX_ENTRIES) return;
    try {
      const items = readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        if (entries.length >= MAX_ENTRIES) {
          truncated = true;
          break;
        }
        if (item.isSymbolicLink()) continue;
        if (item.isFile()) {
          const stat = statSync(join(dir, item.name));
          entries.push({ name: item.name, type: "file", size: stat.size });
        } else if (item.isDirectory()) {
          entries.push({ name: item.name, type: "dir" });
        }
      }
      entries.sort((a, b) => a.name.localeCompare(b.name));
    } catch { /* ignore */ }
  }

  readDir(dirPath, 1);

  const result: { path: string; entries: typeof entries; truncated?: true } = {
    path: relPath,
    entries,
  };
  if (truncated) result.truncated = true;

  return { ok: true, result };
}

async function handleShowToUser(
  projectSlug: string,
  projectRoot: string,
  args: { path?: string }
): Promise<ToolResult> {
  if (!args.path) {
    return { ok: false, error: { code: "PATH_TRAVERSAL", message: "path is required" } };
  }

  // Path validation（防 CC 跨 project 顯示、或傳 .. 到 UI）
  try {
    joinProject(projectRoot, args.path);
  } catch (e) {
    if (e instanceof PathTraversalError) {
      return { ok: false, error: { code: "PATH_TRAVERSAL", message: e.message } };
    }
    throw e;
  }

  // 廣播 show-to-user 事件（fire-and-forget，不等 UI 回應）
  broadcast(projectSlug, {
    type: "show-to-user",
    projectSlug,
    path: args.path,
  });

  return { ok: true, result: { ok: true } };
}

async function handleDone(
  projectSlug: string,
  projectRoot: string,
  args: { path?: string },
  correlationId: string
): Promise<ToolResult> {
  if (!args.path) {
    return { ok: false, error: { code: "PATH_TRAVERSAL", message: "path is required" } };
  }

  // Path validation
  try {
    joinProject(projectRoot, args.path);
  } catch (e) {
    if (e instanceof PathTraversalError) {
      return { ok: false, error: { code: "PATH_TRAVERSAL", message: (e as Error).message } };
    }
    throw e;
  }

  // 廣播 done-request 並等待 UI ack（blocking）
  broadcast(projectSlug, {
    type: "done-request",
    projectSlug,
    correlationId,
    path: args.path,
  });

  // 等 UI ack 或 5s timeout
  const doneOutput = await registerPending(correlationId, 5_000);

  return { ok: true, result: doneOutput };
}

// ── Route plugin ───────────────────────────────────────────────────

export interface InternalRouteOptions extends FastifyPluginOptions {
  db: Database.Database;
  projectsRoot: string;
}

interface McpEventBody {
  projectSlug: string;
  correlationId: string;
  tool: string;
  args: Record<string, unknown>;
}

export async function internalRoutes(app: FastifyInstance, opts: InternalRouteOptions): Promise<void> {
  const { projectsRoot } = opts;

  // NFR-2: 驗證 X-Internal-Token + 來源 IP
  app.addHook("preHandler", async (req: FastifyRequest, reply) => {
    if (!req.url.startsWith("/internal/")) return;

    // 來源 IP 必須是 127.0.0.1（NFR-1）
    const clientIp = req.ip;
    if (clientIp !== "127.0.0.1" && clientIp !== "::1" && clientIp !== "::ffff:127.0.0.1") {
      return reply.status(403).send({ error: "Forbidden: must be localhost" });
    }

    // Token 驗證（NFR-2）— 用 timingSafeEqual 避免 timing attack（紀律）
    const token = req.headers["x-internal-token"];
    if (typeof token !== "string" || token.length !== INTERNAL_TOKEN.length) {
      return reply.status(403).send({ error: "Forbidden: invalid token" });
    }
    const a = Buffer.from(token, "utf-8");
    const b = Buffer.from(INTERNAL_TOKEN, "utf-8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return reply.status(403).send({ error: "Forbidden: invalid token" });
    }
  });

  app.post<{ Body: McpEventBody }>("/internal/mcp-event", {
    bodyLimit: 10 * 1024 * 1024, // NFR-6: 10MB 上限僅限此路由
  }, async (req, reply) => {
    const { projectSlug, correlationId, tool, args } = req.body;
    const projectRoot = join(projectsRoot, projectSlug);

    // ADR-010 idempotency: done tool 的 cached response
    if (tool === "done") {
      const cached = getCachedResponse(correlationId);
      if (cached) {
        return reply.send({ ok: true, result: cached });
      }
    }

    let toolResult: ToolResult;

    try {
      switch (tool) {
        case "read_file":
          toolResult = await handleReadFile(projectRoot, args as { path?: string });
          break;

        case "write_file":
          toolResult = await handleWriteFile(projectRoot, args as { path?: string; content?: string });
          break;

        case "list_files":
          toolResult = await handleListFiles(projectRoot, args as { path?: string; depth?: number });
          break;

        case "show_to_user":
          toolResult = await handleShowToUser(projectSlug, projectRoot, args as { path?: string });
          break;

        case "done":
          toolResult = await handleDone(projectSlug, projectRoot, args as { path?: string }, correlationId);
          break;

        default:
          toolResult = { ok: false, error: { code: "UNKNOWN_TOOL", message: `Unknown tool: ${tool}` } };
      }
    } catch (e) {
      toolResult = { ok: false, error: { code: "INTERNAL_ERROR", message: (e as Error).message } };
    }

    if (toolResult.ok) {
      return reply.send({ ok: true, result: toolResult.result });
    } else {
      return reply.send({ ok: false, error: toolResult.error });
    }
  });
}
