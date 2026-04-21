// read_file.ts — Task 3.B.6 Green
import * as fs from "node:fs";
import { joinProject, PathTraversalError } from "@design-house/shared/paths";
import { readFileInputSchema } from "@design-house/shared/mcp-tools";
import { env } from "../env.js";

type McpErrorResult = {
  isError: true;
  content: Array<{ type: "text"; text: string }>;
};

function errorResult(text: string): McpErrorResult {
  return { isError: true, content: [{ type: "text", text }] };
}

export async function readFileTool(input: unknown): Promise<
  | { content: string; encoding: "utf-8"; size: number }
  | McpErrorResult
> {
  // 1. 輸入驗證
  const parseResult = readFileInputSchema.safeParse(input);
  if (!parseResult.success) {
    return errorResult(`INVALID_INPUT: ${parseResult.error.message}`);
  }
  const { path: relPath } = parseResult.data;

  // 2. 字串層 path guard
  let nativePath: string;
  try {
    nativePath = joinProject(env.DH_PROJECT_ROOT, relPath);
  } catch (e) {
    if (e instanceof PathTraversalError) {
      return errorResult(`PATH_TRAVERSAL: ${e.message}`);
    }
    throw e;
  }

  // 3. runtime 層 symlink boundary check（fs.realpathSync）
  try {
    const projectRootReal = fs.realpathSync(env.DH_PROJECT_ROOT);
    const pathReal = fs.realpathSync(nativePath);
    if (!pathReal.startsWith(projectRootReal)) {
      return errorResult(`PATH_TRAVERSAL: symlink escapes project root`);
    }
  } catch (e) {
    const nodeErr = e as NodeJS.ErrnoException;
    if (nodeErr.code === "ENOENT") {
      return errorResult(`FILE_NOT_FOUND: ${relPath}`);
    }
    return errorResult(`PATH_TRAVERSAL: realpath check failed`);
  }

  // 4. 讀取檔案
  try {
    const content = fs.readFileSync(nativePath, "utf-8");
    const size = Buffer.byteLength(content, "utf-8");
    return { content, encoding: "utf-8", size };
  } catch (e) {
    const nodeErr = e as NodeJS.ErrnoException;
    if (nodeErr.code === "ENOENT") {
      return errorResult(`FILE_NOT_FOUND: ${relPath}`);
    }
    return errorResult(`READ_ERROR: ${nodeErr.message}`);
  }
}
