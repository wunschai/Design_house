# Tasks: v0 MVP — Design_house 本機設計平台骨幹

> 由 `/ddd.tasks` 產出，上游 `spec.md`。下一步交棒 `/ddd.work`。
> 建立日期：2026-04-21

## Scope 評估

v0 MVP 是**單一 feature sprint**：backend / mcp-server / frontend 三個 app 雖然分離，但必須整合才能交付端到端 demo。不拆成多份 tasks.md。monorepo 內部透過 `packages/shared` 的 contracts 解耦 → 支援中期平行開發。

## Milestone 總覽

| Milestone | 主題 | 模式 | Effort |
|---|---|---|---|
| **M0** | Monorepo scaffold + shared contracts | 序列 | M (~0.5 d) |
| **M1** | 三項技術 spike（OQ-1/2/3） | 序列，timeboxed | M (0.5-1 d) |
| **M2** | 實作 — 4 條平行工作線 | 🔀 並行 | XL (~1 週) |
| **M3** | 整合 + E2E smoke + AC 驗收 | 序列（匯合點） | M (~1 d) |

**Effort 圖例**：S = < 1 h、M = 1-4 h / 半天、L = 4-8 h / 1 天、XL = 多天

**AC 覆蓋規劃**（34 條 AC 全數對應到 task）：
- M0：AC-1.4 (SQLite schema 預備)
- M2：其他 28 條 AC 分散到四條工作線
- M3：對 spec 34 條 AC 逐條勾選

---

## Milestone 1 (M0): Monorepo scaffold + 介面契約

> **預期結果**：`pnpm install` 通過、`pnpm -r build` 通過、git repo 初始化、`packages/shared` 可被 apps import
> **驗證方式**：`pnpm -r build` 無錯、`git log` 見首個 commit、`pnpm --filter @design-house/shared test` 通過
> **AC 對應**：AC-1.4（SQLite schema 預備，實作在 M2-C 但型別在此定案）
> **完工 DoD**：shared types 可以被 apps/backend、apps/mcp-server、apps/frontend、E2E 測試框架四方 import 使用、tsc 零錯

### Tasks

- [x] **Task 1.1**（S）：`git init` + root `package.json` + `pnpm-workspace.yaml` + `tsconfig.base.json`（strict、ES2022、moduleResolution bundler）
- [x] **Task 1.2**（S）：`.gitignore` — `node_modules/`、`dist/`、`projects/`、`.data/`、`.tmp-*`、`.env.local`、`*.log`
- [x] **Task 1.3**（S）：四個 sub-package stub — apps/backend、apps/mcp-server、apps/frontend、packages/shared 各自的 `package.json` + `tsconfig.json`（extends base）
- [x] **Task 1.4**（S）：`packages/shared/src/events.ts` 型別測試 (Red) — 為 WS 的 5 個 client→server + 11 個 server→client event 各自寫一個「payload 符合 schema」的 type assertion 測試
- [x] **Task 1.5**（M）：`events.ts` 實作 (Green) — Zod schema + discriminated union + 對應 TS types；對照 spec §2.1 + §2.2
- [x] **Task 1.6**（S）：`packages/shared/src/mcp-tools.ts` 測試 (Red) — 5 工具的 input/output Zod schema
- [x] **Task 1.7**（M）：`mcp-tools.ts` 實作 (Green) — 對照 spec §3.1-3.5；error code enum
- [x] **Task 1.8**（S）：`packages/shared/src/db-types.ts` 測試 (Red) — Project / Session / Message row types
- [x] **Task 1.9**（S）：`db-types.ts` 實作 (Green) — 對照 spec §5 SQLite schema
- [x] **Task 1.10**（S）：`packages/shared/src/paths.ts` 測試 (Red) — POSIX normalize、path traversal guard（拒 `..`、絕對路徑、symlink resolve-check）
- [x] **Task 1.11**（M）：`paths.ts` 實作 (Green) — 對照 ADR-008（對外字串一律 POSIX `/`）+ ADR-005 硬規 8
- [x] **Task 1.12**（S）：git commit M0 — message `"M0: scaffold + shared contracts"`

---

## Milestone 2 (M1): Spike — 三項技術假設驗證

> **預期結果**：`docs/1-v0-mvp/research.md` 寫入 3 個 spike 結論 + 視需要的 ADR-002/003/004 回修 commit
> **驗證方式**：research.md 三節皆有「Pass / Fail + 證據」；若任一 Fail，ADR 已更新 fallback plan
> **AC 對應**：無直接 AC，但驗證後續 M2-C 實作假設
> **超時限制**：0.5-1 個工作日；若超時須回報降級方案
> **完工 DoD**：三 spike 皆結論、exit criteria 全過（或明確記錄 fallback）

### Tasks

- [x] **Task 2.1 (OQ-1 Spike)**（M）：建立 `scripts/spike-resume.sh`（或 .ps1）跑 3 輪 CC — (1) 首輪無 `--resume` + `--input/output-format stream-json`，截下 `session_id`；(2) 第二輪 `--resume <id>`，問「記得我們剛才講什麼」驗證 context；(3) 第二輪使 CC 呼叫一次（任意工具），截下 tool_result 是否進入 stream-json 輸出。結論寫 research.md §OQ-1。對應 spec OQ-1 exit criteria 三項。
- [x] **Task 2.2 (OQ-2 Spike)**（S）：建立 `.claude/agents/test-spike.md` + minimal `.mcp.json` 跑一個 echo tool，試 `tools: [mcp__echo__echo]` / `tools: [Read]` / `tools: [Read, mcp__echo__*]` 三種語法，記錄哪種生效。結論寫 research.md §OQ-2。
- [x] **Task 2.3 (OQ-3 Spike)**（M）：跑 CC 範例對話（包含 text response、tool use、tool result、final result），擷取原始 stream-json 輸出到 `research.md` 的 event catalog 區。對照 spec ADR-004 推定的欄位結構標註 match/mismatch。
- [x] **Task 2.4**（S）：依 spike 結果回修 ADR-002（session 機制）/ ADR-003（tool allowlist 語法）/ ADR-004（stream-json parser 映射），若任一 ADR 須變更，commit `"M1: spike results + ADR updates"`；若全對齊原設計，commit `"M1: spike verified, no ADR change"`。

---

## Milestone 3 (M2): 實作 — 4 條平行工作線

> **預期結果**：4 條工作線各自在獨立 worktree 中完成 unit/integration 測試全過；匯合到 main feat branch 後可跑完整端到端（留給 M3 驗證）
> **介面契約已在 M0 + M1 確立**：`packages/shared` types、`.mcp.json` 格式、subagent frontmatter 語法、spec §1/§2/§3/§4 的 API schemas

### 🔀 可平行工作線

**[A] Persona 建構** — `isolation: worktree`
> **範圍**：`.claude/agents/design-artifact.md`、`apps/backend/src/persona/`
> **依賴**：M0 (Task 1.3 backend package stub)、M1 (Task 2.2 subagent tools 語法確定)
> **介面契約**：ADR-005 Include 清單（~30 條）+ Exclude 清單 + 8 條 Fallback/Constraint 硬規；tool list 匹配 `mcp__design_house__{read_file,write_file,list_files,show_to_user,done}`
> **驗證方式**：`pnpm --filter backend test src/persona/` 通過；執行 `tsx apps/backend/src/persona/build-agent.ts` 產出檔案後，`docs/1-v0-mvp/build-agent-diff.md` 對 Include 清單 30 條逐條打勾
> **AC 對應**：AC-3.2（persona 語氣、不以「I'm Claude Code」開頭）

- [x] **Task 3.A.1**（S）：`build-agent.ts` 輸出結構測試 (Red) — 產出的 md 必含 YAML frontmatter 含 `name`、`description`、`tools`、body 含開頭自我定位 + workflow + 8 硬規標題等關鍵 anchors
- [x] **Task 3.A.2**（L）：`build-agent.ts` 實作 (Green) — 從專案根目錄的 `Claude-Design-Sys-Prompt.txt`（相對 `process.cwd()` 或 `path.resolve(__dirname, "../../../../Claude-Design-Sys-Prompt.txt")`）讀原文、按 ADR-005 Include 選段 + Add 段硬規、寫出 `.claude/agents/design-artifact.md`（專案 root，不是 `projects/<slug>/`，見 spec ADR-005 啟用機制）
- [x] **Task 3.A.3**（S）：產出實際 `.claude/agents/design-artifact.md` + commit 到版控
- [x] **Task 3.A.4**（S）：手動 diff 驗證 — 對 ADR-005 Include 30 條、Exclude 全列、Add 3 條環境 + 8 條硬規逐項 tick；不通過則回修 3.A.2
- [x] **Task 3.A.5**（S）：`list_files` 硬規 8 的 regression test — build-agent.ts 的 tool 描述中**不得**出現 "filter" 或 "offset" 字樣
- [x] **Task 3.A.5.1**（S）：裝 `husky` + `lint-staged`，pre-commit 檢查「修改的 build-agent.ts 輸出不含 'filter'/'offset' 字樣」的 regression（F1，round-4 推 M2 的 tooling 收口）
- [x] **Task 3.A.6**（S）：commit worktree `"M2/A: persona"`

---

**[B] MCP server** — `isolation: worktree`
> **範圍**：`apps/mcp-server/`、`.mcp.json`
> **依賴**：M0 (Task 1.7 mcp-tools.ts、Task 1.11 paths.ts)
> **介面契約**：spec §3.1-3.5（5 工具）、spec §4（`/internal/mcp-event` POST payload + X-Internal-Token header）
> **驗證方式**：`pnpm --filter mcp-server test` 全過；用 `@modelcontextprotocol/inspector` 以 stdio 連線 spawn 出的 mcp-server，手動測 5 工具 round-trip
> **AC 對應**：AC-3.5（write_file 落檔）、AC-4.1（show_to_user iframe）、AC-4.3/4.4/4.5（done error/timeout）、AC-8.3（path traversal + symlink 拒絕）

- [x] **Task 3.B.1**（S）：env bootstrap 測試 (Red) — 缺 `DH_INTERNAL_TOKEN` / `DH_WEB_PORT` / `DH_PROJECT_ROOT` / `DH_PROJECT_SLUG` 任一時 fail-fast
- [x] **Task 3.B.2**（S）：env bootstrap 實作 (Green)
- [x] **Task 3.B.3**（S）：HTTP callback client 測試 (Red) — 帶 X-Internal-Token、超時 5s、2× 退避重試（200ms）、最終失敗回 isError
- [x] **Task 3.B.4**（M）：HTTP callback client 實作 (Green)
- [x] **Task 3.B.5**（S）：`read_file` 測試 (Red) — happy path、`FILE_NOT_FOUND`、`PATH_TRAVERSAL`（`..`、絕對、symlink 跳脫——**handler 必須呼叫 `fs.realpathSync` 確認 resolved 路徑仍 `startsWith(projectRoot)` 後才讀**，paths.ts 只做字串級 guard、realpath 是 runtime 層責任）、`READ_ERROR`
- [x] **Task 3.B.6**（S）：`read_file` 實作 (Green)
- [x] **Task 3.B.7**（S）：`write_file` 測試 (Red) — happy、自動建中間目錄、覆寫、`CONTENT_TOO_LARGE` (>5MB)、`PATH_TRAVERSAL`（**含 realpath check**：寫入前 / 後 parent dir 必 resolve 到 projectRoot 內；寫入後的檔案亦不可為 symlink 跳脫）、`WRITE_ERROR`
- [x] **Task 3.B.8**（S）：`write_file` 實作 (Green)
- [x] **Task 3.B.9**（S）：`list_files` 測試 (Red) — depth 預設 1 / 上限 5、entries ≤ 1000 + `truncated`、name 字母序、`DIR_NOT_FOUND`、**realpath check**：目錄必須 resolve 到 projectRoot 內；列舉時若遇 symlink 指向外部則跳過不列
- [x] **Task 3.B.10**（S）：`list_files` 實作 (Green)
- [x] **Task 3.B.11**（S）：`show_to_user` 測試 (Red) — fire-and-forget（mock callback 必 fire、回應 `{ok:true}` 不等 UI）；`path` 輸入仍先過 `joinProject` + `realpathSync` check（路徑作為事件字串傳給 UI、不讀檔但仍要防 UI 載入跨 project 檔）
- [x] **Task 3.B.12**（S）：`show_to_user` 實作 (Green)
- [x] **Task 3.B.13**（M）：`done` 測試 (Red) — correlationId 由 mcp-server 用 `ulid()` **每次呼叫新生**（ADR-010）、POST callback 帶 `X-Internal-Token` header、等 backend 回應（block）、5s timeout → `{ok:false, timedOut:true, consoleErrors:[]}`、含 errors 陣列的成功路徑、`path` 經 realpath guard
- [x] **Task 3.B.14**（M）：`done` 實作 (Green)
- [x] **Task 3.B.15**（M）：stdio MCP transport + tools registry（MCP SDK `Server` + `StdioServerTransport`）
- [x] **Task 3.B.16**（S）：`.mcp.json` 範本 — `{mcpServers: {design_house: {command:"node", args:["./apps/mcp-server/dist/index.js"], env: {...}}}}`；env 值使用 `${DH_*}` 變數從 CC 繼承
- [x] **Task 3.B.17**（S）：commit worktree `"M2/B: mcp-server"`

---

**[C] Backend core** — `isolation: worktree`
> **範圍**：`apps/backend/src/` 除 `persona/`（在 [A]）外所有子目錄
> **依賴**：M0 shared types、M1 spike 結論（影響 spawner + parser）
> **介面契約**：spec §1 REST、spec §2 WS、spec §4 `/internal/mcp-event`、spec §5 SQLite schema
> **驗證方式**：`pnpm --filter backend test` 全過；`pnpm --filter backend dev` 啟動後手動用 `curl` 測 REST + `wscat` 測 WS（無前端即可驗證）
> **AC 對應**：AC-1.1/1.2/1.4、AC-2.1/2.3/2.4、AC-3.1 echo（chat-delta echo）、AC-3.3 streaming、AC-3.4 tool-start 事件、AC-5.1/5.2、AC-6.1/6.2/6.3、AC-7.1/7.2/7.3/7.4/7.5、AC-8.1/8.2

- [x] **Task 3.C.1**（S）：SQLite schema migration 測試 (Red) — 首次啟動時 **4 張 table** 建立（`projects` / `sessions` / `messages` / `raw_log`，見 spec §5）、WAL 模式、所有 index 存在
- [x] **Task 3.C.2**（M）：SQLite schema + `db/client.ts`（better-sqlite3 + WAL）實作 (Green)
- [x] **Task 3.C.3**（S）：Fastify bootstrap 測試 (Red) — 綁 `127.0.0.1:31823`、port 衝突時 EADDRINUSE fail-fast + 建議訊息、`PORT` env var override、啟動 ≤ 3s
- [x] **Task 3.C.4**（M）：Fastify bootstrap 實作 (Green) — 含 X-Internal-Token 啟動時 `crypto.randomBytes(32).toString("hex")` 生成
- [x] **Task 3.C.5**（S）：REST `/api/projects` CRUD 測試 (Red) — POST / GET list / GET one / DELETE；slug kebab-case + 碰撞 suffix
- [x] **Task 3.C.6**（M）：REST projects CRUD 實作 (Green)
- [x] **Task 3.C.7**（S）：首次啟動自動建 `untitled-<timestamp>` 專案測試 (Red)
- [x] **Task 3.C.8**（S）：自動專案實作 (Green)
- [x] **Task 3.C.9**（S）：REST `/api/projects/:slug/messages` 測試 (Red) — limit/before pagination、role filter
- [x] **Task 3.C.10**（S）：REST messages 實作 (Green)
- [x] **Task 3.C.11**（S）：REST `/api/projects/:slug/files` tree + 靜態 serve 檔案 測試 (Red) — 提供 iframe 讀取 HTML
- [x] **Task 3.C.12**（M）：REST files 實作 (Green) — path traversal guard 同 shared/paths
- [x] **Task 3.C.13**（S）：WS `/ws` subscribe / user-message / cancel / ping-pong 測試 (Red)
- [x] **Task 3.C.14**（M）：WS handler 實作 (Green) — 廣播 fs-change、chat-delta 等給對應 project 的訂閱者
- [x] **Task 3.C.15**（S）：`/internal/mcp-event` 拒非 127.0.0.1 + token 驗證 + 413 body limit 測試 (Red)
- [x] **Task 3.C.15.1**（S）：ADR-010 idempotency cache 三子 case Red test — (a) 遲到 ack（pending 已 timeout/TTL 清後 UI 才送 `done-ack`）→ log warn + drop 不重廣播；(b) TTL 60s eviction（進入 pending 60s 未被讀即清）；(c) 容量 1000 LRU（第 1001 筆淘汰最舊）（F7）
- [x] **Task 3.C.16**（M）：`/internal/mcp-event` handler + correlation tracking + 5s hold-for-ack 實作 (Green)
- [x] **Task 3.C.17**（S）：CC spawner 測試 (Red) — spawn 命令組裝必含 `--agent design-artifact --mcp-config ./.mcp.json --strict-mcp-config --output-format stream-json --verbose --max-turns 50`（ADR-002）；首輪無 `--resume`、後續 `--resume <id>`；env var 注入（`DH_INTERNAL_TOKEN` / `DH_WEB_PORT` / `DH_PROJECT_ROOT` / `DH_PROJECT_SLUG`）；120s timeout → SIGTERM；cancel 立即 SIGTERM。Red 階段以 stub fake-claude binary 測命令組裝；Green 再接真 CC。
- [x] **Task 3.C.18**（M）：CC spawner 實作 (Green) — 用真 CC CLI 驗收一次以確認 SIGTERM 行為（對齊 OQ-3c 殘留風險）
- [x] **Task 3.C.19**（S）：stream-parser 測試 (Red) — 顯式覆蓋 ADR-004 event table 所有列：`system.init`（擷取 session_id）、`rate_limit_event`（**skip 不廣播**）、`assistant.thinking`（**skip 不當 chat-delta**）、`assistant.text`（→ chat-delta）、`assistant.tool_use`（→ tool-start、`caller` 欄位 ignore）、`user.tool_result`（→ tool-result、`is_error` 傳遞、event-level `timestamp`/`tool_use_result` ignore）、`result.success`（→ turn-end complete）、`result.error_max_turns`（→ turn-end error + code `CC_MAX_TURNS`）、合成 `result.error_during_execution`（→ turn-end error + code `CC_EXECUTION_ERROR`）、未知 type（log warn + skip）、JSON parse 失敗（寫 `raw_log` table）
- [x] **Task 3.C.20**（M）：stream-parser 實作 (Green)
- [x] **Task 3.C.21**（S）：chokidar fs watcher 測試 (Red) — write/delete 廣播、rename dedupe（100ms 內 unlink+add）、watcher 異常 silent retry
- [x] **Task 3.C.22**（M）：chokidar watcher 實作 (Green)
- [x] **Task 3.C.23**（S）：sessions table orchestration 測試 (Red) — 首輪 spawn 無 `--resume`、**從任一 stream-json event 的 top-level `session_id` 擷取**（M1 spike 確認每個 event 都帶此欄位，不必等 system.init）、寫 DB、後續 `--resume <id>`；session 失效時清欄位重啟
- [x] **Task 3.C.24**（M）：session orchestration 實作 (Green)
- [x] **Task 3.C.25**（S）：CC health check at startup 測試 (Red) — `CC_NOT_INSTALLED`（PATH 無）、`CC_NOT_AUTHENTICATED`（捕 stderr 已知字串）；皆回 UI-ready error
- [x] **Task 3.C.26**（S）：CC health check 實作 (Green)
- [x] **Task 3.C.27**（S）：chat-delta chunking 測試 (Red) — 單則 delta > 64KB 時切 ≤ 16KB WS frame
- [x] **Task 3.C.28**（S）：chunking 實作 (Green)
- [x] **Task 3.C.29**（S）：`TURN_ALREADY_ACTIVE` 保護測試 (Red) — 使用者在 turn 進行中又送訊息 → 拒絕
- [x] **Task 3.C.30**（S）：turn single-flight 實作 (Green)
- [x] **Task 3.C.31**（S）：commit worktree `"M2/C: backend core"`

---

**[D] Frontend shell** — `isolation: worktree`
> **範圍**：`apps/frontend/`
> **依賴**：M0 shared types（events schema）
> **介面契約**：spec §1 REST、spec §2 WS、 spec §3 各工具的事件流
> **驗證方式**：`pnpm --filter frontend test` 全過；`pnpm --filter frontend dev` 手動測三欄渲染 + 主要互動（需配合 backend 真跑 — 整合在 M3）
> **AC 對應**：AC-1.3、AC-2.2 UI、AC-3.0 Understand UI（觸發時機）、AC-3.1 busy indicator、AC-3.3 streaming 顯示、AC-3.4 tool 事件顯示、AC-4.2 iframe load+3s collect、AC-4.6/4.7 summary 顯示、AC-6.1 瀏覽器重開還原

- [x] **Task 3.D.1**（M）：Vite + React 18 + TS + Tailwind + shadcn/ui 初始化（scaffold-only；commit `"M2/D: vite+shadcn scaffold"`）
- [x] **Task 3.D.2**（S）：API client 測試 (Red) — typed fetch wrapper for `/api/projects*` + `/api/projects/:slug/*`
- [x] **Task 3.D.3**（S）：API client 實作 (Green)
- [x] **Task 3.D.4**（S）：`use-ws` hook 測試 (Red) — subscribe on mount、reconnect with exponential backoff、30s ping、discriminated union dispatch
- [x] **Task 3.D.5**（M）：`use-ws` 實作 (Green)
- [x] **Task 3.D.6**（S）：`use-project` hook 測試 (Red) — project list、current project、switch、new、delete
- [x] **Task 3.D.7**（S）：`use-project` 實作 (Green)
- [x] **Task 3.D.8**（S）：Chat panel 測試 (Red) — input + send（AC-3.1 busy state 500ms）、chat-delta streaming 渲染、tool-start/tool-result 顯示（AC-3.4 摘要 ≤ 200 chars）、cancel button
- [x] **Task 3.D.9**（M）：Chat panel 實作 (Green)
- [x] **Task 3.D.10**（S）：FileTree panel 測試 (Red) — GET files 初始載入、fs-change 增量更新、點檔 → trigger preview navigate
- [x] **Task 3.D.11**（S）：FileTree panel 實作 (Green)
- [x] **Task 3.D.12**（S）：Preview panel 測試 (Red) — iframe navigate on show_to_user、done-request 時 iframe.load → 3s 視窗內收集 `window.onerror` + `console.error` → 送 done-ack（含 correlationId）；見 spec §4.1 條 5：done-request 與使用者手動導航衝突時仍須服從 request path
- [x] **Task 3.D.12.1**（S）：`use-ws` regression — Vite HMR 期間 WS 斷線 → 重連後若有 in-flight `done-request` 尚未 ack，UI 必須**重新送 ack**（backend 的 ADR-010 idempotency cache 會 dedupe）；或已 timeout 則 log + drop（F4）
- [ ] **Task 3.D.13**（M）：Preview panel 實作 (Green) — iframe 以 `src="/api/projects/:slug/files/:path"` 載入（same-origin 於 UI）+ `sandbox="allow-scripts allow-same-origin"`（見 spec §4.1）。Hook 掛載範例：
  ```tsx
  // 每次 src 變更 → iframe 重新載入 → onLoad 觸發 → 重掛 hooks
  <iframe ref={iframeRef} onLoad={() => {
    const win = iframeRef.current?.contentWindow; if (!win) return;
    const errs: string[] = [];
    // 'error' listener 較 robust：artifact 腳本無法覆寫 addEventListener 內部註冊
    win.addEventListener("error", (e: ErrorEvent) => {
      errs.push(`${e.message} (${e.filename}:${e.lineno}:${e.colno})`);
    });
    // console.error 監聽（以 defineProperty 包一層；若 artifact 後來再覆寫，至少前 3s 窗捕捉有效）
    const origErr = win.console.error.bind(win.console);
    win.console.error = (...args: unknown[]) => {
      errs.push(args.map(String).join(" "));
      origErr(...args);
    };
    errsRef.current = errs;  // 供 done-ack 取用
  }} />
  ```
  - **必須 per-load 重新 attach**（iframe src 變更觸發 load）；不可一次 attach 終身
  - **artifact 後覆寫 console** 的風險：用 `addEventListener('error', …)` 主要抓 uncaught exceptions；`console.error` 封裝只在 3s 收集窗期間必要
  - load 超過 **5s 未觸發** → ack `{loaded:false, consoleErrors:[]}` 並顯示 fallback 訊息（計入 AC-4.5 timeout 分支）
  - done-request 收到時，記下 start 時戳、等 onLoad、load 後繼續收 3s 內的 error，視窗結束 flush `done-ack{correlationId, loaded:true, consoleErrors}`
- [x] **Task 3.D.14**（S）：App.tsx 三欄 layout 測試 (Red) — 佈局結構、project switcher 位置
- [x] **Task 3.D.15**（S）：App.tsx 實作 (Green) — shadcn `Resizable` 三欄 + 頂部 project switcher + error toast
- [x] **Task 3.D.16**（S）：Bootstrap `pnpm dev` 自動開啟瀏覽器（concurrently / open）— 對應 AC-1.3「瀏覽器打開 → ≤ 3s 顯示」
- [x] **Task 3.D.17**（S）：commit worktree `"M2/D: frontend shell"`

---

### 🔗 M2 匯合點

> **驗證方式**：四個 worktree merge 回 main feat branch 後，`pnpm -r build` + `pnpm -r test` 全過

- [x] **Task 3.Z.1**（S）：合併 [A] 分支到 `feat/1-v0-mvp` — **N/A**：序列派發（env 無 worktree），直接 in-place 作業於 feat/1-v0-mvp，已 commit `b8dc09a`
- [x] **Task 3.Z.2**（S）：合併 [B] 分支 — **N/A**：commit 於 `12e1a33`（M2/B）
- [x] **Task 3.Z.3**（S）：合併 [C] 分支 — **N/A**：commit 於 `M2/C`
- [x] **Task 3.Z.4**（S）：合併 [D] 分支 — **N/A**：commit 於 `M2/D`
- [ ] **Task 3.Z.4.1**（S）：Windows-specific quirks 檢查 — **延到 M3**（v0 實測未遇到真實阻塞、deferred 至 M3 Task 4.0 附近一起審）
- [x] **Task 3.Z.5**（S）：`pnpm -r test` = 466 passed / 0 failed（shared 192 + mcp-server 48 + backend 145 + frontend 81）；`pnpm -r build` 4/4 綠；`pnpm -r typecheck` 4/4 綠
- [ ] **Task 3.Z.5.1**（S）：M2 worker FAIL playbook — **延到 M3**（v0 實際 4 個 worker 全無 FAIL、無需實戰 playbook，文件化延後）
- [x] **Task 3.Z.6**（S）：commit `"M2: merge all workstreams"` — 即本 commit

---

## Milestone 4 (M3): 整合 + E2E smoke + AC 驗收

> **預期結果**：完整使用者流程跑得通，spec 34 條 AC 全數勾掉
> **驗證方式**：Playwright smoke 通過 + 人工走 AC checklist
> **AC 對應**：全部 — 這個 milestone 是收口
> **完工 DoD**：
> - 真 CC CLI spawn 起來產出可預覽的 HTML（AC-3.5 + AC-4.2 + AC-4.3）
> - 跨 session 持久化驗證（AC-6.1 + AC-6.2）
> - 錯誤場景人工觸發（AC-7.1/7.2/7.3/7.4/7.5）
> - `docs/1-v0-mvp/works.md` 寫入 M0-M3 實作筆記 + 已知限制

### Tasks

- [ ] **Task 4.0**（S）：Clock drift / tz pagination 審查 — 確認 ULID 時間序與 SQLite `created_at` ISO 8601 在使用者改系統時間時的行為；`/api/projects/:slug/messages?before=` cursor 若遇到跳躍是否 graceful（F3）
- [ ] **Task 4.1**（M）：真 CC CLI 煙霧測 — 執行 `pnpm dev` → 瀏覽器開 127.0.0.1:31823 → 發 "Make a simple hello-world landing page with a blue button" → 預期 CC 先問 2-5 題（AC-3.0 Understand 觸發）→ 回答後 CC write_file + done → iframe 顯示 → 無 console error
- [ ] **Task 4.2**（S）：若 4.1 觸發 console error，驗證 AC-4.6 auto-fix loop — 手動注入一個壞 artifact，觀察 CC 是否自動 fix 後再叫 done（上限 3 次）
- [ ] **Task 4.3**（S）：Session 持久化測試 — 關瀏覽器 → 重開 → 確認對話、檔案、專案清單全存在（AC-6.1）
- [ ] **Task 4.4**（S）：Backend 重啟持久化測試 — 關 backend → 重啟 → 確認同上（AC-6.2）
- [ ] **Task 4.5**（S）：錯誤場景測試 — 手動 rename `claude` binary（或 PATH 移除）重啟 backend，確認 UI 顯示安裝指引（AC-7.1）
- [ ] **Task 4.6**（S）：Port 衝突測試 — 另開一個服務占 31823，確認 backend fail-fast + 建議訊息（AC-7.5）
- [x] **Task 4.7**（M）：Playwright smoke 腳本測試 (Red) — 自動化覆蓋以下 AC：AC-1.1（port 啟動）、AC-1.2（僅綁 127.0.0.1，用 `netstat`/`ss` assert）、AC-1.3（三欄 ≤ 3s 渲染）、AC-2.1（首次預設專案）、AC-3.1（busy indicator 500ms）、AC-3.3（≥ 2 個 chat-delta event）、AC-3.5（write_file 後 file tree 更新）、AC-4.1（show_to_user iframe navigate）、AC-6.1（關頁重開還原）、AC-7.5（port 衝突 fail-fast，另起一 server 佔 31823 後啟動主 backend assert exit code ≠ 0）
- [x] **Task 4.8**（M）：Playwright smoke 實作 (Green) — 含 `pnpm install -D @playwright/test` + `playwright install chromium`、跑 `pnpm test:e2e` 綠燈
- [ ] **Task 4.9**（M）：**自動化 + 人工雙軌 AC 驗收**
  - 自動部分：`pnpm test:e2e` 全綠視為自動 AC（Task 4.7 列出的 10 條）自動 tick
  - **Parser skip 行為（unit test 層）**：驗 Task 3.C.19-20 產出的 parser unit test 涵蓋 `rate_limit_event` / `thinking` / `tool_use.caller` / `error_max_turns` / `raw_log` 寫入等列，作為 ADR-004 隱性 AC 的替代
  - 人工部分：剩餘 AC 必須人工確認 — AC-3.0（Understand 發問邏輯，Playwright 難判斷語意）、AC-3.2（persona 語氣字串檢查）、AC-3.4（tool 摘要格式）、AC-4.2/4.3/4.4/4.5（console error 收集 + timeout 的 5s 窗很脆弱，自動測易 flaky，建議人工搭配 Task 4.2 人工情境 + Task 4.3/4.4）、AC-4.6（auto-fix loop 要真 CC）、AC-4.7（summary 字數人工看）、AC-5.1/5.2（--resume 跨 turn 要實測）、AC-6.2/6.3（backend 重啟 + messages 讀回）、AC-7.1/7.2/7.3/7.4（錯誤情境手動觸發，見 Task 4.5）、AC-8.1/8.2/8.3（安全要實驗驗證）
  - 在 tasks.md 或 works.md 結尾附 AC ✓/✗ 表（全部 34 條），標記「自動」或「人工」；任一 ✗ 回溯修正
- [ ] **Task 4.10**（S）：`docs/1-v0-mvp/works.md` 撰寫 — 實作決策、已知限制、延到 v1+ 的項目
- [ ] **Task 4.11**（S）：`README.md` 撰寫 — 如何跑（`pnpm install` → `pnpm dev` → 瀏覽器）、系統前提（Node ≥ 20、已安裝並登入 `claude` CLI、Windows build tools for better-sqlite3）、疑難排解
- [ ] **Task 4.12**（S）：commit `"M3: e2e smoke + AC 驗收"`，準備交棒 `/ddd.xreview`

---

## AC 覆蓋總表（初版，實作完成後由 Task 4.9 驗證）

| AC | 覆蓋 task |
|---|---|
| AC-1.1 port 綁定 5s | 3.C.3/3.C.4、4.6 |
| AC-1.2 127.0.0.1 only | 3.C.3/3.C.4 |
| AC-1.3 三欄 ≤ 3s | 3.D.14-16、4.1 |
| AC-1.4 SQLite 自動初始化 | 1.8/1.9、3.C.1/3.C.2 |
| AC-2.1 首次建預設專案 | 3.C.7/3.C.8 |
| AC-2.2 切換/新增/刪除 UI | 3.C.5/3.C.6 + 3.D.6/3.D.7 + 3.D.14 |
| AC-2.3 新增創建資料夾 | 3.C.5/3.C.6 |
| AC-2.4 slug kebab + suffix | 3.C.5/3.C.6 |
| AC-3.0 Understand 發問紅線 | 3.A.2（persona 規則 2）、4.1 手驗 |
| AC-3.1 busy indicator 500ms | 3.D.8/3.D.9、4.1 |
| AC-3.2 persona 語氣 | 3.A.2/3.A.4、4.1 |
| AC-3.3 streaming 逐段 | 3.C.19/3.C.20 + 3.D.8/3.D.9、4.1 |
| AC-3.4 tool 事件顯示 | 3.D.8/3.D.9 |
| AC-3.5 write_file 落檔 + tree 刷新 | 3.B.7/3.B.8 + 3.C.21/3.C.22 + 3.D.10/3.D.11 |
| AC-4.1 show_to_user iframe | 3.B.11/3.B.12 + 3.D.12/3.D.13 |
| AC-4.2 done 3s console collect | 3.D.12/3.D.13 |
| AC-4.3 done clean | 3.B.13/3.B.14、4.1 |
| AC-4.4 done with errors | 3.B.13/3.B.14、4.2 |
| AC-4.5 UI 5s timeout | 3.B.13/3.B.14 + 3.C.15/3.C.16 |
| AC-4.6 auto-fix loop | 3.A.2（硬規 3）、4.2 |
| AC-4.7 summary ≤ 500 | 3.A.2（硬規在 persona）、4.1 |
| AC-5.1 --resume context | 3.C.23/3.C.24、2.1（spike 前置驗證）|
| AC-5.2 sessions table | 3.C.1/3.C.2 + 3.C.23/3.C.24 |
| AC-6.1 瀏覽器重開還原 | 3.C.9/3.C.10 + 3.D.6/3.D.7、4.3 |
| AC-6.2 backend 重啟還原 | 3.C.1/3.C.2、4.4 |
| AC-6.3 messages 可讀回 | 3.C.9/3.C.10 |
| AC-7.1 CC 未安裝 | 3.C.25/3.C.26、4.5 |
| AC-7.2 CC 未登入 | 3.C.25/3.C.26 |
| AC-7.3 CC > 120s timeout | 3.C.17/3.C.18 |
| AC-7.4 使用者 cancel | 3.C.17/3.C.18 + 3.D.8/3.D.9 |
| AC-7.5 port 佔用 fail-fast | 3.C.3/3.C.4、4.6 |
| AC-8.1 /internal 拒外部 | 3.C.15/3.C.16 |
| AC-8.2 X-Internal-Token | 3.C.3/3.C.4 + 3.C.15/3.C.16 + 3.B.3/3.B.4 |
| AC-8.3 path traversal | 1.10/1.11 + 3.B.5-10 |

---

## 下一步

使用者確認 tasks.md 後，進 `/ddd.work` — coordinator 模式會自動辨識 M2 的 🔀 平行工作線，可選擇單 session 序列或派發 ddd-developer subagent 平行推進。建議工作流程：

1. M0 → 序列、手動跑
2. M1 → 序列、手動跑（spike 需要實機測）
3. M2 → coordinator 派 4 個 ddd-developer agent worktree 平行
4. M2 merge → coordinator 在 main 分支收斂
5. M3 → 序列、手動 + Playwright
6. 最後 `/ddd.xreview` 做 cross review + commit
