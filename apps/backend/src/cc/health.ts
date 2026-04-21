// CC health check — 啟動時驗證 CC CLI 安裝與認證狀態
import { execSync } from "node:child_process";

// Windows 下 `claude` 是 .cmd shim，execSync 不走 shell 會找不到
const EXEC_SHELL = process.platform === "win32";

export type HealthStatus =
  | { ok: true }
  | { ok: false; code: "CC_NOT_INSTALLED" | "CC_NOT_AUTHENTICATED"; message: string };

// 單例快取——server 啟動時 check 一次，UI 訂閱時讀取並廣播。
let _cached: HealthStatus | null = null;

export function setHealthStatus(status: HealthStatus): void {
  _cached = status;
}

export function getHealthStatus(): HealthStatus | null {
  return _cached;
}

/**
 * 檢查 CC CLI 是否已安裝並登入。
 * 不 fail-fast，回傳狀態讓 server 繼續啟動（UI 顯示安裝指引）。
 */
export function checkCcHealth(): HealthStatus {
  const cc = process.env["CC_PATH"] ?? "claude";

  // 1. 驗證 CC CLI 是否在 PATH 中（Windows 需 shell 走 PATHEXT 找 .cmd）
  try {
    execSync(`"${cc}" --version`, { stdio: "pipe", timeout: 5000, shell: EXEC_SHELL ? "cmd.exe" : undefined });
  } catch {
    return {
      ok: false,
      code: "CC_NOT_INSTALLED",
      message: "claude CLI not found. Please install Claude Code: https://claude.ai/download",
    };
  }

  // 登入檢測故意不在啟動時做（會阻塞 5-15s、違反 NFR-11 的 3s 啟動上限、
  // 且導致 Vite proxy 在 backend 尚未 listen 期間 ECONNREFUSED）。
  // 登入失敗會在 spawner 的 stderr handler 捕到「Please run claude login」字串
  // 並主動 WS broadcast CC_NOT_AUTHENTICATED，使用者第一次送訊息時就會看到 toast。
  return { ok: true };
}
