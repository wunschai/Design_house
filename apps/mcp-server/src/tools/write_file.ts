// write_file.ts — Task 3.B.8 Green
import * as fs from "node:fs";
import * as path from "node:path";
import { joinProject, PathTraversalError } from "@design-house/shared/paths";
import { writeFileInputSchema } from "@design-house/shared/mcp-tools";
import { env } from "../env.js";

const MAX_CONTENT_BYTES = 5 * 1024 * 1024; // 5 MB

type McpErrorResult = {
  isError: true;
  content: Array<{ type: "text"; text: string }>;
};

function errorResult(text: string): McpErrorResult {
  return { isError: true, content: [{ type: "text", text }] };
}

export async function writeFileTool(input: unknown): Promise<
  | { ok: true; bytesWritten: number }
  | McpErrorResult
> {
  // 1. 輸入驗證
  const parseResult = writeFileInputSchema.safeParse(input);
  if (!parseResult.success) {
    return errorResult(`INVALID_INPUT: ${parseResult.error.message}`);
  }
  const { path: relPath, content } = parseResult.data;

  // 2. 大小檢查（先於 path guard，避免浪費 I/O）
  const byteLen = Buffer.byteLength(content, "utf-8");
  if (byteLen > MAX_CONTENT_BYTES) {
    return errorResult(`CONTENT_TOO_LARGE: content size ${byteLen} bytes exceeds 5 MB limit`);
  }

  // 3. 字串層 path guard
  let nativePath: string;
  try {
    nativePath = joinProject(env.DH_PROJECT_ROOT, relPath);
  } catch (e) {
    if (e instanceof PathTraversalError) {
      return errorResult(`PATH_TRAVERSAL: ${e.message}`);
    }
    throw e;
  }

  // 4. runtime 層 symlink boundary check（對 parent directory）
  try {
    const projectRootReal = fs.realpathSync(env.DH_PROJECT_ROOT);
    const parentDir = path.dirname(nativePath);

    // parent 目錄可能還不存在（autoMkdir 前），找到第一個存在的祖先
    let existingParent = parentDir;
    while (!fs.existsSync(existingParent)) {
      const up = path.dirname(existingParent);
      if (up === existingParent) break; // 到根目錄
      existingParent = up;
    }

    const parentReal = fs.realpathSync(existingParent);
    if (!parentReal.startsWith(projectRootReal)) {
      return errorResult(`PATH_TRAVERSAL: parent dir symlink escapes project root`);
    }
  } catch {
    return errorResult(`PATH_TRAVERSAL: realpath check failed`);
  }

  // 5. 寫入檔案（自動建中間目錄）
  try {
    fs.mkdirSync(path.dirname(nativePath), { recursive: true });
    fs.writeFileSync(nativePath, content, "utf-8");
    return { ok: true, bytesWritten: byteLen };
  } catch (e) {
    const nodeErr = e as NodeJS.ErrnoException;
    return errorResult(`WRITE_ERROR: ${nodeErr.message}`);
  }
}
