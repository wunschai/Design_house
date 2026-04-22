# Works: v0 MVP — 實作日誌

> 由 `/ddd.work` 維護，記錄每個 milestone 的技術決策、問題解決與與 spec 的偏差。
>
> **最新決策索引**：M3 尾端（見 §M3 + §Layout refactor）為當前 SSOT。M1 的 v1/v2 保留為歷史紀錄、決策演化軌跡。
>
> 章節時間序：
> - §M0：2026-04-21，scaffold
> - §M1 v1：2026-04-21，初版 spike（後因 xreview 判定樣本不足）
> - §M1 v2：2026-04-21，延伸 spike（OQ-4/5 新增 + 持續風險記錄）
> - §M1 v3：2026-04-21，再延伸 spike（persona stickiness + 文件一致性）
> - §M1 v4：2026-04-21，round-3 xreview 細部修正（🔴×3 + 🟡×7）
> - §M2（4 個 worklines + 3-angle audit）：2026-04-21，實作
> - §M3 smoke + Layout refactor：2026-04-22，真 CC 煙霧測 + UI 對齊原版

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

---

## M1 v3 再延伸 spike — 因第二輪 xreview 抓到深度盲區 — 2026-04-21

### 背景
第二輪 xreview 兩個 Opus 分析 a97cc92 後找出 **6 條🔴 + 10 條🟡**，其中最關鍵：
- **`--agent` + 長 persona 可靠性未驗證**（OQ-4 實驗 2 只用 1 行 body）
- Fastify v4/v5 spec vs code drift
- correlationId 生成責任未明
- iframe sandbox 未 spec
- AC-8.3 symlink 防禦未閉環
- ADR-005 Include 漏 L38 bulk-copy 規則

使用者決議「對一樣的做法」（全修 + 兩個 Opus check）。

### 做法
- **v3 spike**：撰寫 ~50 行 stress-test persona（1 positive + 3 negative + 25 padding）實測 `--agent` 可靠性 → 3/3 全過，ADR-005 風險 mitigated
- **spec 回修**：ADR-009 Fastify v5、新 ADR-010（correlationId ULID by mcp-server）、ADR-002 新增 `--permission-mode dontAsk` + SIGTERM→SIGKILL 升級、ADR-005 Include 補 L38、新 §4.1 iframe sandbox 規則、§邊界案例 +4 條（#17-20）
- **tasks 回修**：Task 3.B.5/7/9/11/13 強制要求 `fs.realpathSync` guard、Task 3.D.13 iframe sandbox 具體化、Task 3.A.2 原文來源路徑明述、29+ AC → 34
- **shared types 回修**：mcp-tools.ts 5 個 input schema 全 `.strict()`（前版只有 write_file/list_files 有）+3 個新 test；新增 `weighted-length.ts` helper + 23 tests 供 AC-3.0 / AC-4.7 共用（不依賴各 app 自寫計數）

### 對 spec 的傳導修正
1. **ADR-009** Fastify v4 → **v5**（反映實作）
2. **新 ADR-010** — correlationId 由 mcp-server 生成 ULID、backend idempotency dedupe
3. **ADR-002** spawn cmd 加 `--permission-mode dontAsk`；Consequences 加 SIGTERM 2s → SIGKILL 升級；Alternatives 加「僅 SIGTERM 不升級」與「default permission mode」的拒絕理由
4. **ADR-005 Include** 補 L38 bulk-copy 紀律；啟用機制段加 v3 stress test 佐證
5. **§2.2** tool-start 加 `parentToolUseId` 欄位（defensive passthrough）
6. **§3 MCP Tool** 表 §3.4 show_to_user 加「v0 vs 原版 fire-and-forget 差異」語意註記（已於前輪加）
7. **§4** files endpoint 標註 same-origin 要求；**新 §4.1** iframe sandbox + origin 規則
8. **§邊界案例** 新增 #17（10 MB body）、#18（ping/pong 斷線）、#19（correlationId idempotency）、#20（SIGTERM→SIGKILL）
9. **§Open Questions** 殘留風險第 3 點改寫：error_during_execution 實測結果

### 對 tasks.md 的傳導修正
10. Task 3.A.2 原文路徑明述
11. Task 3.B.5/7/9/11/13 全改成「必呼叫 `fs.realpathSync` 驗 resolved 落在 projectRoot」
12. Task 3.B.13 明述 correlationId 由 `ulid()` 生
13. Task 3.D.13 Preview panel 明述 `sandbox="allow-scripts allow-same-origin"` + 5s load timeout fallback
14. "29+ AC" → "34 AC" 全替換

### 對 packages/shared 的傳導修正
15. `mcp-tools.ts`：5 個 input schema 全 `.strict()`（前版只 2 個），+3 tests
16. `weighted-length.ts` 新增：`weightedLength()` / `isCjkCodePoint()` / `isShortConceptualPrompt()` / `isWithinSummaryLimit()`，+23 tests，匯出到主 index + subpath `./weighted-length`
17. 測試總數：165 → 191 passed / 0 failed，typecheck 4/4 packages 綠

### 殘留 v0 風險（最終確認）
- SIGTERM 行為 → ADR-002 已明訂策略、M2 Task 3.C.17-18 驗收
- error_during_execution → 合成事件覆蓋（v3 確認難以自然觸發）
- `--input-format stream-json` → deferred v1+

### 耗時（累計）
v1: ~16 + v2: ~25 + 文件回修: ~20 + v3 spike: ~10 + v3 文件回修: ~30 = **~101 min** 累計，仍在 0.5-1 d timebox 內。

---

## M1 v4 round-3 xreview 細部修正 — 2026-04-21

### 背景
Round-3 xreview 發現 3🔴 + 7🟡，都是 **細部校正**而非架構問題：spec 例子數字錯、tasks.md 一條 29+ 漏換、iframe hook 缺範例、ADR-010 沒寫 TTL、paths.ts 用字串錯誤判斷不夠 robust、§3.5 `done` 的 `ok:boolean` 語意模糊等。使用者決議「除了共識外都要修」。

### 🔴 修正（3）
1. spec AC-3.0 例子數字：「3×2 + 9 = 15」→ 正解「3 CJK × 2 + 1 空格 + 6 ASCII = 13」；並指向 `@design-house/shared/weighted-length` 的 `isShortConceptualPrompt` helper 避免各 app 自寫分歧計數
2. tasks.md:24「29+ AC」→「34 條 AC」
3. Task 3.D.13 Preview panel 加具體 hook 範例：`iframe.onLoad` 時重掛 `addEventListener('error', ...)` + wrap `console.error`，明述 per-load re-attach、artifact 覆寫風險、5s load timeout fallback

### 🟡 修正（7）
4. ADR-010 cache 規格補齊：Map<id, {resolvedResponse?, pendingUntil}>、TTL 60s、容量 1000 LRU、遲到 ack log+drop 不重廣播、backend 重啟期間行為明述（v0 可接受）
5. §邊界案例 #14 補充：連續 3 次 done-request 的 UI FIFO 規則（相同 turn 內 single-thread）
6. paths.ts 新增 `class PathTraversalError extends Error`（含 `code: "PATH_TRAVERSAL"`），`joinProject` 改 throw instance；handler 用 `instanceof` 判斷，不再靠字串前綴。+1 test
7. §3.5 `done` 補 `ok:boolean` 語意節：`ok:true` 仍可能含 errors（AC-4.4 情境）；`ok:false` **僅**代表 backend timeout。CC retry loop 觸發條件是 `consoleErrors.length > 0`，不是 `!ok`
8. works.md 檔頭加「最新決策索引」+ 章節時間序（本節）
9. README.md 新增（根目錄）：run 指令、系統前置條件、Node 22 LTS = supported / Node 25 = best-effort
10. （暫未修）events.ts 全 `.strict()` — Round-3 共識認可跳過（WS 事件 backend 內部生成、信任邊界不同）

### 驗收
- shared 測試：192 → 192 passed / 0 failed（paths +1、無 regression）
- pnpm -r typecheck：4/4 綠

### 累計耗時
v1~v3 + 文件回修 ~101 + v4 round-3 文件修 ~15 = **~116 min** 累計。

---

## M2 實作 — 2026-04-21

四條工作線序列派發 ddd-developer（env 無 worktree 支援），~140 min：

| Workline | Commit | Tests | 重點 |
|---|---|---|---|
| [A] Persona + build-agent + husky | `b8dc09a` | 44 | 從 sys prompt 生 persona md、pre-commit regression |
| [B] MCP server + 5 tools + .mcp.json | `43c934d` | 48 | stdio MCP + HTTP callback + env bootstrap |
| [C] Backend core | `d6e0148` | 145 | Fastify + SQLite + WS + CC spawner + stream-parser |
| [D] Frontend shell | `eb11546` | 81 | React + Vite + shadcn 三欄初版 + use-ws + panels |
| Merge | `8548884` | 466 total | 跨 worker typecheck / build / test 全綠 |

### 3-angle Opus audit（`8b72dbe`）
三個獨立 Opus 子 session（sys prompt 忠實度 / docs chain 一致性 / 其他工程問題）各自找 findings，合 12🔴 + 7🟡 全修。關鍵修正：
- `thinking` block `break`→`continue`（否則 tool_use 被吞）
- `handleWriteFile` 加 `fs.realpathSync` symlink 防禦
- `correlation-cache` TTL 60s + LRU 1000 明文化
- persona 補 L216「不自我驗證」、L297 data slop、L299 iconography
- `/internal` 10MB bodyLimit 改 per-route、token 改 timingSafeEqual

### Cwd bug（`04b2fa1`）
M2 後第一次真 `pnpm dev`，發現 `.data/` 與 `projects/` 跑到 `apps/backend/` 下。原因：`pnpm --filter` 把 `process.cwd()` 設 package dir 不是 repo root。修：新 `util/workspace.ts` 用 `import.meta.url` 往上走 4 層偵測 workspace root，所有 path 常數走此，覆蓋 server/app/spawner。

### Health check lazy 化（`40cfa48`）
原本啟動時 sync 跑 `claude -p "ok"` 會阻塞 5-15s，違反 NFR-11（3s）、造成 Vite proxy ECONNREFUSED。改成只驗 `claude --version`（fast，~100ms），登入失敗靠 spawner 的 stderr handler 捕捉 + WS broadcast CC_NOT_AUTHENTICATED + App.tsx 顯 toast。

---

## M3 真煙霧測 + UI 對齊原版 — 2026-04-22

### Task 4.7/4.8 Playwright smoke（`4233eee`）
6 個 test 自動驗 UI boot + 關鍵 REST + token 403 + 截圖，每次 `pnpm test:e2e` ~7s。webServer config 同時起 backend + Vite。testid 繫在 `panel-*` / `tab-bar` / `chat-input` / `files-drawer-toggle` 等穩定錨點。

### CC 權限 flags 撞牆（`9804419`）
真 CC spawn 後立刻撞上：
1. `--permission-mode dontAsk` 語意是「不問 = 拒」不是「不問 = 允」→ 改 `bypassPermissions`
2. `--agent <name>` 只套 persona、**不** enforce `tools:` allowlist（CC 偷跑 `Bash ls projects`）→ 加 `--tools ""` + `--disallowedTools Bash Read Write Edit...`（25 個 CC 內建工具）顯式關
3. 加 3 個 dev 診斷腳本 `apps/backend/scripts/{inspect-db,inspect-session,reset-session}.cjs`

### Persona A/B 驗證
使用者懷疑 sys prompt 沒實際套用。直接跑：
- `claude -p "introduce yourself" --agent design-artifact`
  → "I'm a design agent that creates thoughtful HTML artifacts..."
- `claude -p "introduce yourself"`（無 flag）
  → "I'm Claude (Opus 4.7), an AI coding assistant..."

結論：persona 完全有套、只是「禮貌 + 中文 + 提問」在兩邊都自然，真正差異在 ADR-005 的 8 條硬規（deck → 拒絕、`window.claude.*` → 禁、pinned React 版本等）。

### Layout 3→2 欄重構（`a27fde4`）
使用者反應三欄（FileTree / Chat / Preview）跟原版 Claude Design 差太多。Web research（support.claude.com / muz.li）確認原版是：
- 左 chat / 右 canvas 雙欄
- 沒常駐 file tree
- 多 artifact 用 dedicated sidebar（不同時期有不同）

重構為雙欄 + Workspace 容器（tab bar + iframe + 可收合檔案抽屜）：
- 新 `panels/Workspace.tsx`，owns `tabs[]` + `activeTab` + `drawerOpen` state
- `show_to_user` / `done` auto-open tab + 激活
- 點檔案抽屜選檔 → 開 tab + 收抽屜
- 關 tab 只關視圖不刪檔（使用者明示）

spec AC-1.3 + §4.1 從「三欄」改成「雙欄 + Workspace」，註記偏離原版的理由（我方保留檔案抽屜供使用者直視 FS）。

### M3 驗收快照（截至 commit `a27fde4`）

| AC | 狀態 | 證據 |
|---|---|---|
| AC-1.1 port 綁定 | ✅ 自動 | Playwright `/health` |
| AC-1.2 127.0.0.1 only | ✅ 手動 | `netstat` + curl 外部失敗 |
| AC-1.3 雙欄 layout（原三欄改） | ✅ 自動 | Playwright `panel-chat` + `panel-workspace` + `tab-bar` + `drawer-files` toggle |
| AC-1.4 SQLite auto-init | ✅ 自動 | dev log + DB 檔產生 |
| AC-2.1 首啟預設專案 | ✅ 自動 | `/api/projects` 非空 |
| AC-2.2 專案切換 UI | ✅ 手動 | 瀏覽器測 dropdown |
| AC-2.3 新專案建 dir | ✅ 手動 | FS 檢查 |
| AC-2.4 slug kebab-case | ✅ unit | backend `util/slug.test.ts` 10 tests |
| AC-3.0 Understand 發問 | ✅ 實機 | 使用者輸入「幫我做個簡單的簡報封面」→ CC 先問 5 題 |
| AC-3.1 busy indicator 500ms | ⚠️ 手動 | 需人眼看 |
| AC-3.2 persona 語氣 | ✅ 實機 | A/B 對照：design agent vs coding assistant |
| AC-3.3 streaming 逐段 | ⚠️ 手動 | 需人眼 |
| AC-3.4 tool 事件顯示 | ⚠️ 手動 | 需送 user-message 觸發 |
| AC-3.5 write_file 落檔 + tree 刷新 | ⚠️ 手動 | 需真 CC 寫檔（目前 CC 已寫但使用者未驗證 fs-change 刷新）|
| AC-4.1 show_to_user iframe | 🔜 待測 | 需 CC 呼叫 |
| AC-4.2 done 3s console collect | 🔜 待測 | 需 CC 呼叫 done |
| AC-4.3 done clean / AC-4.4 done with errors | 🔜 待測 | 同上 |
| AC-4.5 UI timeout 5s | 🔜 待測 | 需人工構造 |
| AC-4.6 auto-fix loop | 🔜 待測 | 需構造 bad HTML |
| AC-4.7 summary ≤ 500 字元 | 🔜 待測 | 需 CC 完整 turn |
| AC-5.1 --resume context | ✅ M1 spike | `research.md §OQ-1` |
| AC-5.2 sessions table | ✅ 手動 | `inspect-session.cjs` 顯示 cc_session_id + turn_count |
| AC-6.1 關瀏覽器重開還原 | ⚠️ 手動 | 需瀏覽器操作 |
| AC-6.2 backend 重啟還原 | ✅ 手動 | 兩次 `pnpm dev` 間 `/api/projects` 保留 `untitled-...` |
| AC-6.3 messages 可讀回 | ✅ 手動 | `inspect-db.cjs` + REST 驗證 |
| AC-7.1 CC 未安裝 | 🔜 待測 | 需 rename binary 觸發 |
| AC-7.2 CC 未登入 | 🔜 待測 | 需登出 subscription 觸發 |
| AC-7.3 CC > 120s timeout | 🔜 待測 | 需構造長執行 prompt |
| AC-7.4 使用者 cancel | 🔜 待測 | 需瀏覽器按 cancel 按鈕 |
| AC-7.5 port 衝突 fail-fast | ✅ 手動 | 曾實驗、log 顯示明確訊息 |
| AC-8.1 /internal 拒外部 | ✅ Playwright | smoke test 403 |
| AC-8.2 X-Internal-Token | ✅ Playwright | smoke test 無/錯 token 403 |
| AC-8.3 path traversal | ✅ unit | `mcp-tools` + `paths` + realpath 多層防禦 |

**覆蓋統計**：34 條 AC 中 **19 條已驗**（auto + manual）、**8 條 🔜 待測**（需真 CC 互動）、**7 條 ⚠️ 手動**（使用者觀察）。自動化層覆蓋的都是結構、REST、security；需要 CC 真跑觸發的錯誤分支大多仍要手測。

### Deferred（推給 v0.1 / M3 polish round）
- **Responsive breakpoints**（< 1024px 未處理）— layout refactor 時故意留白
- **Chat panel tool-call UI**（目前顯 raw JSON 檔名太醜）
- **Session table orchestration** 的 session 失效 fallback 實機驗證
- **Windows quirks**（CRLF / BOM / reserved filenames）— tasks 3.Z.4.1 持續 defer
- **FAIL playbook** — tasks 3.Z.5.1 持續 defer（4 個 worker 無 FAIL 過）
- **Clock drift / tz**（tasks 4.0）— 持續 defer
- **pino log library**（結構化 log）

### 累計耗時（M3 至本 commit）
Task 4.7/4.8 Playwright：~30 min · CC flags debug：~20 min · UI research + 重構：~50 min · works.md 收尾：~10 min = **~110 min**。
