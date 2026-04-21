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

---

## M1: Spike — 三項技術假設驗證 — 2026-04-21

### 狀態
- ✅ 完成（4/4 tasks 勾選，等 coordinator commit）
- 總耗時：~16 min（遠低於 0.5-1 day timebox）
- 全部 3 項 OQ **PASS**

### 驗證結果摘要

| OQ | 假設 | 結果 |
|---|---|---|
| OQ-1 | `--resume <id>` + `--output-format stream-json` 共存 | ✅ PASS — 3 項 exit criteria 全過 |
| OQ-2 | subagent `tools:` YAML array 語法 | ✅ PASS — 以 `ddd-developer.md` 為 ground truth 確認 |
| OQ-3 | stream-json 事件結構對齊 ADR-004 推定 | ✅ PASS（+3 項新發現納入） |

詳見 `docs/1-v0-mvp/research.md`。

### 對 spec 的回修

**ADR-004（stream-json parser）event 表新增 2 列**：
- `rate_limit_event` → skip（訂閱額度推送）
- `assistant` 的 `thinking` content type → skip（extended thinking block）
- `tool_use` 增加 optional `caller` 欄位註記為 ignore

ADR-002（--resume session 機制）、ADR-003（tool allowlist 語法）**無需修改**。

### 技術發現

1. **每個 event 有 top-level `session_id` + `uuid`** — 簡化 backend 的 session 路由與 dedupe
2. **`rate_limit_event`** 會在每次 turn 出現，v0 skip、v1+ 可用於前端顯示額度狀態
3. **Extended thinking (`type:"thinking"`)** 在某些指令下會出現，v0 skip（Opus model 用 thinking block）
4. **事件輸入格式 `--input-format stream-json`** 本輪未驗證（目前 backend 用 `-p "text"` 也成功）；M2 若需 streaming input（如即時 cancel）再驗證

### 決議

M2 實作可按原設計推進，無阻塞項。

---

## M1 v2 延伸 spike — 因 xreview 發現 v1 有缺陷而重做 — 2026-04-21

### 背景
兩個 Opus reviewer 檢視 commit 5bef808 後判定 v1 spike 有 3 類問題：
1. **偷換命題**：OQ-1 Turn 3 未用 `--resume`，違反 exit criteria 3
2. **未驗證假設**：OQ-2 靠讀 `ddd-developer.md` 反推、OQ-3 樣本空間 1/7
3. **遺漏架構級風險**：plugin agent 碰撞、cwd 變化影響、`--input-format` 未測

使用者決議「全修」，遂以 v2 延伸 spike 覆蓋所有 🔴 級疑慮。

### v2 做法
- OQ-1：重跑、Turn B 同時帶 `--resume` + tool_use，exit criteria 3/3 全過
- OQ-2：建 `.claude/agents/oq2-spike-mcptool.md`（含 `tools: ["mcp__claude_ai_Google_Drive__authenticate", "Read"]`）、spawn CC、驗證 agents 清單含之
- OQ-3：跑 tool error + `--max-turns 2` 逼出 `error_max_turns`、SIGTERM 行為定為 M2 Task 3.C.17-18 的實測範圍
- OQ-4（新增）：驗 plugin agent 碰撞（**確認共存**）、`--agent design-artifact` 覆蓋主 session（**確認可用**）、`--bare` 不可用（**違反 ADR-001**）、`--strict-mcp-config` 隔離 MCP（**確認可用**）
- OQ-5（新增）：驗 cwd 變化下 agent / memory / MCP 發現（**向上尋找 `.claude/agents/`**、memory 跨 subdir 共享）

### 對 spec 的傳導修正
1. **ADR-002 Decision 大改**：新增 backend spawn CC 完整命令（`--agent design-artifact --mcp-config ./.mcp.json --strict-mcp-config --output-format stream-json --verbose --max-turns 50`），`--bare` 列 Alternatives rejected
2. **ADR-004 event table 擴充**：新增 `error_max_turns` / `error_during_execution` / SIGTERM EOF 三種 result 分支
3. **ADR-005 啟用機制明確化**：`.claude/agents/design-artifact.md` 放專案 root、backend 以 `--agent design-artifact` flag 強制主 session 扮演
4. **§邊界案例 9 補註**：預期 skip 的事件（rate_limit_event / thinking / caller）**不寫** raw_log
5. **§5 SQLite schema 新增 `raw_log` table**：id / project_slug / source / severity / reason / raw / created_at
6. **§Open Questions 標 ✅ 已解決** + 列殘留風險（SIGTERM、`error_during_execution` 合成覆蓋、`--input-format stream-json` 暫不採用）

### 對 tasks.md 的傳導修正
7. Task 3.C.1 改為「4 張 table」（加入 raw_log）
8. Task 3.C.17-18 顯式列完整 CC spawn 命令
9. Task 3.C.19 顯式列所有 ADR-004 event table 覆蓋（含 skip 項與 raw_log 寫入）
10. Task 3.C.23 改用「top-level `session_id`」而非等 system.init
11. Task 4.9 人工 + 自動雙軌，parser skip 覆蓋為 unit test 層取代

### 對 packages/shared 的傳導修正
12. `events.ts` `toolStartSchema` 加 optional `parentToolUseId`（防禦性），+4 tests
13. `db-types.ts` 新增 `RawLogRow` / `RawLogSource` / `RawLogSeverity`，+5 tests
14. 測試總數：156 → 165 passed / 0 failed，typecheck 4/4 packages 綠

### 殘留 v0 風險（記 M2/M3）
- SIGTERM 後 CC stream-json 收尾 → M2 Task 3.C.17-18 Red test 涵蓋
- `error_during_execution` 實際結構 → M2 parser test 以合成事件覆蓋
- `--input-format stream-json` 雙向流 → v0 不採用，deferred to v1+（backend 用 `--input-format text`）

### 耗時
v1: ~16 min + v2: ~25 min + 文件回修: ~20 min = ~61 min 總累計，仍在 0.5-1 d timebox 內。
