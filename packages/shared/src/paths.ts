// @design-house/shared/paths
import * as nodePath from "node:path";

/**
 * Error subclass for path-boundary violations. MCP tool handlers catch this
 * via `instanceof PathTraversalError` and map to the MCP protocol's
 * `{isError: true, content: [{type:"text", text:"PATH_TRAVERSAL: ..."}]}`
 * envelope without string-sniffing.
 *
 * Prefer `instanceof` over `error.message.startsWith("PATH_TRAVERSAL:")` —
 * string prefix matching is fragile against i18n / rewording.
 */
export class PathTraversalError extends Error {
  readonly code = "PATH_TRAVERSAL" as const;

  constructor(reason: string, input: string) {
    super(`PATH_TRAVERSAL: ${reason} (input: ${JSON.stringify(input)})`);
    this.name = "PathTraversalError";
  }
}

/**
 * 將任意分隔符字串正規化為 POSIX `/`。
 */
export function toPosix(p: string): string {
  return p.replace(/\\/g, "/");
}

/**
 * 判斷路徑是否為安全的 project-relative 路徑。
 * 規則：
 *   - 非空
 *   - 不得以 '/' 或 '\\' 開頭（不得為絕對路徑）
 *   - Windows drive letter（`C:`）亦拒絕
 *   - 不得含 `..` 段（任何位置）
 *   - 不得含 `\0`
 *   - 不得以 `~` 開頭
 * 回傳 { ok: true } 或 { ok: false, reason: string }。
 */
export function isSafeRelativePath(p: string): { ok: true } | { ok: false; reason: string } {
  if (p.length === 0) {
    return { ok: false, reason: "Path must not be empty" };
  }

  if (p.includes("\0")) {
    return { ok: false, reason: "Path must not contain null bytes" };
  }

  if (p.startsWith("/") || p.startsWith("\\")) {
    return { ok: false, reason: "Path must not be absolute (starts with / or \\)" };
  }

  // Windows drive letter: e.g. C: or D:
  if (/^[a-zA-Z]:/.test(p)) {
    return { ok: false, reason: "Path must not be an absolute Windows path (drive letter detected)" };
  }

  if (p.startsWith("~")) {
    return { ok: false, reason: "Path must not start with ~ (home directory expansion not allowed)" };
  }

  // Split on both / and \ to check all segments
  const segments = p.split(/[/\\]/);
  for (const segment of segments) {
    if (segment === "..") {
      return { ok: false, reason: "Path must not contain '..' segments (path traversal detected)" };
    }
  }

  return { ok: true };
}

/**
 * 將 projectRoot + relative path 安全 join。
 * 若 rel 不安全直接 throw `PathTraversalError`（subclass of Error，`code:"PATH_TRAVERSAL"`）。
 * 回傳 native 路徑（在 Win 是 `\`、POSIX 是 `/`）供 fs API 使用。
 * Symlink 檢查由呼叫端搭配 fs.realpathSync 執行，本函式只做字串級 boundary。
 */
export function joinProject(projectRoot: string, rel: string): string {
  const check = isSafeRelativePath(rel);
  if (!check.ok) {
    throw new PathTraversalError(check.reason, rel);
  }
  return nodePath.join(projectRoot, ...rel.split("/"));
}
