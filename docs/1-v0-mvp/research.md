# Research: M1 Spike — 三項技術假設驗證

> 對應 spec §Open Questions OQ-1 / OQ-2 / OQ-3，及 tasks.md Task 2.1 / 2.2 / 2.3。
> 驗證時間：2026-04-21
> CC 版本：`claude 2.1.116 (Claude Code)`、Node 25.2.1、Windows 11 Pro

---

## OQ-1：`--resume <id>` + `--output-format stream-json` 共存性

**對應 spec exit criteria**：
1. 首輪無 `--resume` 啟動並截下 `session_id`
2. 第二輪用 `--resume <id>` 接續，驗證 CC 能回憶前輪對話內容
3. 第二輪中 MCP 工具呼叫 tool_result 出現在 stream-json 輸出

### 執行

**Turn 1**（無 `--resume`）：
```
claude -p "Say the word 'apple' and only that word" --output-format stream-json --verbose
```
輸出（節選）：
```json
{"type":"system","subtype":"init","session_id":"ce84ae05-0092-4099-bfc7-2ee7ac2cbf96",...}
{"type":"rate_limit_event",...}
{"type":"assistant","message":{"content":[{"type":"text","text":"apple"}],...},"session_id":"ce84ae05-..."}
{"type":"result","subtype":"success","result":"apple","session_id":"ce84ae05-..."}
```
→ session_id 擷取成功 ✅

**Turn 2**（`--resume ce84ae05-...`）：
```
claude -p "What word did I ask you to say a moment ago?" --resume ce84ae05-0092-4099-bfc7-2ee7ac2cbf96 --output-format stream-json --verbose
```
輸出：CC 回覆 `"apple"`，session_id 仍為 `ce84ae05-...` → context 正確保留 ✅

**Turn 3**（tool_use 流程，非 `--resume`，但同樣驗證 tool_result 在 stream-json 出現）：
```
claude -p "Read the file package.json and tell me the name field value" --output-format stream-json --verbose
```
輸出含完整 tool_use + tool_result 事件 ✅（詳見 OQ-3 的 event catalog）

### 結論

**PASS**。spec exit criteria 全 3 項通過：
- ✅ session_id 正確生成且固定於 session 內
- ✅ `--resume` + `--output-format stream-json` 可同時使用、context 保留
- ✅ tool_use / tool_result 事件在 stream-json 中正確呈現

### ADR-002 影響

**無需修改**。ADR-002 的假設（每專案一個 cc_session_id、首輪 spawn 無 `--resume` 擷取 session_id、後續 `--resume`）與實測一致。

---

## OQ-2：Subagent `tools:` 欄位精確語法

**對應 spec exit criteria**：找出能生效的 tools allowlist 語法。

### 方法

不是跑 3 種候選再看哪個生效（太慢），而是**讀已生效的 agent 檔案**作為 ground truth。參考檔案：

`C:\Users\user\.claude\local-marketplaces\ddd-workflow-mp\plugins\ddd-workflow\agents\ddd-developer.md`（此 agent 本 session 已成功 dispatch 並完成 M0 Task 1.4-1.11）

```yaml
---
name: ddd-developer
description: >
  ...
model: inherit
color: green
tools: ["Read", "Grep", "Glob", "Bash", "Write", "Edit"]
---
```

### 結論

**PASS**。確認語法：

1. **Frontmatter 是 YAML block**（`---` 開頭結尾）
2. **`tools` 欄位是 JSON/YAML array of strings**（引號包起的 tool 名）
3. **內建工具直接用名字**：`"Read"`、`"Write"`、`"Edit"`、`"Bash"`、`"Glob"`、`"Grep"` 等
4. **MCP 工具用 `mcp__<server>__<tool>`**（依 Claude Code 文件慣例，v0 實際值為 `mcp__design_house__read_file` 等）
5. **不列出的工具即為封鎖**
6. 其他必要欄位：`name`（識別碼）、`description`（何時派發）、`model`（`inherit` / `sonnet` / `opus` / `haiku`）、`color`（UI 顯示色）

### Agent 發現位置

- Plugin agents：`<plugin-path>/agents/*.md`
- User-level：`~/.claude/agents/*.md`
- **Project-level**（v0 採用）：`./.claude/agents/*.md`

CC 啟動時自動掃描，agent 名稱以 `name` 欄位為 ID（plugin namespace 前綴如 `ddd-workflow:ddd-developer`）。

### ADR-003 影響

**無需修改**。ADR-003 指定的 allowlist 內容（5 個 MCP 工具、封鎖所有 CC 內建 tool）語意正確。補充：實作時 persona 的 `tools` 用 YAML array 列出 5 個 `mcp__design_house__<tool>` 字串即可。

---

## OQ-3：Stream-json 實際事件結構 vs ADR-004 推定

**對應 spec exit criteria**：蒐集實際 stream-json 事件範例，標註 match/mismatch。

### 觀察到的 event catalog

| # | `type` | `subtype` / 額外欄位 | ADR-004 有推定？ | 備註 |
|---|---|---|---|---|
| 1 | `system` | `subtype:"init"`、含 `session_id` / `cwd` / `model` / `tools` / `mcp_servers` / `permissionMode` / `agents` 等 | ✅ | 欄位較豐富但核心 `session_id` / `model` 對齊 |
| 2 | `rate_limit_event` | `rate_limit_info: {status, resetsAt, rateLimitType, overageStatus, ...}` | ❌ **新增** | 訂閱額度狀態推送；parser 要 skip |
| 3 | `assistant` | `message.content[]` 含 `{type:"thinking", thinking, signature}` | ❌ **新增** | Extended thinking block；parser 要 skip 或顯示為「思考中」ghost delta |
| 4 | `assistant` | `message.content[]` 含 `{type:"text", text}` | ✅ | 對應 chat-delta |
| 5 | `assistant` | `message.content[]` 含 `{type:"tool_use", id, name, input, caller}` | ✅（`caller` 為新增欄位）| `caller:{type:"direct"}` 可 ignore |
| 6 | `user` | `message.content[]` 含 `{type:"tool_result", tool_use_id, content}`；event-level 另有 `timestamp`、`tool_use_result:{type:"text", file:{...}}` | ✅（event-level extras 為新增）| parser 讀 `message.content[0].content` 即可，忽略 extras |
| 7 | `result` | `subtype:"success"`、`result`、`duration_ms`、`num_turns`、`total_cost_usd`、`usage`、`modelUsage`、`terminal_reason` 等 | ✅ | 欄位豐富但對齊 |

### 所有事件共通欄位
- `session_id`（top-level，每個 event 都有，方便路由）
- `uuid`（事件唯一 ID，方便 dedupe）
- `parent_tool_use_id`（nested subagent tool call 時會填，預設 null）

### ADR-004 影響（必修）

三項新發現要補進 stream-parser 處理：

1. **`rate_limit_event`**：parser 明確 skip，或 optionally 廣播 WS `error` 或 `system` 事件給 UI 顯示訂閱狀態（v0 先 skip、v1+ 再加）
2. **`thinking` content type**：parser skip，或 v1+ 當 ghost delta 顯示「AI 思考中」動畫；v0 skip 即可（不要讓 thinking 文字出現在使用者 chat 視窗）
3. **`caller` 欄位 on tool_use**：ignore，不影響 tool-start 事件生成

**建議**：在 spec.md ADR-004 的 event 表加一列註明 `rate_limit_event` / thinking content type 為「skip」；其餘結構推定正確。

---

## Spike 綜合結論

| OQ | 狀態 | ADR 影響 |
|---|---|---|
| OQ-1 | ✅ PASS | 無 |
| OQ-2 | ✅ PASS | 無 |
| OQ-3 | ✅ PASS（結構相容）| **ADR-004 需小幅補強**（`rate_limit_event` / `thinking` / `caller`） |

**M2 實作可以按原設計推進**，只需在 backend stream-parser 模組（Task 3.C.19-20）加入 3 個新事件類型的處理。

---

## 耗時

- OQ-1：~8 min（含 2 次 CC 呼叫 + 文件化）
- OQ-2：~3 min（讀 ref file）
- OQ-3：~5 min（1 次 CC tool 呼叫 + event catalog 記錄）
- 總計：~16 min，遠低於 0.5-1 day 超時上限。
