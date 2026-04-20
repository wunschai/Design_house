# TECHSTACK — Design_house

> Technical decisions, ADRs, and dependencies. Updated by DDD coordinator only.
> Last revision: 2026-04-20

## Architecture Overview

```
┌───────────────────────────────────────────────────────────────┐
│  Browser (localhost:<port>)                                   │
│  ┌────────────┐  ┌──────────────┐  ┌────────────────┐         │
│  │ File tree  │  │ Chat column  │  │ iframe preview │         │
│  │            │  │              │  │  ↳ postMessage │         │
│  │            │  │              │  │  ↳ mentioned-  │         │
│  │            │  │              │  │    element     │         │
│  └────────────┘  └──────────────┘  └────────┬───────┘         │
└───────────────────────────────────────────────┼───────────────┘
                 │ HTTP / WebSocket              │ postMessage
                 │ (localhost only)              │ bridge
┌────────────────┴───────────────────────────────┴──────────────┐
│  Local server (single process)                                │
│  ┌─────────────┐ ┌──────────────┐ ┌───────────────────────┐   │
│  │ HTTP/WS API │ │ Project FS   │ │ Persona injector      │   │
│  │             │ │ sandbox      │ │  ↳ Design Artifact    │   │
│  │             │ │              │ │    system prompt      │   │
│  └─────────────┘ └──────────────┘ └───────────┬───────────┘   │
│  ┌──────────────────────────────────────────────┴──────────┐  │
│  │ Tool mapping layer                                      │  │
│  │  CC tool calls  ⇄  Design Artifact tool semantics       │  │
│  │  (show_to_user, done, fork_verifier_agent, skills, ...) │  │
│  └────────────────────────┬────────────────────────────────┘  │
│  ┌────────────────────────┴────────────────────────────────┐  │
│  │ CC CLI dispatch (spawn / stdin / parse stdout)          │  │
│  └────────────────────────┬────────────────────────────────┘  │
└──────────────────────────────┼────────────────────────────────┘
                               │ subprocess
                               ▼
                    ┌─────────────────────┐
                    │  claude CLI process │
                    │  (pre-authenticated │
                    │   subscription)     │
                    └─────────────────────┘
```

**一個 process**、**一個 localhost 埠**、**一個使用者**、**一個已登入的外部 CLI**。所有狀態落在本機檔案系統。

**兩條關鍵中介層**（`/ddd.brainstorming` 要定型）：
- **Persona injector** — 把 Design Artifact 的 system prompt（422 行原始文件的知識）灌進 CC CLI，使 CC 表現得像設計模型而非「You are Claude Code…」。
- **Tool mapping layer** — CC CLI 只會調用自己那組工具（Read/Write/Edit/Bash/…）；我們需要把這些翻譯成 UI 能理解的 Design Artifact 語意（`show_to_user`、`done`、`fork_verifier_agent`、`invoke_skill`、`register_assets`、…）。

## Stack — Committed

| 層級 | 選擇 | 備註 |
|---|---|---|
| Platform | Windows 11 local | 主要開發機器 |
| AI backend | `claude` CLI subprocess | 已安裝、已登入；我們不處理 auth |
| Network binding | `127.0.0.1` only | 不對 LAN 或公網 |

## Stack — TBD（`/ddd.brainstorming` 決策）

### 架構靈魂問題（最高優先）

| 層級 | 候選 | 決策指標 |
|---|---|---|
| **Persona injection**（讓 CC 扮演 Design Artifact 模型） | a) `--append-system-prompt` 塞整份原始 prompt · b) 包成 Claude Code subagent · c) 每輪 user 訊息前綴 prompt 摘要 · d) custom skill · e) MCP server resource | 忠實度、token 成本、升級 CC 時的穩定性 |
| **Tool mapping**（CC 工具 ⇄ Design Artifact 工具） | a) 純 prompt 約定（要求 CC 輸出 `<tool name="done" path="…"/>` sentinel，後端 parse）· b) 自建 **MCP server** 把 `done` / `fork_verifier_agent` / `invoke_skill` / `register_assets` 等工具暴露給 CC · c) SDK / agent-mode 攔截 tool calls | 可靠性、CC 亂講話的容錯、工具新增成本 |
| **iframe ↔ CLI 通訊迴圈** | a) Browser → WS → server → CLI stdin · b) server 維持 resumable CC session · c) 每個事件起一個新 `claude --print` | mentioned-element / Tweaks 編輯事件的延遲、session context 保留 |
| **Verifier subagent 架構** | a) 另起一個 CC 進程跑驗證 · b) 同 session 用 Task subagent · c) 獨立 headless iframe + 純 JS 規則 | 驗證隔離性、context 污染、rate-limit |

### 選型（次高優先）

| 層級 | 候選 | 決策指標 |
|---|---|---|
| Backend runtime | Node.js (Bun) / Node.js (tsx) / Deno / Python (FastAPI) / Go | CLI 生態、subprocess 控制、啟動速度 |
| Frontend | React + Vite / Svelte / Solid / vanilla ES modules | 體積、開發速度、iframe 整合難度 |
| 前後端通訊 | REST + SSE / WebSocket / tRPC | 串流 AI 回覆的模式 |
| Chat / metadata 儲存 | SQLite / 檔案 JSON / IndexedDB | 跨 session 持久化 + 檢索 |
| 專案檔案根目錄 convention | `%USERPROFILE%/Design_house/projects/<id>/` 或專案內 | Windows 路徑、權限 |
| CC CLI 呼叫模式 | `claude --print` / 持續 stdin / JSON-RPC | 延遲、tool-use 相容性 |
| 測試 | Vitest / Jest / Playwright | 依前後端選擇 |
| 打包 | `npm run dev` / Electron / Tauri | v0 用最簡單的 |

## Dependencies — Known

- `claude` CLI（系統已裝，作為 external binary 依賴）
- DDD workflow plugin（`applepig/ddd-workflow`，user scope 已裝）

## Dependencies — TBD

依照 `/ddd.brainstorming` 的技術選擇結果產生 `package.json` / `pyproject.toml`。

---

## ADRs

### ADR-001 — 模型存取禁用 OAuth

**Status:** Accepted · 2026-04-20 · **硬性不可違反**

**Context.**
Claude.ai Design 平台在雲端代使用者呼叫模型。本地復刻需要有對應機制。最直觀的作法是實作 Anthropic OAuth「Login with Claude」流程，以讓應用代表使用者消費訂閱配額。

**Decision.**
本應用**絕不**實作、發起或代理 OAuth 流程對 Anthropic 進行身份驗證。模型呼叫**只透過** spawn 使用者本機已安裝、已登入的 `claude` CLI subprocess 完成。

**Consequences.**
- ✅ 程式碼沒有 auth 表面：不存 token、不刷新、不洩漏。
- ✅ 寄生於 CLI 的既有 session 管理。
- ✅ 升級模型 / 加新能力 ≈ 升級 CLI 版本。
- ⚠️ CLI 必須已裝、已登入，這是環境前提而非我們 provision 的責任。
- ⚠️ 我們拿不到比 CLI 提供更低層的能力（例如自訂 system prompt、streaming 格式、tool-use schema 要看 CLI 給到哪）。
- ⚠️ 我們吃 CLI 的 rate limit。

**Rationale.**
使用者明確表示：在其訂閱上實作 OAuth 流程會或已經導致帳號被封鎖。這是不可協商的紅線。

**Alternatives rejected.**
- 直接用 `ANTHROPIC_API_KEY`：繞過訂閱、要額外付費，使用者明確不要。
- BYO key（使用者自帶 key）：同上，且使用者 A5 明確否決。
- Bedrock / Vertex gateway：需要企業帳號，非使用者情境。
- 反向工程 Claude.ai web session：帳號風險最高、最不穩定。

---

### ADR-template（後續 ADR 依此格式）

```
### ADR-NNN — <title>
**Status:** <Proposed | Accepted | Superseded by ADR-XXX> · <date>
**Context.** ...
**Decision.** ...
**Consequences.** ...
**Rationale.** ...
**Alternatives rejected.** ...
```

---

## Non-Goals of this Document

- 不列「怎麼寫程式」的規範（交給各 feature 的 `spec.md`）。
- 不列測試覆蓋率目標（交給 `/ddd.tasks`）。
- 不列目錄結構（等第一次 `/ddd.work` 落地後補）。
