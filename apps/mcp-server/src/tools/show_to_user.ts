// show_to_user.ts — Task 3.B.12 Green
// fire-and-forget：path guard 後立即回 {ok:true}，不等 UI ack
import * as fs from "node:fs";
import { joinProject, PathTraversalError } from "@design-house/shared/paths";
import { showToUserInputSchema } from "@design-house/shared/mcp-tools";
import { env } from "../env.js";
import { postMcpEvent } from "../callback.js";

type McpErrorResult = {
  isError: true;
  content: Array<{ type: "text"; text: string }>;
};

function errorResult(text: string): McpErrorResult {
  return { isError: true, content: [{ type: "text", text }] };
}

export async function showToUserTool(input: unknown): Promise<
  | { ok: true }
  | McpErrorResult
> {
  // 1. 輸入驗證
  const parseResult = showToUserInputSchema.safeParse(input);
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

  // 3. runtime 層 symlink boundary check（檔案不一定存在，此 tool 只做 path 驗證）
  // 若檔案不存在則跳過 realpath check（UI 送 REST 請求時 backend 會處理 404）
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

  // 4. fire-and-forget：觸發 callback，不等回應
  // 意圖：backend 廣播 show-to-user WS 事件後立即回應 CC
  void postMcpEvent("show_to_user", { path: relPath });

  return { ok: true };
}
