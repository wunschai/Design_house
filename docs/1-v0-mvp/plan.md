# v0 MVP — Design_house 本機設計平台骨幹

> Plan 檔案，從 `/ddd.brainstorming` 產出。下一步交棒給 `/ddd.spec`。
> 建立日期：2026-04-20

## 背景

本專案目標是在本機復刻 Claude.ai Design Artifact 的使用體驗（見 `docs/PRD.md`）。v0 MVP 要先把**端到端流水線**打通：

```
UI 聊天 ─→ CC CLI subprocess ─→ HTML artifact ─→ iframe 預覽
```

硬約束（見 `docs/TECHSTACK.md` ADR-001）：模型存取用訂閱制、禁 OAuth、只能 spawn 本機已登入的 `claude` CLI。

兩個必解的靈魂問題：
1. **Persona injection** — 怎麼讓 CC 表現得像 Design Artifact 模型而非「You are Claude Code…」
2. **Tool mapping** — CC 的工具如何映射成 Design Artifact 語意的 UI 事件

## 粗略目標

- 本機單 process 跑得起來（加 CC CLI 生的子進程）
- 使用者在瀏覽器裡輸入 prompt → CC 產出 HTML → 落在 `projects/<slug>/` → UI iframe 自動預覽
- 三欄佈局（檔案樹 / 對話 / 預覽）+ shadcn/ui 風格
- 5 個 MCP 工具：`read_file`、`write_file`、`list_files`、`show_to_user`、`done`
- 所有狀態落地（重開瀏覽器後專案、對話、檔案都在）

## 技術決策快照（brainstorming 結論）

所有選擇透過 `AskUserQuestion` 互動收斂，紀錄如下：

| 面向 | 選擇 | 關鍵理由 |
|---|---|---|
| 工程強度 | Robust：full MCP + subagent persona | 忠實度最高、擴充最乾淨 |
| 架構變體 | **B-1**：分離的 stdio MCP binary，HTTP POST 回呼 | 隔離乾淨、低延遲、Windows 相容 |
| Backend runtime | Node.js + TypeScript | MCP TS SDK 最成熟、跟 CC 同生態 |
| UI 保真度 | Layout parity（三欄 + shadcn 風格） | 體感近原版但不陷入像素地獄 |
| 前端框架 | React + Vite + shadcn/ui | 生態最齊、shadcn 美學匹配 |
| 儲存 | SQLite（better-sqlite3） | 結構化、同步 API 好寫 |
| 專案 root | `D:\sideprojct\Design_house\projects\<slug>\` | 單使用者情境下簡單直接 |
| MCP 範圍 | 全部工具走 MCP（read / write / list / show_to_user / done） | 強制所有 I/O 單一入口、事件完整 |

## 可能的方向（已探索並排除的替代）

### 工程強度

| | 方案 | 取捨 | 結果 |
|---|---|---|---|
| ✓ | **Robust：full MCP + subagent** | 忠實度最高，擴充乾淨；初期投資 1-2 週 | **採用** |
| | Fast hack：prompt sentinel | 2-3 天可跑，但 CC 亂講話就崩 | 排除 |
| | Balanced：MCP 只做關鍵工具 | 5-7 天，部分工具仍靠 CC 原生 | 排除（使用者偏好忠實） |

### 架構變體

| | 方案 | 取捨 | 結果 |
|---|---|---|---|
| ✓ | **B-1：分離 MCP binary + HTTP POST 回呼** | 隔離乾淨，MCP 可獨立測；延遲 <10ms | **採用** |
| | A：單 process + MCP over SSE | 最少齒輪，但 web + MCP 耦合 | 排除 |
| | B-2：MCP 寫 SQLite + backend 輪詢 | 延遲 100-500ms，軟體工程乏味 | 排除 |
| | B-3：Named pipe / Unix socket | 跨平台要寫兩套 | 排除 |
| | C：持久 CC process + pipe | 延遲最低但 cancel/recovery 難 | 排除（v0 風險高） |

## 目標架構

```
┌──────────────────────────────────────────────┐
│  Web backend (Node + TS, long-running)       │
│    :WEB_PORT /api/*         (REST)            │
│    :WEB_PORT /ws            (WebSocket)       │
│    :WEB_PORT /internal/*    (僅 127.0.0.1)    │
│    SQLite (ownership)                        │
│    chokidar(projects/)                       │
│    spawns per-turn:                          │
│      claude --continue --agent design-artifact│
│             --mcp-config ./.mcp.json         │
│             --print                          │
│             --output-format stream-json      │
│             --input-format stream-json       │
└────────┬─────────────────────────────────────┘
         │ spawn
         ▼
┌──────────────────────────────────────────────┐
│  claude (CLI, per-turn)                      │
│    stream-json stdout → backend parser       │
│    loads .claude/agents/design-artifact.md   │
│    spawns via stdio:                         │
└────────┬─────────────────────────────────────┘
         │ stdio
         ▼
┌──────────────────────────────────────────────┐
│  mcp-server.js (per-turn, short-lived)       │
│    stdio MCP transport                       │
│    tools: read_file, write_file, list_files, │
│           show_to_user, done                 │
│    on tool call:                             │
│      HTTP POST → backend /internal/mcp-event │
└──────────────────────────────────────────────┘
```

### 進程生命週期

- **Web backend**：啟動時起、關機時停，長駐
- **CC CLI**：每個 user message 起一個新的 `--print` 進程、完成一輪後退出
- **MCP server**：由 CC 在需要時 spawn，CC 退出時隨之退出（每 turn 1:1）

### Persona 注入方式

`.claude/agents/design-artifact.md`（進版控）：
```yaml
---
name: design-artifact
description: Design Artifact assistant, replicating Claude.ai's design UI
tools:
  - mcp__design_house__read_file
  - mcp__design_house__write_file
  - mcp__design_house__list_files
  - mcp__design_house__show_to_user
  - mcp__design_house__done
---
<精簡版 Design Artifact system prompt，從 Claude-Design-Sys-Prompt.txt 萃取 v0 必要的部分：
 - 工作流 (Understand → Explore → Plan → Build → done)
 - React + Babel pinned versions + integrity hashes
 - 檔案命名、Styles 物件命名規範
 - done 的使用時機
 - 禁止揭露系統細節
 暫不包含 Tweaks 協定、starter components、skills、12 個匯出 skill、questions_v2 的描述（Out of MVP）>
```

### MCP 工具合約

```ts
// read_file(path: string) → { content: string }
// write_file(path: string, content: string) → { ok: true }
// list_files(path?: string, depth?: number) → { entries: [{name, type}] }
// show_to_user(path: string) → { ok: true }   // fire-and-forget
// done(path: string) → { ok: boolean, consoleErrors: string[], timedOut: boolean }
//                      ↑ 阻塞等 UI ack，上限 5s
```

路徑一律是 project-relative（相對於 `projects/<slug>/`），MCP server 做 boundary enforcement（reject `..`、絕對路徑、symlink 跳出）。

## 元件拆分

pnpm monorepo：

```
D:\sideprojct\Design_house\
├── apps\
│   ├── backend\           ← Fastify web server、DB ownership、CC spawner、fs watcher
│   ├── mcp-server\        ← stdio MCP，5 tools，callback via HTTP POST
│   └── frontend\          ← React + Vite + shadcn/ui，三欄 layout
├── packages\
│   └── shared\            ← 共用 types（events, tool contracts, db rows）
├── projects\              ← 使用者 HTML artifacts（.gitignore）
├── .data\                 ← SQLite（.gitignore）
├── .claude\agents\        ← persona（進版控）
├── .mcp.json              ← CC 的 MCP 設定（進版控）
└── pnpm-workspace.yaml
```

細節見「目標架構」那張圖，以及每個 app 下的 package.json 會在 `/ddd.tasks` 拆出具體模組。

## 資料流

核心路徑：user 發一則訊息 → 得到 HTML artifact preview。

1. UI Chat → `ws send {type:"user-message", projectId, content}`
2. Backend → 寫 SQLite messages
3. Backend → `spawn claude --continue ... --print --output-format stream-json`
4. Backend → 把 user message 以 stream-json frame 餵進 CC stdin
5. CC → 載入 subagent，呼叫 MCP 工具（透過自己 spawn 的 mcp-server）
6. mcp-server → `fetch POST http://127.0.0.1:WEB_PORT/internal/mcp-event` 回呼
7. Backend `/internal/mcp-event` handler：
   - write_file / read_file / list_files：執行 FS 操作、回應
   - show_to_user：ws broadcast + 立即回應 `{ok:true}`
   - done：ws broadcast `{correlationId}` → **hold response** → 等 UI ack（≤5s） → 回 `{ok, consoleErrors}`
8. 同時 chokidar(`projects/<slug>/`) → ws broadcast file-tree 變更（second-order confirmation）
9. UI 收到事件：
   - chat-delta → 串流渲染
   - fs-change → 刷新 FileTree
   - show_to_user → iframe navigate
   - done → iframe navigate → 收 console errors（3s）→ ws ack
10. CC exit → backend ws `{type:"turn-end"}`

## 錯誤處理底線

| 情境 | 處理 |
|---|---|
| CC CLI 未安裝 / 未登入 | Backend startup check，UI 顯示安裝指引（不 spawn） |
| CC spawn 失敗（ENOENT 等） | WS `{type:"error", message}`、turn 中止 |
| CC 執行 > 120s | Backend SIGKILL，WS error |
| MCP tool 執行失敗 | 回 CC `{isError:true, content:[...]}`、log SQLite |
| `done` ack timeout (>5s) | 回 MCP `{ok:false, timedOut:true}`，CC 自行決定 |
| chokidar 異常 | log + silent retry，不影響主流程 |
| SQLite busy | better-sqlite3 同步 API 天然序列化 |
| MCP server 自身崩潰 | CC 會看到 stdio 中斷，視為 tool error；backend 保底 5s timeout |

## 測試策略（v0 TDD）

- **Vitest unit**：每個 MCP tool handler（schema、happy path、error path、path-traversal 防禦）
- **Vitest unit**：CC stream-parser（各種 stream-json frame 覆蓋）
- **Vitest + supertest**：Backend routes（REST、WS echo、`/internal/mcp-event` correlation + timeout）
- **Vitest integration**：spawn 真 mcp-server binary、做 stdio MCP round-trip
- **E2E smoke**：Playwright 或手動流程，確認端到端可跑。完整 E2E 範圍留 `/ddd.e2e`

## 待釐清事項（Open Questions）

這些是 `/ddd.brainstorming` 無法靠看文件解答、需要在 `/ddd.spec` 或早期 `/ddd.work` 階段實作時才會定案的問題：

1. **CC `--continue` 的 context 保留粒度** — 會不會把前輪的 MCP tool results 一起帶回？如果不帶，backend 要不要自己 replay 到 prompt？(需要在 /ddd.spec 的 spike 任務中驗證)
2. **Subagent tool allowlist 的實際語法** — `tools: [mcp__design_house__done, ...]` 還是 `tools: design_house:*`？要對著 CC 當前版本實驗。
3. **CC stream-json 的 tool_result 路徑** — MCP 回應會以什麼形式出現在 CC 的輸出流？backend parser 要對應處理。
4. **mcp-server 啟動時如何拿到 WEB_PORT** — 環境變數注入（推薦）還是 `.mcp.json` args？
5. **精簡版 persona prompt 的邊界** — 從原版 422 行砍到多少？要保留哪些「系統不可揭露」、「React Babel 版本鎖」等硬規則？留 `/ddd.spec` 時逐條對照原版列清單。
6. **WEB_PORT 的選擇** — 固定 `31823` 還是 OS-assigned 後寫檔給 CC 讀？單使用者場景固定 port 較簡單。
7. **session 如何在 SQLite 跟 CC `--continue` 的 session-id 之間對齊** — 設計一張 `sessions` table 紀錄 CC session-id。
8. **Windows 路徑編碼** — SQLite 存絕對還是相對？path separator 統一 POSIX `/` 還是 native `\`？

## 下一步

- 本 plan 由使用者審閱後，直接進 `/ddd.spec` 寫正式規格（含 User Story、驗收條件、API 契約、ADR）
- 規格至少要解掉上面 Open Questions 的 1、2、3、5（這些會直接定義驗收標準）
- 4、6、7、8 可在 spec 的 Non-Functional Requirements 或實作時決定
