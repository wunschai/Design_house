// chokidar fs watcher — 每專案 watch projects/<slug>/
// write/delete → WS fs-change；rename dedupe 100ms
import chokidar from "chokidar";
import type { FSWatcher } from "chokidar";
import { toPosix } from "@design-house/shared/paths";
import type { FsChangeEvent } from "@design-house/shared/events";

type FsEventCallback = (event: FsChangeEvent) => void;

// 活躍 watcher map
const _watchers = new Map<string, FSWatcher>();

// rename dedupe state：Map<projectSlug, pending unlink queue>
// 每筆紀錄 unlink 的路徑與 timer；100ms 內若出現 add 事件則配對成 rename。
type PendingUnlink = { path: string; timer: NodeJS.Timeout };
const _pendingUnlinks = new Map<string, PendingUnlink[]>();

const RENAME_DEDUPE_MS = 100;

function getPending(slug: string): PendingUnlink[] {
  let q = _pendingUnlinks.get(slug);
  if (!q) {
    q = [];
    _pendingUnlinks.set(slug, q);
  }
  return q;
}

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
    const pending = getPending(projectSlug);

    if (pending.length > 0) {
      // 100ms 內曾有 unlink — 視為 rename。取最舊的 pending unlink 作為 oldPath。
      const oldest = pending.shift()!;
      clearTimeout(oldest.timer);
      if (oldest.path === relPath) {
        // 同路徑 unlink+add 快速連發 — 視為 atomic overwrite，發 write
        onEvent({ type: "fs-change", projectSlug, op: "write", path: relPath });
      } else {
        // 不同路徑 — 真正的 rename，oldPath 才是剛消失的檔
        onEvent({
          type: "fs-change",
          projectSlug,
          op: "rename",
          path: relPath,
          oldPath: oldest.path,
        });
      }
      return;
    }

    onEvent({ type: "fs-change", projectSlug, op: "write", path: relPath });
  });

  watcher.on("change", (fullPath) => {
    const relPath = toRelativePosix(fullPath, projectDir);
    onEvent({ type: "fs-change", projectSlug, op: "write", path: relPath });
  });

  watcher.on("unlink", (fullPath) => {
    const relPath = toRelativePosix(fullPath, projectDir);
    const pending = getPending(projectSlug);

    // 設 100ms timer；若期間有 add 會被 add handler shift 消費變 rename 或 write；
    // timer fire 仍存在 pending 時視為真正 delete。
    const pendingEntry: PendingUnlink = {
      path: relPath,
      timer: setTimeout(() => {
        const q = _pendingUnlinks.get(projectSlug);
        if (!q) return;
        const idx = q.indexOf(pendingEntry);
        if (idx !== -1) {
          q.splice(idx, 1);
          onEvent({ type: "fs-change", projectSlug, op: "delete", path: relPath });
        }
      }, RENAME_DEDUPE_MS),
    };
    pending.push(pendingEntry);
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
  // 清除 pending unlink timers for this project
  const q = _pendingUnlinks.get(projectSlug);
  if (q) {
    for (const p of q) clearTimeout(p.timer);
    _pendingUnlinks.delete(projectSlug);
  }
}

/**
 * 停止所有 watcher（backend shutdown 時用）。
 */
export async function stopAllWatchers(): Promise<void> {
  const slugs = [..._watchers.keys()];
  await Promise.all(slugs.map(stopWatcher));
}
