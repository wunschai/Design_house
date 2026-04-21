// Chat panel — 訊息列表 + 輸入框 + streaming + tool events
import React, { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { ScrollArea } from "../components/ui/scroll-area";
import type { UseWsReturn } from "../hooks/use-ws";
import type { ApiMessage } from "../api/client";
import { listMessages } from "../api/client";

// ── Types ─────────────────────────────────────────────────────────────

interface StreamingMessage {
  id: string;
  role: "assistant";
  content: string;
  streaming: true;
}

interface ToolEvent {
  id: string;
  role: "tool_use";
  toolName: string;
  inputSummary: string;
  isError?: boolean;
}

type DisplayMessage = ApiMessage | StreamingMessage | ToolEvent;

function isStreaming(m: DisplayMessage): m is StreamingMessage {
  return "streaming" in m && m.streaming === true;
}

function isToolEvent(m: DisplayMessage): m is ToolEvent {
  return m.role === "tool_use" && "toolName" in m;
}

// ── Component ─────────────────────────────────────────────────────────

export interface ChatProps {
  projectSlug: string;
  ws: UseWsReturn;
}

export default function Chat({ projectSlug, ws }: ChatProps) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, set_input] = useState("");
  const [is_busy, set_is_busy] = useState(false);
  const [is_turn_active, set_is_turn_active] = useState(false);
  const scroll_ref = useRef<HTMLDivElement>(null);
  const streaming_id_ref = useRef<string | null>(null);

  // 初始載入歷史訊息
  useEffect(() => {
    let cancelled = false;
    listMessages(projectSlug).then((msgs) => {
      if (!cancelled) {
        setMessages(msgs);
      }
    }).catch(() => {/* silent */});

    return () => { cancelled = true; };
  }, [projectSlug]);

  // WS 事件訂閱
  useEffect(() => {
    const unsubscribers: Array<() => void> = [];

    // chat-delta: 即時 append 到最後一則 assistant 訊息
    unsubscribers.push(ws.on("chat-delta", (event) => {
      if (event.projectSlug !== projectSlug) return;
      streaming_id_ref.current = event.messageId;

      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && isStreaming(last) && last.id === event.messageId) {
          return [...prev.slice(0, -1), { ...last, content: last.content + event.delta }];
        }
        // 新的 streaming message
        return [
          ...prev,
          { id: event.messageId, role: "assistant", content: event.delta, streaming: true } as StreamingMessage,
        ];
      });
    }));

    // tool-start: 顯示工具呼叫 chip
    unsubscribers.push(ws.on("tool-start", (event) => {
      if (event.projectSlug !== projectSlug) return;
      const summary = event.inputSummary.length > 200
        ? event.inputSummary.slice(0, 200) + "…"
        : event.inputSummary;
      setMessages((prev) => [
        ...prev,
        { id: event.toolUseId, role: "tool_use", toolName: event.toolName, inputSummary: summary } as ToolEvent,
      ]);
    }));

    // tool-result: 更新對應工具事件的 isError
    unsubscribers.push(ws.on("tool-result", (event) => {
      if (event.projectSlug !== projectSlug) return;
      setMessages((prev) =>
        prev.map((m) =>
          isToolEvent(m) && m.id === event.toolUseId
            ? { ...m, isError: event.isError }
            : m
        )
      );
    }));

    // turn-end: 解除 busy 狀態
    unsubscribers.push(ws.on("turn-end", (event) => {
      if (event.projectSlug !== projectSlug) return;
      set_is_busy(false);
      set_is_turn_active(false);
      streaming_id_ref.current = null;
      // 把 streaming message 轉為靜態 ApiMessage
      setMessages((prev) =>
        prev.map((m): DisplayMessage => {
          if (!isStreaming(m)) return m;
          const static_msg: ApiMessage = {
            id: m.id,
            projectSlug,
            role: "assistant",
            content: m.content,
            createdAt: new Date().toISOString(),
          };
          return static_msg;
        })
      );
    }));

    // error: 顯示錯誤
    unsubscribers.push(ws.on("error", (event) => {
      if (event.code === "TURN_ALREADY_ACTIVE") {
        // toast 提示會在 App 層處理
      }
      set_is_busy(false);
    }));

    // message-ack: turn 開始
    unsubscribers.push(ws.on("message-ack", (_event) => {
      set_is_turn_active(true);
    }));

    return () => {
      unsubscribers.forEach((fn) => fn());
    };
  }, [projectSlug, ws]);

  // 自動滾到底
  useEffect(() => {
    if (scroll_ref.current) {
      scroll_ref.current.scrollTop = scroll_ref.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = useCallback(() => {
    if (!input.trim() || is_busy) return;
    const content = input.trim();
    set_input("");
    set_is_busy(true);

    // 立即顯示使用者訊息
    const client_message_id = `client-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: client_message_id,
        projectSlug,
        role: "user",
        content,
        createdAt: new Date().toISOString(),
      } as ApiMessage,
    ]);

    ws.send({
      type: "user-message",
      projectSlug,
      content,
      clientMessageId: client_message_id,
    });
  }, [input, is_busy, projectSlug, ws]);

  const handleCancel = useCallback(() => {
    ws.send({ type: "cancel-turn", projectSlug });
    set_is_busy(false);
    set_is_turn_active(false);
  }, [projectSlug, ws]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  return (
    <div className="flex flex-col h-full">
      {/* 訊息區域 */}
      <ScrollArea className="flex-1 p-4">
        <div ref={scroll_ref} className="space-y-3">
          {messages.map((msg, idx) => (
            <MessageItem key={`${msg.id}-${idx}`} message={msg} />
          ))}
          {is_busy && !is_turn_active && (
            <div className="text-sm text-muted-foreground animate-pulse" aria-label="AI 思考中">
              AI 思考中…
            </div>
          )}
        </div>
      </ScrollArea>

      {/* 輸入區域 */}
      <div className="border-t p-3 flex gap-2 items-end">
        <Input
          value={input}
          onChange={(e) => set_input(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="輸入訊息…"
          disabled={is_busy}
          className="flex-1"
          aria-label="訊息輸入"
          data-testid="chat-input"
        />
        {is_turn_active ? (
          <Button
            variant="destructive"
            size="sm"
            onClick={handleCancel}
            aria-label="取消"
          >
            取消
          </Button>
        ) : (
          <Button
            onClick={handleSend}
            disabled={is_busy || !input.trim()}
            size="sm"
            aria-label="送出"
          >
            送出
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────

function MessageItem({ message }: { message: DisplayMessage }) {
  if (isToolEvent(message)) {
    return (
      <div
        className={`ml-4 text-xs border-l-2 pl-2 ${message.isError ? "border-destructive text-destructive" : "border-muted-foreground text-muted-foreground"}`}
        aria-label={`工具呼叫: ${message.toolName}`}
      >
        <span className="font-mono font-semibold">{message.toolName}</span>
        {" — "}
        <span>{message.inputSummary}</span>
      </div>
    );
  }

  const is_user = message.role === "user";
  const is_streaming_msg = isStreaming(message);

  return (
    <div className={`flex ${is_user ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
          is_user
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        } ${is_streaming_msg ? "opacity-90" : ""}`}
      >
        <pre className="whitespace-pre-wrap font-sans">{message.content}</pre>
      </div>
    </div>
  );
}
