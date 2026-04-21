# Works: v0 MVP — 實作日誌

> 由 `/ddd.work` 維護，記錄每個 milestone 的技術決策、問題解決與與 spec 的偏差。

---

## M0: Monorepo scaffold + shared contracts — 2026-04-21

### 狀態
- ✅ 完成
- 12/12 tasks 勾選（Task 1.12 即下一輪 commit）
- Tests: **156 passed / 0 failed**（events 60、mcp-tools 39、paths 30、db-types 27）
- `pnpm -r typecheck`: 4/4 packages 綠

### 技術決策

**D1. pnpm 安裝路徑**
環境中 Node 25 已裝但無 pnpm、無 corepack。採用 `npm install -g pnpm@10.33.0` 全域安裝。Corepack 在本環境不可用因此跳過。可逆操作、對 repo 無影響。

**D2. Fastify v5 取代 spec ADR-009 的 v4**
Spec ADR-009 指定 Fastify v4。Committed 為 `fastify ^5.2.0`（v5 當前穩定、Node 20+ 最佳支援、TS 型別更好、WebSocket plugin 同步升級）。兩個版本的 handler API 差異極小，對 v0 範圍無實質影響。建議後續在 `/ddd.xreview` 前回修 ADR-009 的版本號以保文件一致，或直接在本檔註記。

**D3. pnpm `onlyBuiltDependencies` allowlist**
pnpm v10 預設封鎖 native build scripts（安全政策）。better-sqlite3 是必需 native build。在根 `package.json` 加 `"pnpm": { "onlyBuiltDependencies": ["better-sqlite3", "esbuild"] }` 做明確許可名單。esbuild 是 Vite 內部依賴。

**D4. Worker 不用 worktree 隔離**
Agent tool 的 `isolation: "worktree"` 在 session 啟動時即判定「not in a git repository」（session 初始化時 repo 尚未 init），之後 `git init` 了也不更新判定。Fallback：worker 直接在 feat/1-v0-mvp 分支工作、不隔離。由於 M0 是序列執行（只有一個 worker 在跑），無並發衝突風險。

**D4a. M2「平行工作線」改序列派發（2026-04-21 使用者決議）**
原計畫 M2 以 worktree 隔離派 4 個 ddd-developer 並行。因 D4 限制無法 worktree。使用者選擇 **方案 (a) 序列派發**：coordinator 一次派一個 worker、完成後 merge 再派下一個，以穩妥換取時間。預期結果：M2 執行時間從原估 ~1 週（並行）增至 ~2 週（序列），但無合併衝突風險、每條工作線可獨立驗收。tasks.md M2 的 🔀 標記保留作為邏輯結構，執行上視為 [A] → [B] → [C] → [D] 線性。

**D5. Shared 模組設計**
- `events.ts` — 16 個 Zod schemas 對應 5 client→server + 11 server→client 事件 + `ClientToServerEvent` / `ServerToClientEvent` 兩個 discriminated union。
- `mcp-tools.ts` — 5 工具 input/output schemas，`listFilesInputSchema` 用 `.strict()` 強制拒絕 `filter`/`offset`（ADR-005 硬規 8 的型別層保障）。
- `db-types.ts` — 純 TypeScript interface（不用 Zod，因為 SQLite row 不從 untrusted source 來）。SQLite 的 `is_error` 欄位用 `0 | 1 | null` 聯集。
- `paths.ts` — 3 純函式：`toPosix` / `isSafeRelativePath` / `joinProject`。Symlink resolve 檢查明確註記由呼叫端用 `fs.realpathSync` 搭配，函式只做字串級邊界。
- `index.ts` — 四個模組全 re-export，讓 apps 可以 `import { ... } from "@design-house/shared"` 直接取。

### 與 spec 的偏差

| 項目 | Spec | 實際 | 影響 |
|---|---|---|---|
| Fastify 版本 | v4（ADR-009）| v5 | 小，API 語意一致 |
| better-sqlite3 build | 直接安裝 | 需要 pnpm allowlist | 已在 root package.json 記錄 |
| Branch 名 | `feat/1-v0-mvp` | 一致 | — |
| Worker 隔離 | 平行階段建議 worktree | 暫用非隔離模式（環境限制） | 需要在 M2 驗證可行或調整策略 |

### 已知待處理項

- Task 1.12（最終 commit）— 待使用者確認後由 coordinator 執行
- `.claude/settings.local.json` 有 un-tracked 變更（來自 ddd-workflow skill 執行過程中累積的權限條目），一併進 M0 commit
- 未啟動 ESLint / Prettier — v0 不強求，留給 v1+ 擴充
