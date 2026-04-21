// @design-house/backend/util/workspace — 偵測 monorepo workspace root
// 因為 pnpm --filter <pkg> dev 會把 process.cwd() 設為 package 目錄，
// 不能用 cwd 作為 data / projects / mcp config 的基準。
// 這個 helper 從 import.meta.url 往上走 4 層回到 repo root，dev/prod 皆適用。
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

function detectWorkspaceRoot(fileUrl: string): string {
  const filePath = fileURLToPath(fileUrl);
  // 本檔路徑：apps/backend/{src|dist}/util/workspace.{ts|js}
  // 上 4 層：util → src|dist → backend → apps → repo root
  return resolve(dirname(filePath), "..", "..", "..", "..");
}

/** Monorepo workspace root 絕對路徑。允許用 `DH_WORKSPACE_ROOT` env 覆寫（測試用）。 */
export const WORKSPACE_ROOT = process.env["DH_WORKSPACE_ROOT"] ?? detectWorkspaceRoot(import.meta.url);

/** 專案資料目錄 root（`<workspace>/projects/`）。 */
export const PROJECTS_ROOT = resolve(WORKSPACE_ROOT, "projects");

/** SQLite 資料庫路徑（`<workspace>/.data/design_house.db`）。 */
export const DB_PATH = resolve(WORKSPACE_ROOT, ".data", "design_house.db");
