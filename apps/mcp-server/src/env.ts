// env.ts — Task 3.B.2 Green
// Fail-fast: 啟動時若缺少必要 env var，立即寫 stderr + exit(1)

const REQUIRED_VARS = [
  "DH_INTERNAL_TOKEN",
  "DH_WEB_PORT",
  "DH_PROJECT_ROOT",
  "DH_PROJECT_SLUG",
] as const;

export type Env = {
  DH_INTERNAL_TOKEN: string;
  DH_WEB_PORT: string;
  DH_PROJECT_ROOT: string;
  DH_PROJECT_SLUG: string;
};

export function loadEnv(): Env {
  const missing: string[] = [];

  for (const key of REQUIRED_VARS) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    process.stderr.write(
      `[mcp-server] Missing required environment variable(s): ${missing.join(", ")}\n` +
        `Please ensure backend injects these env vars before spawning mcp-server.\n`
    );
    process.exit(1);
  }

  return {
    DH_INTERNAL_TOKEN: process.env.DH_INTERNAL_TOKEN as string,
    DH_WEB_PORT: process.env.DH_WEB_PORT as string,
    DH_PROJECT_ROOT: process.env.DH_PROJECT_ROOT as string,
    DH_PROJECT_SLUG: process.env.DH_PROJECT_SLUG as string,
  };
}

// env 單例：模組 import 時執行 fail-fast 驗證
// 工具模組透過 import { env } from "../env.js" 取得共用設定
// 測試中透過 vi.mock("../env.js", () => ({ env: { ... } })) 覆蓋
export const env: Env = loadEnv();
