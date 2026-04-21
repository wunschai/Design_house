# Research: M1 Spike — 三項技術假設驗證（v2 延伸版）

> 對應 spec §Open Questions OQ-1 / OQ-2 / OQ-3，及 tasks.md Task 2.1 / 2.2 / 2.3。
> v1（~16 min 初步驗證）被 xreview 判定樣本不足、方法有瑕疵。
> v2 在 2026-04-21 延伸驗證 OQ-1/2/3 的嚴謹版本 + 新增 OQ-4（plugin agent 碰撞）+ OQ-5（cwd 變化影響）。
>
> **環境**：CC 2.1.116、Node 25.2.1、Windows 11 Pro、已登入訂閱（非 API key）。

---

## OQ-1：`--resume <id>` + `--output-format stream-json` 共存性（延伸驗證）

### v1 缺陷
Turn 3 用了**無 `--resume`** 的 session 驗證 tool_use 事件，未滿足 spec exit criteria 3「第二輪中 MCP 工具呼叫 tool_result 出現」。偷換命題。

### v2 實驗

**Turn A**（baseline）：
```
claude -p "Reply with exactly: SPIKE_BASE" --output-format stream-json --verbose
```
→ session_id = `7d522b94-7982-4632-a0d8-b10258586ca5`

**Turn B**（`--resume` + tool_use 同一輪）：
```
claude -p "Now read the file package.json and tell me the pnpm.onlyBuiltDependencies values. Use Read tool." \
  --resume 7d522b94-7982-4632-a0d8-b10258586ca5 \
  --output-format stream-json --verbose
```

事件序列（6 行 NDJSON）：
```
system init           sid=7d522b94
assistant             content=["tool_use"]          sid=7d522b94
user                  content=["tool_result"]       sid=7d522b94
rate_limit_event                                    sid=7d522b94
assistant             content=["text"]              sid=7d522b94
result success        result="...better-sqlite3, esbuild."
```

### 結論
✅ **PASS（三項 exit criteria 全過）**：
1. session_id 首輪擷取 → Turn A 的 init event 取得
2. `--resume` + `stream-json` 共存 → Turn B init event 顯示 `session_id` 完全一致
3. tool_use + tool_result 在 `--resume` 會話中出現 → Turn B 有 `assistant.tool_use` + `user.tool_result` 且 `session_id` 續用

CC 正確記得 Turn A 的 context（知道「現在」要讀檔）+ 能呼叫 Read tool 並取得結果。

### ADR-002 影響
**無需修改**。

---

## OQ-2：Subagent `tools:` 欄位支援 MCP tool 名稱（延伸驗證）

### v1 缺陷
v1 靠讀 plugin 的 `ddd-developer.md`（只用 CC 內建 tools）推斷 MCP tool 語法——**未實驗驗證**。

### v2 實驗

建立測試 subagent `.claude/agents/oq2-spike-mcptool.md`：
```yaml
---
name: oq2-spike-mcptool
description: Spike agent for OQ-2 — validate that subagent tools: frontmatter accepts mcp__<server>__<tool>.
model: inherit
color: gray
tools: ["mcp__claude_ai_Google_Drive__authenticate", "Read"]
---
Test-only agent.
```

然後跑 `claude -p "Reply 'ok'" --output-format stream-json --verbose` 取 init event，檢查 `agents` 清單。

### 結論
✅ **PASS**：
- `agents` 清單含 `oq2-spike-mcptool`（agent 成功註冊，YAML 解析無錯）
- 確認 `tools: ["mcp__<server>__<tool>", "Read"]` array 語法為合法
- MCP tool 命名慣例 `mcp__<server>__<tool>` 確認（init event `tools` 列中已存在的 `mcp__claude_ai_Google_Drive__authenticate` 即為範本）

### ADR-003 影響
**無需修改 Decision**，但 Consequences 加一條：agent 檔案的 tools allowlist 以 JSON/YAML array of strings 表達，CC 內建 tool 用短名（`Read`/`Write`），MCP tool 用完整 `mcp__<server>__<tool>`。

---

## OQ-3：Stream-json 實際事件結構 + 錯誤分支（延伸驗證）

### v1 缺陷
只測 happy path，漏掉 `tool_result.is_error:true`、`result.subtype:"error_max_turns"`、cancel 等分支。

### v2 事件類型目錄（更新）

| # | `type` | `subtype` / 關鍵欄位 | 處理策略 |
|---|---|---|---|
| 1 | `system` | `subtype:"init"`、`session_id`、`cwd`、`model`、`tools`、`mcp_servers`、`agents`、`permissionMode` | 擷取 session_id、確認 agent 與 MCP 狀態 |
| 2 | `rate_limit_event` | `rate_limit_info:{status,resetsAt,rateLimitType,overageStatus,...}` | **skip**（v0），v1+ 可選擇廣播 |
| 3 | `assistant` thinking | `message.content[]:[{type:"thinking",thinking,signature}]` | **skip**（不洩漏思考） |
| 4 | `assistant` text | `message.content[]:[{type:"text",text}]` | → WS `chat-delta` |
| 5 | `assistant` tool_use | `message.content[]:[{type:"tool_use",id,name,input,caller?}]` | → WS `tool-start`（`caller` ignore） |
| 6 | `user` tool_result | `message.content[]:[{tool_use_id,type:"tool_result",content,is_error?}]`，event-level extras：`timestamp`、`tool_use_result` | → WS `tool-result`（`is_error` 轉 true/false） |
| 7 | `result` success | `subtype:"success"`、`result`、`duration_ms`、`num_turns`、`total_cost_usd`、`usage`、`terminal_reason:"completed"` | → WS `turn-end reason:"complete"` |
| 8 | `result` error_max_turns | `subtype:"error_max_turns"`、`is_error:true`、`result:""`、`terminal_reason:"max_turns"` | → WS `turn-end reason:"error"`、error code `CC_MAX_TURNS` |
| 9 | `result` error_during_execution | `subtype:"error_during_execution"` | → WS `turn-end reason:"error"`（未實測、同上處理）|
| 10 | SIGTERM 外部殺掉 | 無 result event，stdout 直接 EOF | Backend 判定 spawn 結束時若無 result → WS `turn-end reason:"timeout"\|"cancelled"` |

### v2 實驗

**OQ-3a — tool error 分支**：
```
claude -p "Read /does/not/exist/xyz.txt, say ERR_SEEN and stop." --output-format stream-json --verbose
```
結果：`user.message.content[0].is_error: true`，content 含錯誤敘述；`result.subtype:"success"`（整體 turn 仍結束）。

**OQ-3b — max_turns 強制**：
```
claude -p "Read 5 files one per turn" --max-turns 2 --output-format stream-json --verbose
```
結果：`{"type":"result","subtype":"error_max_turns","is_error":true,"num_turns":3,"stop_reason":"tool_use","result":"","terminal_reason":"max_turns"}`

**OQ-3c — SIGTERM cancel**（未形式化實測）：
v0 backend 負責 spawn 與 kill CC。假設：`process.kill(pid, "SIGTERM")` 後 CC stdout 直接 EOF、無 result event；backend 以「spawn 結束而無 result」作為判斷、合成 `turn-end{reason:"timeout"|"cancelled"}`。此假設將於 M2 Task 3.C.17-18 實測驗證（tasks.md 已列為 TDD test）。

### 結論
✅ **PASS**：
- 核心事件結構與 ADR-004 推定相容
- 錯誤分支的 stream-json 格式可辨識
- `result.subtype` enum 包含 `success` / `error_max_turns`，推定 `error_during_execution` 同格式（未實測）
- CC 未顯式提供 cancel → `result` 的轉換；backend 以「EOF + 無 result」判定

### ADR-004 影響
**已於 v1 回修 spec.md ADR-004**。延伸發現：`error_max_turns` 的 `is_error:true` 與 `result.subtype` 組合為 turn-end `reason:"error"` 的訊號。

---

## OQ-4：Plugin agent 碰撞與 `--agent` 強制選擇（v2 新增）

### 背景
xreview 指出：CC 啟動時會載入 user-level plugin agents（如 `ddd-workflow:ddd-developer`），即使 cwd 在 `projects/<slug>/` 下也會出現。若 CC Task tool 分派時誤選 ddd-developer 代替我方 `design-artifact`，ADR-005 整套 persona 策略失效。

### v2 實驗

**實驗 1**（cwd 子目錄下 agent 註冊表）：
```
cd scripts/.spike/cwd-test/   # 內有 .claude/agents/design-artifact.md
claude -p "Reply 'pong'" --output-format stream-json --verbose
```

init event `agents` 欄位：
```
["ddd-workflow:ddd-developer", "ddd-workflow:ddd-reviewer",
 "design-artifact", "Explore", "general-purpose",
 "oq2-spike-mcptool", "Plan", "statusline-setup"]
```

→ **確認碰撞**：plugin agents + cwd `.claude/agents/` + 父目錄 `.claude/agents/` 全部載入。

**實驗 2**（`--agent design-artifact` 強制主 session 扮演）：
```
claude -p "Who are you?" --agent design-artifact --output-format stream-json --verbose
```

CC 回覆：`"I am a test design-artifact agent for creating HTML design artifacts."`（精確映射我方 agent body）

→ **PASS**：`--agent` CLI flag 會把主 session 切換成指定 agent 的 persona + 工具白名單。plugin agents 仍在註冊表但**不主導**主 session。

**實驗 3**（`--bare` 是否可完全隔離 plugin）：
```
claude --bare --agent design-artifact -p "..." --output-format stream-json
```
init event 顯示：`agents: ["Explore","general-purpose","Plan","statusline-setup"]`（plugin agents 不載入）、`plugins: [ddd-workflow plugin entry]`（plugin dir 知道但未啟用）。

**但**回應：`"Not logged in · Please run /login"` — `--bare` 模式**不讀 OAuth keychain**（僅 API key / apiKeyHelper），**違反 ADR-001（禁 API key + 禁 OAuth 之外的認證）**。

→ `--bare` **不可使用**，記入 ADR-001 negative constraint。

**實驗 4**（`--strict-mcp-config` 隔離 MCP）：
```
claude --agent design-artifact --strict-mcp-config --mcp-config '{"mcpServers":{}}' -p "..."
```
init event `mcp_servers: []`、`mcp_tools: []` — 確認 `--strict-mcp-config` 可完全隔離 user-level MCP（如 Google Drive）。

### 結論
✅ **PASS** — 緩解方案確定：
- M2 backend spawn CC 命令必須用 `--agent design-artifact` 讓主 session 扮演我方 persona
- 加 `--strict-mcp-config` + `--mcp-config ./.mcp.json` 隔離 user-level MCP servers
- `--bare` 不可用（違反 ADR-001）
- plugin agents 仍在註冊表但不主導，可接受

### 架構影響（關鍵）

**新的 CC spawn command（M2 backend 必須採用）**：
```
claude --print \
       --agent design-artifact \
       --mcp-config ./.mcp.json \
       --strict-mcp-config \
       --output-format stream-json \
       --verbose \
       --resume <session-id>    # 首輪省略
       --max-turns 50           # 防 runaway
       [prompt as positional arg or --input-format stream-json via stdin]
```

→ 需回修 **ADR-002**（命令構成）+ **ADR-005**（persona 啟用機制）。

---

## OQ-5：cwd 變化影響（v2 新增）

### 背景
xreview：spike 全在 coordinator cwd (`D:\sideprojct\Design_house`) 跑，但 M2 backend 會在 `projects/<slug>/` 下 spawn CC。session_id、agent 發現、memory_paths 可能被影響。

### v2 實驗
在 `D:/sideprojct/Design_house/scripts/.spike/cwd-test/` 下啟 CC：
- cwd 正確：`cwd: "D:\\sideprojct\\Design_house\\scripts\\.spike\\cwd-test"`
- `memory_paths.auto: "C:\\Users\\user\\.claude\\projects\\D--sideprojct-Design-house\\memory\\"` — **跨子目錄共享父 project 的 memory**（根據 cwd 路徑 hash 至同一 project）
- `agents` 清單含**父目錄** (`D:\sideprojct\Design_house\.claude\agents\`) + **cwd** (`.\.claude\agents\`) 的 agents，皆被註冊
- `session_id` 正常生成與 `--resume` 正常運作

### 結論
✅ **PASS 可行但含注意事項**：
- memory 跨 subdir 共享，對 v0 無影響（單使用者）
- `.claude/agents/design-artifact.md` 放在**專案 root**（`D:/sideprojct/Design_house/.claude/agents/`）即可被所有 `projects/<slug>/` 下 spawn 的 CC 看到 → 統一管理，不需每個 `projects/<slug>/` 複製一份
- `.mcp.json` 同上（放專案 root）

### 架構影響
- `.claude/agents/design-artifact.md` 與 `.mcp.json` 放**專案 root**（已符合 tasks.md 之預計位置）
- M2 backend 在 `projects/<slug>/` spawn CC 時**不需手動複製 agent / mcp 設定**

---

## 綜合結論與待傳導修正

| OQ | 狀態 | ADR 影響 |
|---|---|---|
| OQ-1 | ✅ PASS（v2 嚴謹）| 無 |
| OQ-2 | ✅ PASS（v2 實測）| ADR-003 Consequences 微調 |
| OQ-3 | ✅ PASS（核心分支驗）| ADR-004 新增 `error_max_turns` row + SIGTERM 策略註記 |
| OQ-4 | ✅ PASS（緩解確定）| **ADR-002** 加命令構成、**ADR-005** 加啟用機制（`--agent` + `--strict-mcp-config`）、**ADR-001** 加 `--bare` 不可用條款 |
| OQ-5 | ✅ PASS（有注意事項）| ADR-005 補「agent/mcp 配置放專案 root」 |

### 殘留風險（v0 可接受、記 M3 AC 驗證）
1. **SIGTERM 後 CC stream-json 的實際收尾**：本 spike 未強制測，由 Task 3.C.17-18 的 Red test 負責
2. **`--input-format stream-json`（雙向流）**：v0 backend 預設採 `--input-format text`（positional prompt 即可），`--input-format stream-json` 若未來需要即時 cancel-mid-turn 再啟用。works.md 已記為 deferred。
3. **`error_during_execution`**：未實測但結構推定與 `error_max_turns` 同。M2 Task 3.C.19-20 的 parser test 可用合成事件覆蓋。
4. **plugin agent 副作用**：主 session 用 `--agent` 隔離後不受影響；若未來我方改成依賴 Task tool 分派 subagent 則需重新評估。

### 耗時
- v1 spike：~16 min（被判定樣本不足）
- v2 延伸：~25 min（OQ-1/2/3 嚴謹 + OQ-4/5 新增）
- 累計：~41 min，仍低於 0.5-1 day timebox。
