// CC health check — 啟動時驗證 CC CLI 安裝與認證狀態
import { execSync } from "node:child_process";

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

  // 1. 驗證 CC CLI 是否在 PATH 中
  try {
    execSync(`"${cc}" --version`, { stdio: "pipe", timeout: 5000 });
  } catch {
    return {
      ok: false,
      code: "CC_NOT_INSTALLED",
      message: "claude CLI not found. Please install Claude Code: https://claude.ai/download",
    };
  }

  // 2. 驗證 CC 是否已登入（短 ping）
  try {
    const result = execSync(`"${cc}" -p "ok"`, { stdio: "pipe", timeout: 15000 });
    const output = result.toString();
    if (output.includes("Please run claude login") || output.includes("not authenticated")) {
      return {
        ok: false,
        code: "CC_NOT_AUTHENTICATED",
        message: "claude CLI not authenticated. Please run: claude login",
      };
    }
  } catch (e) {
    const stderr = (e as { stderr?: Buffer }).stderr?.toString() ?? "";
    if (stderr.includes("Please run claude login") || stderr.includes("not authenticated")) {
      return {
        ok: false,
        code: "CC_NOT_AUTHENTICATED",
        message: "claude CLI not authenticated. Please run: claude login",
      };
    }
    // 其他錯誤（如 network timeout）— 不視為安裝失敗，繼續啟動
  }

  return { ok: true };
}
