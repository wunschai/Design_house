// chokidar fs watcher — 每專案 watch projects/<slug>/
// write/delete → WS fs-change；rename dedupe 100ms
import chokidar from "chokidar";
import type { FSWatcher } from "chokidar";
import { toPosix } from "@design-house/shared/paths";
import type { FsChangeEvent } from "@design-house/shared/events";

type FsEventCallback = (event: FsChangeEvent) => void;

// 活躍 watcher map
const _watchers = new Map<string, FSWatcher>();

// rename dedupe state：Map<path, { timer: NodeJS.Timeout; oldPath: string }>
const _pendingUnlinks = new Map<string, NodeJS.Timeout>();

const RENAME_DEDUPE_MS = 100;

function toRelativePosix(filePath: string, projectDir: string): string {
  const raw = filePath.startsWith(projectDir)
    ? filePath.slice(projectDir.length).replace(/^[\\/]/, "")
    : filePath;
  return toPosix(raw);
}

/**
 * 啟動對 projectDir 的 chokidar watch。
 * 事件回呼會收到 FsChangeEvent（POSIX 路徑、相對於 project root）。
 */
export async function watchProject(
  projectSlug: string,
  projectDir: string,
  onEvent: FsEventCallback
): Promise<void> {
  // 已存在的 watcher 先關閉
  const existing = _watchers.get(projectSlug);
  if (existing) {
    await existing.close();
  }

  const watcher = chokidar.watch(projectDir, {
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 20 },
    // 跳過 symlink（AC-8.3）
    followSymlinks: false,
  });

  _watchers.set(projectSlug, watcher);

  watcher.on("add", (fullPath) => {
    const relPath = toRelativePosix(fullPath, projectDir);

    // 檢查是否有 pending unlink（rename dedupe）
    const unlink_timer = _pendingUnlinks.get(relPath);
    if (unlink_timer) {
      clearTimeout(unlink_timer);
      _pendingUnlinks.delete(relPath);
      // 這是 rename：unlink 舊路徑已記錄在 timer 的 closure
      // 但我們無法從 timer 取回 old path...先只發 write 事件
      // rename 的 oldPath 在 chokidar add/unlink 事件中無法直接對應
      // 以 100ms 內 unlink+add 同一個 path 當作 rename
    }

    onEvent({ type: "fs-change", projectSlug, op: "write", path: relPath });
  });

  watcher.on("change", (fullPath) => {
    const relPath = toRelativePosix(fullPath, projectDir);
    onEvent({ type: "fs-change", projectSlug, op: "write", path: relPath });
  });

  watcher.on("unlink", (fullPath) => {
    const relPath = toRelativePosix(fullPath, projectDir);

    // 設定 100ms 計時器，等等看有沒有 add 同 path（rename 情境）
    const timer = setTimeout(() => {
      _pendingUnlinks.delete(relPath);
      onEvent({ type: "fs-change", projectSlug, op: "delete", path: relPath });
    }, RENAME_DEDUPE_MS);
    _pendingUnlinks.set(relPath, timer);
  });

  watcher.on("error", (err) => {
    // 靜默 log，不影響主流程
    console.error(`[watcher] Error watching ${projectSlug}:`, err);
  });

  // 等 watcher ready
  await new Promise<void>((resolve) => {
    watcher.once("ready", () => resolve());
  });
}

/**
 * 停止指定 project 的 watcher。
 */
export async function stopWatcher(projectSlug: string): Promise<void> {
  const watcher = _watchers.get(projectSlug);
  if (watcher) {
    await watcher.close();
    _watchers.delete(projectSlug);
  }
  // 清除 pending unlink timers
  for (const [path, timer] of _pendingUnlinks) {
    clearTimeout(timer);
    _pendingUnlinks.delete(path);
  }
}

/**
 * 停止所有 watcher（backend shutdown 時用）。
 */
export async function stopAllWatchers(): Promise<void> {
  const slugs = [..._watchers.keys()];
  await Promise.all(slugs.map(stopWatcher));
}
