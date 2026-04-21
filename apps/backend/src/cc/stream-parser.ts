// CC stream-json 事件解析器 — ADR-004 event table 全覆蓋
import Database from "better-sqlite3";
import type { ServerToClientEventType } from "@design-house/shared/events";
import { insertRawLog, insertMessage } from "../db/client.js";
import { ulid } from "ulid";

const INPUT_SUMMARY_MAX = 200;

function truncateSummary(input: unknown): string {
  const json = JSON.stringify(input);
  return json.length > INPUT_SUMMARY_MAX
    ? json.slice(0, INPUT_SUMMARY_MAX) + "…"
    : json;
}

// 追蹤每個 assistant message 的累積 content（用於寫入 DB）
const _assistantBuffers = new Map<string, { messageId: string; content: string }>();

/**
 * 解析一行 NDJSON stream，回傳 0 ~ N 個 WS events。
 */
export function parseStreamLine(
  line: string,
  projectSlug: string,
  currentMessageId: string,
  db: Database.Database
): ServerToClientEventType[] {
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(line) as Record<string, unknown>;
  } catch {
    // JSON parse fail → raw_log
    insertRawLog(db, {
      project_slug: projectSlug,
      source: "cc-stdout",
      severity: "warn",
      reason: "json-parse-failed",
      raw: line,
    });
    return [];
  }

  const type = obj["type"] as string | undefined;

  if (!type) {
    insertRawLog(db, {
      project_slug: projectSlug,
      source: "cc-stdout",
      severity: "warn",
      reason: "unknown-event-type",
      raw: line,
    });
    return [];
  }

  const events: ServerToClientEventType[] = [];

  switch (type) {
    case "system": {
      // system init — session_id 已在 spawner 處理
      // 這裡不重複寫 DB，只 skip
      break;
    }

    case "assistant": {
      const message = obj["message"] as { content?: unknown[] } | undefined;
      const contentArr = message?.content ?? [];

      for (const block of contentArr as Record<string, unknown>[]) {
        const blockType = block["type"] as string;

        if (blockType === "text") {
          // chat-delta — 逐 delta 推送
          const text = (block["text"] as string) ?? "";
          if (!text) break;

          // 取得或建立此 assistant message 的 buffer
          let buf = _assistantBuffers.get(projectSlug);
          if (!buf) {
            buf = { messageId: ulid(), content: "" };
            _assistantBuffers.set(projectSlug, buf);
          }
          buf.content += text;

          // 處理 >64KB chunking（邊界 12）
          const CHUNK_SIZE = 16 * 1024;
          if (text.length > CHUNK_SIZE) {
            for (let i = 0; i < text.length; i += CHUNK_SIZE) {
              events.push({
                type: "chat-delta",
                projectSlug,
                messageId: buf.messageId,
                delta: text.slice(i, i + CHUNK_SIZE),
              });
            }
          } else {
            events.push({
              type: "chat-delta",
              projectSlug,
              messageId: buf.messageId,
              delta: text,
            });
          }

        } else if (blockType === "thinking") {
          // skip — extended thinking block，不洩漏。用 continue 而非 break，
          // 否則同一 assistant message 內 thinking 後面的 text/tool_use block 會被吞掉。
          continue;

        } else if (blockType === "tool_use") {
          // tool-start event
          const toolUseId = (block["id"] as string) ?? ulid();
          const toolName = (block["name"] as string) ?? "unknown";
          const input = block["input"];
          // `caller` 欄位 ignore（ADR-004）

          // 寫入 DB
          insertMessage(db, {
            id: toolUseId,
            project_slug: projectSlug,
            role: "tool_use",
            content: JSON.stringify(input),
            tool_use_id: toolUseId,
            tool_name: toolName,
            is_error: null,
          });

          events.push({
            type: "tool-start",
            projectSlug,
            toolUseId,
            toolName,
            inputSummary: truncateSummary(input),
            parentToolUseId: (block["parent_tool_use_id"] as string | null) ?? null,
          });
        }
      }
      break;
    }

    case "user": {
      const message = obj["message"] as { content?: unknown[] } | undefined;
      const contentArr = message?.content ?? [];

      for (const block of contentArr as Record<string, unknown>[]) {
        const blockType = block["type"] as string;

        if (blockType === "tool_result") {
          const toolUseId = (block["tool_use_id"] as string) ?? "";
          const isError = Boolean(block["is_error"]);
          const resultContent = block["content"];
          const summary = typeof resultContent === "string"
            ? resultContent
            : JSON.stringify(resultContent);

          // 寫入 DB（event-level timestamp / tool_use_result 忽略）
          insertMessage(db, {
            id: ulid(),
            project_slug: projectSlug,
            role: "tool_result",
            content: summary,
            tool_use_id: toolUseId,
            tool_name: null,
            is_error: isError ? 1 : 0,
          });

          events.push({
            type: "tool-result",
            projectSlug,
            toolUseId,
            isError,
            summary: truncateSummary(resultContent),
          });
        }
      }
      break;
    }

    case "rate_limit_event": {
      // skip — 訂閱額度推送，不洩漏（ADR-004）
      break;
    }

    case "result": {
      const subtype = obj["subtype"] as string;

      // 將 assistant buffer 寫入 DB
      const buf = _assistantBuffers.get(projectSlug);
      if (buf?.content) {
        insertMessage(db, {
          id: buf.messageId,
          project_slug: projectSlug,
          role: "assistant",
          content: buf.content,
          tool_use_id: null,
          tool_name: null,
          is_error: null,
        });
        _assistantBuffers.delete(projectSlug);
      }

      if (subtype === "success") {
        events.push({
          type: "turn-end",
          projectSlug,
          messageId: currentMessageId,
          reason: "complete",
        });
      } else if (subtype === "error_max_turns") {
        events.push({
          type: "error",
          projectSlug,
          code: "CC_MAX_TURNS",
          message: "CC reached max turns limit",
        });
        events.push({
          type: "turn-end",
          projectSlug,
          messageId: currentMessageId,
          reason: "error",
        });
      } else if (subtype === "error_during_execution") {
        events.push({
          type: "error",
          projectSlug,
          code: "CC_EXECUTION_ERROR",
          message: "CC execution error",
        });
        events.push({
          type: "turn-end",
          projectSlug,
          messageId: currentMessageId,
          reason: "error",
        });
      } else {
        // 未知 result subtype — UI 能分類才能 actionable
        insertRawLog(db, {
          project_slug: projectSlug,
          source: "cc-stdout",
          severity: "warn",
          reason: "unknown-event-type",
          raw: line,
        });
        events.push({
          type: "error",
          projectSlug,
          code: "CC_UNKNOWN_RESULT_SUBTYPE",
          message: `Unknown result.subtype: ${subtype ?? "(missing)"}`,
        });
        events.push({
          type: "turn-end",
          projectSlug,
          messageId: currentMessageId,
          reason: "error",
        });
      }
      // 清 buffer 防跨 turn 汙染
      _assistantBuffers.delete(projectSlug);
      break;
    }

    default: {
      // 未知 type → raw_log（不崩潰）
      insertRawLog(db, {
        project_slug: projectSlug,
        source: "cc-stdout",
        severity: "warn",
        reason: "unknown-event-type",
        raw: line,
      });
      break;
    }
  }

  return events;
}

// 清除 buffer（測試使用）
export function _clearBufferForTesting(): void {
  _assistantBuffers.clear();
}
