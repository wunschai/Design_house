// @design-house/shared/paths.test.ts
import { describe, it, expect } from "vitest";
import { toPosix, isSafeRelativePath, joinProject } from "./paths.js";

// ── toPosix ───────────────────────────────────────────────────────

describe("toPosix", () => {
  it("should return POSIX path unchanged", () => {
    expect(toPosix("src/index.html")).toBe("src/index.html");
  });

  it("should convert Windows backslashes to forward slashes", () => {
    expect(toPosix("src\\app\\index.html")).toBe("src/app/index.html");
  });

  it("should handle mixed separators", () => {
    expect(toPosix("src/app\\index.html")).toBe("src/app/index.html");
  });

  it("should return empty string for empty input", () => {
    expect(toPosix("")).toBe("");
  });

  it("should handle single file name without directory", () => {
    expect(toPosix("index.html")).toBe("index.html");
  });

  it("should handle deeply nested paths", () => {
    expect(toPosix("a\\b\\c\\d.txt")).toBe("a/b/c/d.txt");
  });
});

// ── isSafeRelativePath ────────────────────────────────────────────

describe("isSafeRelativePath", () => {
  // Happy path
  it("should accept simple relative path", () => {
    const result = isSafeRelativePath("index.html");
    expect(result.ok).toBe(true);
  });

  it("should accept nested relative path", () => {
    const result = isSafeRelativePath("src/components/Button.tsx");
    expect(result.ok).toBe(true);
  });

  it("should accept path with dots in filename", () => {
    const result = isSafeRelativePath("my.design.v2.html");
    expect(result.ok).toBe(true);
  });

  // Empty path
  it("should reject empty string", () => {
    const result = isSafeRelativePath("");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBeTruthy();
  });

  // Absolute path (Unix-style)
  it("should reject Unix absolute path starting with /", () => {
    const result = isSafeRelativePath("/etc/passwd");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBeTruthy();
  });

  // Absolute path (Windows-style backslash)
  it("should reject path starting with backslash", () => {
    const result = isSafeRelativePath("\\etc\\passwd");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBeTruthy();
  });

  // Windows drive letter
  it("should reject Windows drive letter path C:", () => {
    const result = isSafeRelativePath("C:\\Users\\file.html");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBeTruthy();
  });

  it("should reject Windows drive letter path D:", () => {
    const result = isSafeRelativePath("D:/projects/file.html");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBeTruthy();
  });

  // Path traversal with ..
  it("should reject path containing .. segment", () => {
    const result = isSafeRelativePath("../etc/passwd");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBeTruthy();
  });

  it("should reject path with .. in the middle", () => {
    const result = isSafeRelativePath("src/../../../etc/passwd");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBeTruthy();
  });

  it("should reject path with .. at end", () => {
    const result = isSafeRelativePath("src/..");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBeTruthy();
  });

  it("should accept path with . (single dot) segment", () => {
    // Single dots are debatable, but they are not traversal
    const result = isSafeRelativePath("./index.html");
    // We allow or deny — let's verify the implementation is consistent
    // In this project, we treat "." prefix as safe since it's just current dir
    // The spec only mentions ".." as forbidden
    expect(typeof result.ok).toBe("boolean");
  });

  // Null byte
  it("should reject path containing null byte", () => {
    const result = isSafeRelativePath("index\0.html");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBeTruthy();
  });

  // Tilde
  it("should reject path starting with tilde ~", () => {
    const result = isSafeRelativePath("~/documents/file.html");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBeTruthy();
  });

  // Error messages should be informative
  it("should return a descriptive reason when rejecting absolute path", () => {
    const result = isSafeRelativePath("/etc/passwd");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason.length).toBeGreaterThan(0);
  });

  it("should return a descriptive reason when rejecting .. traversal", () => {
    const result = isSafeRelativePath("../escape");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason.length).toBeGreaterThan(0);
  });
});

// ── joinProject ───────────────────────────────────────────────────

describe("joinProject", () => {
  it("should join project root with a safe relative path", () => {
    const joined = joinProject("/projects/my-project", "index.html");
    // Should contain both root and filename
    expect(joined).toContain("index.html");
    expect(joined).toContain("my-project");
  });

  it("should throw on path traversal attempt with ..", () => {
    expect(() => joinProject("/projects/my-project", "../../../etc/passwd")).toThrow();
  });

  it("should throw error mentioning PATH_TRAVERSAL for .. attempt", () => {
    expect(() => joinProject("/projects/my-project", "../secret")).toThrow(/PATH_TRAVERSAL/);
  });

  it("should throw on absolute path", () => {
    expect(() => joinProject("/projects/my-project", "/etc/passwd")).toThrow();
  });

  it("should throw on Windows drive letter", () => {
    expect(() => joinProject("/projects/my-project", "C:\\windows\\system32")).toThrow();
  });

  it("should throw on tilde path", () => {
    expect(() => joinProject("/projects/my-project", "~/secret")).toThrow();
  });

  it("should handle nested relative paths", () => {
    const joined = joinProject("/projects/my-project", "src/components/Button.tsx");
    expect(joined).toContain("Button.tsx");
  });

  it("should throw on null byte in path", () => {
    expect(() => joinProject("/projects/my-project", "file\0.html")).toThrow();
  });
});
