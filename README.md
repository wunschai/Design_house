# Design_house

本機單使用者的 Claude.ai Design Artifact 平台復刻。透過 spawn 本機已登入的 `claude` CLI subprocess 為後端，在瀏覽器內對話生成可預覽可迭代的 HTML 設計稿。

---

## 系統前置條件

| 項目 | 需求 |
|---|---|
| OS | Windows 11（開發主機）；macOS / Linux 應可跑但未驗證 |
| Node.js | **22 LTS supported**；25.x best-effort（M0 驗過實機可跑，`better-sqlite3` prebuilt 僅覆蓋到 Node 22） |
| pnpm | 10.x（透過 `npm i -g pnpm` 或 corepack） |
| `claude` CLI | 2.1.x，**必須已登入訂閱**（Pro / Max）。認證方式不可用 OAuth（違反 ADR-001） |
| Build tools | Windows 需 VS Build Tools 2022 + Python（供 `better-sqlite3` native build） |

`claude` CLI 登入狀態以下指令驗證：
```bash
claude -p "2+2"
# 預期輸出：4
```

---

## 快速上手

```bash
# 1. 安裝 deps
pnpm install

# 2. typecheck 全 workspace
pnpm -r typecheck

# 3. 跑所有 unit test
pnpm -r test

# 4. 啟動 dev server（backend + frontend，含瀏覽器自動開啟）
pnpm dev
#   → backend @ http://127.0.0.1:31823/
#   → frontend Vite dev server proxied via same origin
```

遇 port 衝突：
```bash
PORT=31824 pnpm dev
```

---

## 專案結構

```
Design_house/
├── apps/
│   ├── backend/          Fastify + WS + SQLite + CC CLI 調度（M2 [C]）
│   ├── mcp-server/       stdio MCP 5 工具 + HTTP callback（M2 [B]）
│   └── frontend/         React + Vite + shadcn/ui（M2 [D]）
├── packages/
│   └── shared/           Zod schemas + TS types + helpers（M0 已完成）
├── docs/
│   ├── PRD.md            產品範圍
│   ├── TECHSTACK.md      技術決策 + ADR-001 禁 OAuth
│   └── 1-v0-mvp/
│       ├── plan.md       brainstorming 結論
│       ├── spec.md       10 ADR + 34 AC + API 契約（SSOT）
│       ├── tasks.md      4 milestones、~80 task checklist
│       ├── research.md   M1 spike 驗證記錄
│       └── works.md      實作日誌（時間序）
├── projects/             使用者 design artifacts（`.gitignore`）
├── .data/                SQLite（`.gitignore`）
├── .claude/agents/       design-artifact persona（M2 產出）
└── .mcp.json             MCP server 配置（M2 產出）
```

---

## 開發狀態（2026-04-21）

- ✅ M0 — Monorepo scaffold + shared contracts（192 tests）
- ✅ M1 — 三項技術 spike（OQ-1/2/3 + OQ-4/5 新增，4 輪迭代收斂）
- ⏳ M2 — 四條平行工作線（persona / MCP / backend / frontend）
- ⏳ M3 — 整合 + E2E smoke + 34 AC 驗收

---

## DDD Pipeline

本專案採 DDD 工作流（docs → spec → tasks → work → xreview）。任何新功能或修改應透過：

```bash
/ddd.plan          # 只在既有功能延伸時
/ddd.brainstorming # 新 greenfield feature
/ddd.spec
/ddd.tasks
/ddd.work
/ddd.xreview
```

詳見 `docs/` 資料夾與根 CLAUDE.md（若存在）。

---

## 疑難排解

- **`better-sqlite3` install 失敗**：裝 VS Build Tools 2022、Python 3.x；或降 Node 至 22 LTS
- **`pnpm` 拒絕執行 native build**：根 `package.json` 已加 `pnpm.onlyBuiltDependencies: ["better-sqlite3", "esbuild"]`
- **`claude` CLI 回應 `Please run /login`**：訂閱登出；在本機 terminal 跑 `claude /login` 重新授權
- **Port `31823` 衝突**：`PORT=xxxx pnpm dev`（backend 會以 fail-fast 印出建議埠）

---

## License

Private（個人使用）
