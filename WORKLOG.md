# Design_house — Work Log

## 2026-04-20 Session 1 — 環境初始化

### 目標
匯入 DDD workflow，作為後續所有建置流程的骨幹。

### 已完成

1. **讀取並解析 `Claude-Design-Sys-Prompt.txt`**
   - 確認這是 Claude.ai Design Artifact 平台的 system prompt
   - 歸納核心章節：workflow、React+Babel 規範、Tweaks postMessage 協定、deck/starter components、內建 skills（12 個）、驗證流程（done → fork_verifier_agent）
   - 整理了約 30 個 prompt 內列出的工具

2. **設計了復刻該環境的六層架構**（待未來實作）
   - 專案檔案系統（backend）
   - 沙盒預覽（雙 iframe）
   - 工具層（tool dispatcher）
   - Starter components 資源庫
   - Skills 系統
   - Verifier subagent
   - + 匯出管線（PPTX / PDF / standalone HTML）

3. **安裝 DDD workflow plugin**（`applepig/ddd-workflow`）
   - 原始 repo 是 plugin 格式、無 marketplace.json，Claude Code 直接安裝失敗
   - 解法：建立本地 marketplace 包裝
     - Clone 至：`C:\Users\user\.claude\local-marketplaces\ddd-workflow-mp\plugins\ddd-workflow\`
     - 自製 marketplace manifest：`...\ddd-workflow-mp\.claude-plugin\marketplace.json`
   - `claude plugin marketplace add` + `claude plugin install ddd-workflow@ddd-workflow-mp`
   - `claude plugin list` 確認：✔ enabled, scope: user

4. **寫入 memory**（`C:\Users\user\.claude\projects\D--sideprojct-Design-house\memory\`）
   - `feedback_use_ddd_workflow.md` — 所有建置必須走 DDD pipeline
   - `reference_ddd_workflow.md` — plugin 位置、slash commands、docs 結構
   - `MEMORY.md` — 索引

### 待辦（下個 session，重啟後）

- [ ] 確認 `/ddd.plan`、`/ddd.spec`、`/ddd.tasks`、`/ddd.work`、`/ddd.xreview` slash commands 已可用
- [ ] 建立 `docs/PRD.md`（產品目標、使用者、範圍）
- [ ] 建立 `docs/TECHSTACK.md`（語言、框架、部署環境）
- [ ] 對 Claude-Design-Sys-Prompt.txt 描述的平台正式啟動第一個 feature sprint（建議從最小可行：file I/O + iframe preview + show_to_user/done 這三個核心工具開始）

### 目前檔案清單

```
D:\sideprojct\Design_house\
├── Claude-Design-Sys-Prompt.txt   (422 行，來源材料)
└── WORKLOG.md                     (本檔)
```

### 重啟提醒

- Claude Code plugin 的 skill 只在啟動時載入，重啟後 `/ddd.*` 才會出現
- Memory 會自動在新 session 載入（feedback + reference 兩條已寫入）
- 重啟後第一件事：驗 `/ddd.plan` 等指令存在 → 開始寫 PRD.md
