// done.ts — Task 3.B.14 Green
// 阻塞同步：POST callback → 等 backend 回 {ok, timedOut, consoleErrors}
import * as fs from "node:fs";
import { joinProject, PathTraversalError } from "@design-house/shared/paths";
import { doneInputSchema } from "@design-house/shared/mcp-tools";
import { env } from "../env.js";
import { postMcpEvent } from "../callback.js";

type DoneResult = {
  ok: boolean;
  timedOut: boolean;
  consoleErrors: string[];
};

type McpErrorResult = {
  isError: true;
  content: Array<{ type: "text"; text: string }>;
};

function errorResult(text: string): McpErrorResult {
  return { isError: true, content: [{ type: "text", text }] };
}

export async function doneTool(input: unknown): Promise<DoneResult | McpErrorResult> {
  // 1. 輸入驗證
  const parseResult = doneInputSchema.safeParse(input);
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

  // 3. runtime 層 symlink boundary check
  try {
    const projectRootReal = fs.realpathSync(env.DH_PROJECT_ROOT);
    if (fs.existsSync(nativePath)) {
      const pathReal = fs.realpathSync(nativePath);
      if (!pathReal.startsWith(projectRootReal)) {
        return errorResult(`PATH_TRAVERSAL: symlink escapes project root`);
      }
    }
  } catch {
    return errorResult(`PATH_TRAVERSAL: realpath check failed`);
  }

  // 4. 阻塞 POST callback，等 backend 回應（backend 等 UI ack，至多 5s 超時）
  try {
    const result = await postMcpEvent<DoneResult>("done", { path: relPath });
    return result;
  } catch (e) {
    const err = e as Error;
    return errorResult(`CALLBACK_ERROR: ${err.message}`);
  }
}
