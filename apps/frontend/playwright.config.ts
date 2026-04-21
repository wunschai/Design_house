import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config — v0 smoke test driving the full stack
 * (backend + frontend) via `pnpm dev`. Backend must be reachable at
 * 127.0.0.1:31823; Vite dev server at 127.0.0.1:5173 proxies /api
 * and /ws back to backend.
 *
 * The webServer block auto-launches `pnpm dev` before tests and
 * tears it down after. If you have a server already running manually,
 * set `DH_PLAYWRIGHT_REUSE_SERVER=1` to skip spawn.
 */
const reuse = process.env["DH_PLAYWRIGHT_REUSE_SERVER"] === "1";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:5173",
    headless: true,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: reuse
    ? undefined
    : [
        {
          command: "pnpm --filter @design-house/backend dev",
          url: "http://127.0.0.1:31823/health",
          cwd: "../..",
          timeout: 30_000,
          reuseExistingServer: !process.env["CI"],
          stdout: "pipe",
          stderr: "pipe",
        },
        {
          command: "pnpm --filter @design-house/frontend exec vite --host 127.0.0.1 --port 5173",
          url: "http://127.0.0.1:5173",
          cwd: "../..",
          timeout: 30_000,
          reuseExistingServer: !process.env["CI"],
          stdout: "pipe",
          stderr: "pipe",
        },
      ],
});
