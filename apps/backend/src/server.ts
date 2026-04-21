// Backend entrypoint — reads PORT env, binds 127.0.0.1, fail-fast on EADDRINUSE
import { buildApp } from "./app.js";
import { createDb, listProjects, insertProject, insertSession } from "./db/client.js";
import { checkCcHealth, setHealthStatus } from "./cc/health.js";
import { watchProject, stopAllWatchers } from "./fs/watcher.js";
import { killAllActiveProcesses } from "./cc/session.js";
import { existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { WORKSPACE_ROOT, PROJECTS_ROOT, DB_PATH } from "./util/workspace.js";

const PORT = parseInt(process.env["PORT"] ?? "31823", 10);

async function main(): Promise<void> {
  console.log(`[server] Workspace root: ${WORKSPACE_ROOT}`);
  // 建立必要目錄（皆相對 workspace root、不受 process.cwd() 影響）
  mkdirSync(dirname(DB_PATH), { recursive: true });
  mkdirSync(PROJECTS_ROOT, { recursive: true });

  // 建立 DB
  const db = createDb(DB_PATH);

  // First-run: 若 projects table 空，建立 untitled-<timestamp> 預設專案（AC-2.1）
  const existingProjects = listProjects(db);
  if (existingProjects.length === 0) {
    const ts = Date.now();
    const slug = `untitled-${ts}`;
    const projectDir = join(PROJECTS_ROOT, slug);
    mkdirSync(projectDir, { recursive: true });
    insertProject(db, { slug, name: `Untitled ${new Date(ts).toLocaleString()}` });
    insertSession(db, { project_slug: slug, cc_session_id: null });
    console.log(`[server] Created default project: ${slug}`);
  }

  // CC health check（不 fail-fast，UI 訂閱時會收到 error event，AC-7.1/7.2）
  const health = checkCcHealth();
  setHealthStatus(health);
  if (!health.ok) {
    console.warn(`[server] CC health check: ${health.code} — ${health.message}`);
  }

  // 建立 Fastify app
  const app = await buildApp({ db, projectsRoot: PROJECTS_ROOT });

  // 啟動各 project 的 fs watcher
  const projects = listProjects(db);
  for (const project of projects) {
    const projectDir = join(PROJECTS_ROOT, project.slug);
    if (existsSync(projectDir)) {
      import("./routes/ws.js").then(({ broadcast }) => {
        watchProject(project.slug, projectDir, (ev) => {
          broadcast(project.slug, ev);
        }).catch((err) => {
          console.error(`[server] Failed to watch ${project.slug}:`, err);
        });
      }).catch(() => { /* ignore */ });
    }
  }

  // 啟動 HTTP server（NFR-1: 綁 127.0.0.1）
  try {
    await app.listen({ port: PORT, host: "127.0.0.1" });
    console.log(`[server] Listening on http://127.0.0.1:${PORT}`);
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === "EADDRINUSE") {
      console.error(
        `[server] Port ${PORT} is already in use. Try: PORT=${PORT + 1} pnpm dev`
      );
      process.exit(1);
    }
    throw err;
  }

  // Graceful shutdown（NFR-13）
  async function shutdown() {
    console.log("\n[server] Shutting down...");
    killAllActiveProcesses();   // 先 kill CC subprocess 避免 orphan
    await stopAllWatchers();
    await app.close();
    db.close();
    process.exit(0);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[server] Fatal error:", err);
  process.exit(1);
});
