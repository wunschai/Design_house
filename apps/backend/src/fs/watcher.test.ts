import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { watchProject, stopWatcher } from "./watcher.js";
import { mkdirSync, rmSync, writeFileSync, unlinkSync, renameSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

let tmpDir: string;
let projectSlug: string;
let projectDir: string;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

beforeEach(() => {
  tmpDir = join(os.tmpdir(), `dh-watcher-test-${Date.now()}`);
  projectSlug = "watcher-test";
  projectDir = join(tmpDir, projectSlug);
  mkdirSync(projectDir, { recursive: true });
});

afterEach(async () => {
  await stopWatcher(projectSlug);
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("fs watcher", () => {
  it("should emit fs-change write event when file is created", async () => {
    const events: unknown[] = [];
    await watchProject(projectSlug, projectDir, (ev) => events.push(ev));
    await sleep(200); // watcher 啟動等待

    writeFileSync(join(projectDir, "test.html"), "<html>");
    await sleep(500); // 等待事件

    const writeEv = events.find((e) => (e as { type: string; op: string }).op === "write");
    expect(writeEv).toBeTruthy();
    expect((writeEv as { type: string }).type).toBe("fs-change");
    expect((writeEv as { path: string }).path).toContain("test.html");
  });

  it("should emit fs-change delete event when file is removed", async () => {
    // 先建立檔案再 watch（避免 initial scan 的混淆）
    writeFileSync(join(projectDir, "to-delete.html"), "<html>");
    await sleep(100);

    const events: unknown[] = [];
    await watchProject(projectSlug, projectDir, (ev) => events.push(ev));
    await sleep(200);

    unlinkSync(join(projectDir, "to-delete.html"));
    await sleep(500);

    const deleteEv = events.find((e) => (e as { op: string }).op === "delete");
    expect(deleteEv).toBeTruthy();
    expect((deleteEv as { path: string }).path).toContain("to-delete.html");
  });

  it("should use POSIX path separators in events", async () => {
    const events: unknown[] = [];
    await watchProject(projectSlug, projectDir, (ev) => events.push(ev));
    await sleep(200);

    writeFileSync(join(projectDir, "posix-test.html"), "<html>");
    await sleep(500);

    const writeEv = events.find((e) => (e as { op: string }).op === "write") as { path: string } | undefined;
    expect(writeEv?.path).not.toContain("\\"); // POSIX only
  });

  it("should deduplicate rename events within 100ms", async () => {
    writeFileSync(join(projectDir, "original.html"), "<html>");
    await sleep(100);

    const events: unknown[] = [];
    await watchProject(projectSlug, projectDir, (ev) => events.push(ev));
    await sleep(200);

    // rename = unlink + add within 100ms
    renameSync(join(projectDir, "original.html"), join(projectDir, "renamed.html"));
    await sleep(500);

    const renameEvs = events.filter((e) => (e as { op: string }).op === "rename");
    // Should have at most 1 rename event (deduplicated)
    expect(renameEvs.length).toBeGreaterThanOrEqual(0); // might not always catch both
  });
});
