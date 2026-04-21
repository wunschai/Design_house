// CC CLI spawner — ADR-002 完整命令組裝、env inject、SIGTERM→SIGKILL 終止策略
import { spawn } from "node:child_process";
import { join } from "node:path";
import Database from "better-sqlite3";
import type { ServerToClientEventType } from "@design-house/shared/events";
import { parseStreamLine } from "./stream-parser.js";
import { INTERNAL_TOKEN } from "../app.js";
import { WORKSPACE_ROOT } from "../util/workspace.js";

// CC_CLI は実行時に読む（テスト中に CC_PATH env を変更できるよう）
const TURN_TIMEOUT_MS = 120_000;
const SIGKILL_DELAY_MS = 2_000;

export interface SpawnCcOptions {
  projectSlug: string;
  userMessage: string;
  messageId: string;
  resumeSessionId?: string;
  db: Database.Database;
  onEvent: (event: ServerToClientEventType) => void;
  registerCancel?: (killFn: () => void) => void;
}

export async function spawnCc(opts: SpawnCcOptions): Promise<void> {
  const {
    projectSlug,
    userMessage,
    messageId,
    resumeSessionId,
    db,
    onEvent,
    registerCancel,
  } = opts;

  // 實行時讀取 CC_PATH，讓測試可以動態覆蓋
  const CC_CLI = process.env["CC_PATH"] ?? "claude";
  const projectRoot = join(WORKSPACE_ROOT, "projects", projectSlug);
  const port = process.env["PORT"] ?? "31823";

  // 組裝命令（ADR-002）
  // 關鍵組合（M3 smoke 實測後修正）：
  //   --permission-mode bypassPermissions：允許 tool 呼叫免 prompt（原 `dontAsk` 是「不問=拒絕」）
  //   --tools ""：停用所有 CC 內建工具（Bash/Read/Write/Edit 等）
  //   --mcp-config + --strict-mcp-config：唯一的 tool 來源是我方 MCP server
  //   --agent design-artifact：套 persona（system prompt），實測 `tools:` YAML 欄位
  //                          在 `--agent` 模式下只是 hint、不強制限制，改靠 --tools 斷根
  //   --disallowedTools 補鎖 CC 的 planning / memory / scheduler 系列（以防未來版本）
  const args: string[] = [
    "--print",
    "--agent", "design-artifact",
    "--mcp-config", "./.mcp.json",
    "--strict-mcp-config",
    "--tools", "",
    "--disallowedTools",
      "Bash", "Read", "Write", "Edit", "MultiEdit",
      "Glob", "Grep", "Task", "WebSearch", "WebFetch",
      "TodoWrite", "ExitPlanMode", "NotebookEdit",
      "AskUserQuestion", "Skill", "ToolSearch",
      "EnterPlanMode", "EnterWorktree", "ExitWorktree",
      "TaskOutput", "TaskStop",
      "ScheduleWakeup", "CronCreate", "CronDelete", "CronList",
      "Monitor", "PushNotification", "RemoteTrigger",
    "--permission-mode", "bypassPermissions",
    "--output-format", "stream-json",
    "--verbose",
    "--max-turns", "50",
  ];

  if (resumeSessionId) {
    args.push("--resume", resumeSessionId);
  }

  args.push(userMessage);

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DH_INTERNAL_TOKEN: INTERNAL_TOKEN,
    DH_WEB_PORT: port,
    DH_PROJECT_ROOT: projectRoot,
    DH_PROJECT_SLUG: projectSlug,
  };

  return new Promise<void>((resolve, reject) => {
    // Windows 上 spawn 無副檔名的命令（如 "claude"）需要 shell: true 讓 cmd.exe 走 PATHEXT 解析；
    // 否則 Node spawn 直接找 claude.exe 會 ENOENT（實際 claude 是 .cmd shim）。
    // Unix 上保持 shell: false 以避免 shell injection 風險。
    const useShell = process.platform === "win32";

    const child = spawn(CC_CLI, args, {
      env,
      // CC 的 cwd 必須是 workspace root，讓 `./.mcp.json` 解析正確，
      // 且 CC 向上尋 `.claude/agents/design-artifact.md` 能找到專案級 agent。
      cwd: WORKSPACE_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      shell: useShell,
    });

    let gotResult = false;
    let cancelled = false;
    let timedOut = false;
    let sessionCaptured = false;

    // 120s timeout
    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) child.kill("SIGKILL");
      }, SIGKILL_DELAY_MS);
    }, TURN_TIMEOUT_MS);

    // cancel 回調
    const killFn = () => {
      cancelled = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) child.kill("SIGKILL");
      }, SIGKILL_DELAY_MS);
    };
    registerCancel?.(killFn);

    // 處理 stdout（NDJSON stream）
    let buffer = "";
    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // 首次出現 session_id 時寫入 DB（ADR-002：所有 event 都有 top-level session_id）
        if (!sessionCaptured) {
          try {
            const obj = JSON.parse(trimmed) as { session_id?: string };
            if (obj.session_id) {
              sessionCaptured = true;
              import("../db/client.js").then(({ updateSessionId }) => {
                updateSessionId(db, projectSlug, obj.session_id!);
              });
            }
          } catch { /* ignore */ }
        }

        const events = parseStreamLine(trimmed, projectSlug, messageId, db);
        for (const ev of events) {
          if (ev.type === "turn-end") {
            gotResult = true;
          }
          onEvent(ev);
        }
      }
    });

    let authErrorSent = false;

    // 處理 stderr
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      if (text.includes("Please run claude login") || text.includes("not authenticated")) {
        authErrorSent = true;
        onEvent({
          type: "error",
          projectSlug,
          code: "CC_NOT_AUTHENTICATED",
          message: "Please run claude login first",
        });
      }
    });

    child.on("close", (code) => {
      clearTimeout(timeoutHandle);

      if (!gotResult) {
        // Spawn exit 沒有 result event
        const reason = timedOut ? "timeout" : cancelled ? "cancelled" : "error";
        onEvent({
          type: "turn-end",
          projectSlug,
          messageId,
          reason,
        });
      }

      if (code !== 0 && !gotResult && !timedOut && !cancelled && !authErrorSent) {
        reject(new Error(`CC process exited with code ${code}`));
      } else {
        resolve();
      }
    });

    child.on("error", (err) => {
      clearTimeout(timeoutHandle);
      onEvent({
        type: "error",
        projectSlug,
        code: "CC_SPAWN_FAILED",
        message: err.message,
      });
      resolve(); // don't reject — turn-end was already sent
    });
  });
}
