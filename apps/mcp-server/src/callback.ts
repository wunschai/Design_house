// callback.ts — Task 3.B.4 Green
// HTTP callback client：POST 到 backend /internal/mcp-event
import { ulid } from "ulid";
import { env } from "./env.js";

const TIMEOUT_MS = 5_000;
const RETRY_DELAY_MS = 200;
const MAX_ATTEMPTS = 3;

type McpEventBody = {
  projectSlug: string;
  correlationId: string;
  tool: string;
  args: unknown;
};

type BackendSuccess<T> = { ok: true; result: T };
type BackendError = { ok: false; error: { code: string; message: string } };
type BackendResponse<T> = BackendSuccess<T> | BackendError;

async function attemptPost<T>(body: McpEventBody): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(
      `http://127.0.0.1:${env.DH_WEB_PORT}/internal/mcp-event`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Token": env.DH_INTERNAL_TOKEN,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      }
    );

    const data = (await response.json()) as BackendResponse<T>;

    if (!data.ok) {
      throw new BackendLogicError(`${data.error.code}: ${data.error.message}`);
    }

    return data.result;
  } finally {
    clearTimeout(timer);
  }
}

// 標記 backend 回傳 ok:false 的邏輯錯誤，不重試
class BackendLogicError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackendLogicError";
  }
}

/**
 * 向 backend POST MCP 事件，帶 X-Internal-Token header。
 * correlationId 每次呼叫由 ulid() 新生（ADR-010）。
 * 網路 / timeout 失敗時退避重試 2 次（共 3 次嘗試），最終失敗 throw。
 * Backend 回傳 ok:false（邏輯錯誤）則立即 throw，不重試。
 */
export async function postMcpEvent<T>(tool: string, args: unknown): Promise<T> {
  const correlationId = ulid();
  const body: McpEventBody = {
    projectSlug: env.DH_PROJECT_SLUG,
    correlationId,
    tool,
    args,
  };

  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }

    try {
      return await attemptPost<T>(body);
    } catch (err) {
      // backend 邏輯錯誤（ok:false）立即向上拋，不重試
      if (err instanceof BackendLogicError) {
        throw err;
      }
      lastError = err;
    }
  }

  throw lastError;
}
