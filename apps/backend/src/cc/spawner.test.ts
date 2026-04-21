import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnCc } from "./spawner.js";
import { createDb, insertProject, insertSession } from "../db/client.js";
import type Database from "better-sqlite3";
import { mkdirSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

const NEWLINE = "\n";

let db: Database.Database;
let tmpDir: string;

function buildFakeCcScript(outputLines: string[]): string {
  // 每行 NDJSON 輸出後跟一個真實換行符號
  // process.stdout.write 用 Buffer.from 避免 \n escape 問題
  const hexLines = outputLines.map((line) => {
    const hex = Buffer.from(line + "\n").toString("hex");
    return `process.stdout.write(Buffer.from("${hex}", "hex"));`;
  });
  return [
    "// fake CC stub",
    ...hexLines,
    "",
  ].join("\n");
}

function makeFakeCc(script: string): void {
  const nodeScript = join(tmpDir, "fake-cc.cjs");
  writeFileSync(nodeScript, script);

  if (process.platform === "win32") {
    const cmdPath = join(tmpDir, "fake-cc.cmd");
    writeFileSync(cmdPath, `@echo off${NEWLINE}node "${nodeScript}"${NEWLINE}`);
    process.env["CC_PATH"] = cmdPath;
  } else {
    const shPath = join(tmpDir, "fake-cc");
    writeFileSync(shPath, `#!/bin/sh${NEWLINE}exec node "${nodeScript}"${NEWLINE}`);
    chmodSync(shPath, 0o755);
    process.env["CC_PATH"] = shPath;
  }
}

beforeEach(() => {
  tmpDir = join(os.tmpdir(), `dh-spawner-test-${Date.now()}`);
  mkdirSync(join(tmpDir, "projects", "test-proj"), { recursive: true });
  db = createDb(":memory:");
  insertProject(db, { slug: "test-proj", name: "Test" });
  insertSession(db, { project_slug: "test-proj", cc_session_id: null });
});

afterEach(() => {
  db.close();
  rmSync(tmpDir, { recursive: true, force: true });
  delete process.env["CC_PATH"];
});

describe("spawnCc", () => {
  it("should emit turn-end reason:complete when CC outputs result.success", async () => {
    const successEvent = JSON.stringify({ type: "result", subtype: "success", result: "done", session_id: "s1" });
    const deltaEvent = JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "hi" }] }, session_id: "s1" });
    makeFakeCc(buildFakeCcScript([deltaEvent, successEvent]));

    const events: unknown[] = [];
    await spawnCc({
      projectSlug: "test-proj",
      userMessage: "hello",
      messageId: "msg1",
      resumeSessionId: undefined,
      db,
      onEvent: (ev) => events.push(ev),
    });

    const turnEnd = events.find((e) => (e as { type: string }).type === "turn-end") as { reason: string } | undefined;
    expect(turnEnd).toBeTruthy();
    expect(turnEnd?.reason).toBe("complete");
  });

  it("should emit turn-end reason:error for error_during_execution", async () => {
    const errEvent = JSON.stringify({ type: "result", subtype: "error_during_execution", is_error: true, session_id: "s1" });
    makeFakeCc(buildFakeCcScript([errEvent]));

    const events: unknown[] = [];
    await spawnCc({
      projectSlug: "test-proj",
      userMessage: "test",
      messageId: "msg2",
      resumeSessionId: undefined,
      db,
      onEvent: (ev) => events.push(ev),
    });

    const turnEnd = events.find((e) => (e as { type: string }).type === "turn-end") as { reason: string } | undefined;
    expect(turnEnd?.reason).toBe("error");
  });

  it("should pass --resume flag when resumeSessionId is provided", async () => {
    // 透過 Windows cmd 的 %* 傳遞所有 args 到 node 並記錄
    const argsFile = join(tmpDir, "captured-args.json");
    const argsFileHex = Buffer.from(argsFile).toString("hex");
    const successEvent = JSON.stringify({ type: "result", subtype: "success", result: "", session_id: "s1" });
    const successHex = Buffer.from(successEvent + "\n").toString("hex");

    // 讓 node 腳本接收命令行參數（透過 cmd 的 %* 轉發）
    const nodeScript = join(tmpDir, "fake-cc-args.cjs");
    const nodeScriptHex = Buffer.from(nodeScript).toString("hex");
    writeFileSync(nodeScript, [
      `const fs = require("fs");`,
      `const argsFile = Buffer.from("${argsFileHex}", "hex").toString();`,
      `fs.writeFileSync(argsFile, JSON.stringify(process.argv.slice(2)));`,
      `process.stdout.write(Buffer.from("${successHex}", "hex"));`,
    ].join("\n"));

    if (process.platform === "win32") {
      // Windows .cmd 用 %* 把所有 args 轉發給 node
      const cmdPath = join(tmpDir, "fake-cc-args.cmd");
      writeFileSync(cmdPath, `@echo off\r\nnode "${nodeScript}" %*\r\n`);
      process.env["CC_PATH"] = cmdPath;
    } else {
      const shPath = join(tmpDir, "fake-cc-args");
      writeFileSync(shPath, `#!/bin/sh\nexec node "${nodeScript}" "$@"\n`);
      chmodSync(shPath, 0o755);
      process.env["CC_PATH"] = shPath;
    }

    await spawnCc({
      projectSlug: "test-proj",
      userMessage: "test",
      messageId: "msg3",
      resumeSessionId: "my-session-id",
      db,
      onEvent: () => {},
    });

    const { readFileSync } = await import("node:fs");
    const capturedArgs = JSON.parse(readFileSync(argsFile, "utf-8")) as string[];
    expect(capturedArgs).toContain("--resume");
    expect(capturedArgs).toContain("my-session-id");
  });

  it("should emit error CC_NOT_AUTHENTICATED when stderr contains login prompt", async () => {
    const authMsg = Buffer.from("Please run claude login to authenticate\n").toString("hex");
    const script = [
      `process.stderr.write(Buffer.from("${authMsg}", "hex"));`,
    ].join("\n");
    makeFakeCc(script);

    const events: unknown[] = [];
    await spawnCc({
      projectSlug: "test-proj",
      userMessage: "test",
      messageId: "msg4",
      resumeSessionId: undefined,
      db,
      onEvent: (ev) => events.push(ev),
    });

    expect(events.some((e) => (e as { code?: string }).code === "CC_NOT_AUTHENTICATED")).toBe(true);
  });
});
