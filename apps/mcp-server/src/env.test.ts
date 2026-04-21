// env.test.ts — Task 3.B.1 Red
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// 我們需要動態 import 以在每個測試前重置 env
describe("loadEnv", () => {
  const REQUIRED_VARS = [
    "DH_INTERNAL_TOKEN",
    "DH_WEB_PORT",
    "DH_PROJECT_ROOT",
    "DH_PROJECT_SLUG",
  ] as const;

  const VALID_ENV = {
    DH_INTERNAL_TOKEN: "abc123token",
    DH_WEB_PORT: "31823",
    DH_PROJECT_ROOT: "/projects/my-project",
    DH_PROJECT_SLUG: "my-project",
  };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should return env object when all required vars are set", async () => {
    vi.stubEnv("DH_INTERNAL_TOKEN", VALID_ENV.DH_INTERNAL_TOKEN);
    vi.stubEnv("DH_WEB_PORT", VALID_ENV.DH_WEB_PORT);
    vi.stubEnv("DH_PROJECT_ROOT", VALID_ENV.DH_PROJECT_ROOT);
    vi.stubEnv("DH_PROJECT_SLUG", VALID_ENV.DH_PROJECT_SLUG);

    const { loadEnv } = await import("./env.js");
    const result = loadEnv();

    expect(result).toEqual({
      DH_INTERNAL_TOKEN: "abc123token",
      DH_WEB_PORT: "31823",
      DH_PROJECT_ROOT: "/projects/my-project",
      DH_PROJECT_SLUG: "my-project",
    });
  });

  for (const missing_var of REQUIRED_VARS) {
    it(`should call process.exit(1) when ${missing_var} is missing`, async () => {
      // Set all vars except the one being tested
      for (const v of REQUIRED_VARS) {
        if (v !== missing_var) {
          vi.stubEnv(v, VALID_ENV[v]);
        }
      }
      vi.stubEnv(missing_var, undefined as unknown as string);

      const mockExit = vi.spyOn(process, "exit").mockImplementation((() => {
        throw new Error("process.exit called");
      }) as never);
      const mockStderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

      // env.ts 在 module-level 執行 loadEnv()，缺 var 時 import 本身會 throw
      await expect(import("./env.js")).rejects.toThrow("process.exit called");
      expect(mockExit).toHaveBeenCalledWith(1);
      expect(mockStderr).toHaveBeenCalled();

      mockExit.mockRestore();
      mockStderr.mockRestore();
    });
  }

  it("should write missing var name to stderr", async () => {
    vi.stubEnv("DH_INTERNAL_TOKEN", undefined as unknown as string);
    vi.stubEnv("DH_WEB_PORT", VALID_ENV.DH_WEB_PORT);
    vi.stubEnv("DH_PROJECT_ROOT", VALID_ENV.DH_PROJECT_ROOT);
    vi.stubEnv("DH_PROJECT_SLUG", VALID_ENV.DH_PROJECT_SLUG);

    const mockExit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called");
    }) as never);
    const mockStderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    await expect(import("./env.js")).rejects.toThrow();

    // stderr 訊息要包含缺失的 var 名稱
    const stderrCall = mockStderr.mock.calls[0]?.[0];
    expect(typeof stderrCall === "string" ? stderrCall : String(stderrCall)).toContain(
      "DH_INTERNAL_TOKEN"
    );

    mockExit.mockRestore();
    mockStderr.mockRestore();
  });
});
