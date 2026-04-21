import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { checkCcHealth } from "./health.js";
import { writeFileSync, mkdirSync, rmSync, chmodSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(os.tmpdir(), `dh-health-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  delete process.env["CC_PATH"];
  rmSync(tmpDir, { recursive: true, force: true });
});

function makeFakeCC(versionOutput: string, pingStderr = ""): void {
  const cjsPath = join(tmpDir, "fake-cc.cjs");
  const args = Buffer.from("--version").toString("hex");

  writeFileSync(cjsPath, [
    `const args = process.argv.slice(2);`,
    `if (args.includes("--version")) {`,
    `  process.stdout.write(${JSON.stringify(versionOutput + "\n")});`,
    `  process.exit(0);`,
    `} else {`,
    `  process.stderr.write(${JSON.stringify(pingStderr + "\n")});`,
    `  process.exit(${pingStderr ? "1" : "0"});`,
    `}`,
  ].join("\n"));

  if (process.platform === "win32") {
    const cmdPath = join(tmpDir, "fake-cc.cmd");
    writeFileSync(cmdPath, `@echo off\r\nnode "${cjsPath}" %*\r\n`);
    process.env["CC_PATH"] = cmdPath;
  } else {
    const shPath = join(tmpDir, "fake-cc");
    writeFileSync(shPath, `#!/bin/sh\nexec node "${cjsPath}" "$@"\n`);
    chmodSync(shPath, 0o755);
    process.env["CC_PATH"] = shPath;
  }
}

describe("checkCcHealth", () => {
  it("should return ok:true when CC is installed and authenticated", () => {
    makeFakeCC("Claude Code 2.1.0", "");
    const status = checkCcHealth();
    expect(status.ok).toBe(true);
  });

  it("should return CC_NOT_INSTALLED when CC CLI is not found", () => {
    process.env["CC_PATH"] = "nonexistent-binary-xyz-123";
    const status = checkCcHealth();
    expect(status.ok).toBe(false);
    if (!status.ok) {
      expect(status.code).toBe("CC_NOT_INSTALLED");
    }
  });

  // 註：登入檢測刻意不在 checkCcHealth 做（避免阻塞啟動）。
  // 登入失敗會由 spawner.ts 的 stderr handler 捕到「Please run claude login」
  // 並 WS broadcast CC_NOT_AUTHENTICATED 給 UI。
  it("should return ok:true even when CC would fail auth — auth is verified lazily at spawn time", () => {
    makeFakeCC("Claude Code 2.1.0", "Please run claude login");
    const status = checkCcHealth();
    expect(status.ok).toBe(true);
  });
});
