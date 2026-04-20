# PRD — Design_house

> Source of truth for product scope. Updated by DDD coordinator only.
> Last revision: 2026-04-20

## Vision

一個**在本機跑的單人 Web 應用**，復刻 Claude.ai Design Artifact 的使用體驗：用自然語言跟 AI 設計師協作，產生、預覽、迭代以 HTML 為載體的設計成品（prototype、deck、animation、wireframe 等）。

UI 盡量接近原版，讓既有使用者的肌肉記憶可以延續。

## Problem

Claude.ai 的 Design Artifact 平台是雲端/session 綁定的。對需要**持久化本機專案**、**離線可用**、**用訂閱制控管成本**的使用者，沒有對應的本地化選項。

## Target User

- **單一使用者** — 本機擁有者，亦即本專案作者。
- 已在機器上安裝並登入 `claude` CLI（Claude Pro / Max 訂閱）。
- 不是開發者社群產品；不對外發佈。

## Core Use Cases

1. **新專案** — 描述需求 → AI 產出 HTML artifact → 出現在預覽窗格。
2. **元素級迭代** — 在 preview iframe 裡**對元素評論、拖拉、內嵌編輯**（對應原始 prompt 的 `<mentioned-element>` 協定），AI 拿到元素定位資訊後去改對應的 source code。**不只是聊天框打字**，這是 Design Artifact 使用體驗的核心。
3. **匯入外部設計脈絡** — 上傳 codebase / 螢幕截圖 / Figma 連結 / 貼 GitHub URL / 指向另一個本機專案，作為設計參考。原始 prompt 一再強調「設計不能 from scratch」，匯入脈絡是品質來源。
4. **變體探索（variations-first）** — 單一需求 → 產出 3+ 變體，透過 slides / Tweaks toggle / design canvas 平列呈現，使用者挑選或混搭。
5. **兩種呈現格式** — 純視覺選擇 → design_canvas 平列佈局；互動流程 → 單一 hi-fi prototype + Tweaks。模型/使用者選格式後 UI 呈現方式要跟著切。
6. **跨 session 持久化** — 關掉瀏覽器再打開，專案、對話、檔案、CLAUDE.md 都還在。
7. **匯出** — 把成品另存為 standalone HTML / PPTX / PDF。

## MVP Scope (v0)

最小可行版本，用於打通端到端流水線：

- [ ] 本機 Web UI（localhost 127.0.0.1 綁定，不對外）
- [ ] 專案檔案系統（建立、列出、讀、寫、複製、刪除）
- [ ] 對話介面 → 派發到 Claude Code CLI subprocess → 回收輸出
- [ ] iframe 預覽窗格顯示 HTML 產出
- [ ] 最小工具集：`read_file`、`write_file`、`list_files`、`show_to_user`、`done` 的等效實作
- [ ] **CC CLI 人格注入機制**（使 CC 表現得像 Design Artifact 模型，而非「You are Claude Code…」）— 這是 v0 就要決定的**靈魂問題**，否則輸出體驗會錯位
- [ ] **工具映射層**（把 CC 的 tool calls 翻譯成 UI 理解的 `show_to_user` / `done` / 檔案操作事件）

## Out of MVP（延後到 v1+）

- `<mentioned-element>` 協定 — preview 元素級評論/拖拉/內嵌編輯（MVP 先做「整個預覽 + 聊天框」即可）
- Tweaks postMessage 協定（`__edit_mode_*`、`/*EDITMODE-BEGIN*/.../*EDITMODE-END*/` JSON 標記重寫）
- 變體並列呈現（design_canvas 平列 + Tweaks 切換）
- 匯入外部脈絡：檔案上傳、GitHub 連結、螢幕截圖、cross-project 讀取
- `CLAUDE.md` 專案級長期指示
- 資產審查面板（`register_assets` / `asset: "<name>"` 標註使用者可見產出）
- Verifier subagent（獨立 iframe 自動檢查；另外跑一個 CC 進程或同 session 子任務）
- Starter components 資源庫（deck_stage.js、design_canvas.jsx、ios_frame.jsx、android_frame.jsx、macos_window.jsx、browser_window.jsx、animations.jsx）
- Skills 系統 + `invoke_skill`（12 個內建 skill：Animated video、Interactive prototype、Make a deck、Make tweakable、Frontend design、Wireframe、Export PPTX editable/screenshots、Create design system、Save as PDF、Save as standalone HTML、Send to Canva、Handoff to Claude Code）
- 匯出管線：Standalone HTML bundler、PDF（browser print）、PPTX editable、PPTX screenshots、Canva、Claude Code handoff
- `questions_v2` 結構化提問表單
- Speaker notes 支援（`<script type="application/json" id="speaker-notes">` + `slideIndexChanged` postMessage）
- Napkin 附件處理
- `window.claude.complete()` artifact 內建呼叫（讓產出的 HTML 可以回呼模型）
- 固定尺寸內容自動縮放（1920×1080 / 16:9 / scale transform）

## Out of Scope（永不做）

- 多人 / 帳號 / 雲端部署
- OAuth 模型授權流程（見 `TECHSTACK.md` ADR-001）
- 外帶 API key（BYO key）輸入介面
- 付費 / billing / SaaS

## Success Criteria

- 使用者在本機下指令啟動 → 瀏覽器自動開啟 UI → 輸入 prompt → 拿到可預覽的 HTML artifact → 能持續迭代，全程不需要再次驗證身份。
- 體感上「跟 Claude.ai Design 類似但更快（本機）」——不是「像本地 IDE」。
- 不存任何 AI 認證憑證；完全寄生於已登入的 `claude` CLI。

## Constraints

- **禁 OAuth**（硬性）：見 `TECHSTACK.md` ADR-001。
- **只綁 localhost**：不暴露到 LAN 或公網。
- **CC CLI 為唯一 AI backend**：不直接接 Anthropic API、不接 Bedrock、不接 Vertex。
- **單使用者**：不設計多 session / user namespace。

## Open Questions（留給 `/ddd.brainstorming`）

**產品**
- 變體如何呈現給使用者？（slides / tabs / 平列 canvas / Tweaks toggle / 全部？）
- 預覽 iframe 裡允不允許我方在 DOM 上塗改（選取框、comment pin）？

**架構（重要）**
- **CC CLI 人格注入策略**：`--append-system-prompt` 塞整份 Design Artifact prompt？包成 subagent？每輪 user message 前綴？
- **工具映射策略**：純 prompt 約定（叫 CC 輸出 sentinel tag 再 parse）／自建 MCP server／SDK-mode 攔截 tool calls？
- **iframe ↔ CLI subprocess 通訊**：瀏覽器事件（`postMessage`、mentioned-element、Tweaks 編輯）要怎麼灌回正在跑的 CLI？要不要 resumable session？
- **Verifier**：另起 CC 進程還是同 session 分叉？

**選型**
- 前端框架：React / Svelte / Solid / vanilla ES modules？
- 後端 runtime：Node (Bun) / Node (tsx) / Deno / Python / Go？
- CC CLI 呼叫模式：`--print` 一發一收、持續 stdin、JSON-RPC？
- 專案檔案 root convention？（`%USERPROFILE%/Design_house/projects/` vs 專案內）
- Chat / metadata 儲存：SQLite / 檔案 JSON / IndexedDB？

---

## Roadmap（預擬，等 tasks.md 取代）

| 里程碑 | 內容 | 備註 |
|---|---|---|
| M0 | 專案初始化（本文件 + TECHSTACK + 第一次 `/ddd.brainstorming`） | ← 目前位置 |
| M1 | v0 MVP：chat → CLI → HTML → iframe，end-to-end 打通 | |
| M2 | 專案檔案管理 UI（檔案樹、重新命名、刪除） | |
| M3 | `done` / `show_to_user` 協定等效實作 | |
| M4 | Tweaks 協定 + 即時編輯 | |
| M5 | 匯出（Standalone HTML → PDF → PPTX） | |
| M6 | Verifier subagent | |
| M7 | Starter components + Skills | |
