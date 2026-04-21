// @design-house/shared/mcp-tools.test.ts
import { describe, it, expect } from "vitest";
import {
  readFileInputSchema,
  readFileOutputSchema,
  writeFileInputSchema,
  writeFileOutputSchema,
  listFilesInputSchema,
  listFilesOutputSchema,
  showToUserInputSchema,
  showToUserOutputSchema,
  doneInputSchema,
  doneOutputSchema,
  McpErrorCode,
} from "./mcp-tools.js";

// ── read_file ─────────────────────────────────────────────────────

describe("readFileInputSchema", () => {
  it("should accept valid read_file input", () => {
    const result = readFileInputSchema.safeParse({ path: "index.html" });
    expect(result.success).toBe(true);
  });

  it("should reject empty path", () => {
    const result = readFileInputSchema.safeParse({ path: "" });
    expect(result.success).toBe(false);
  });

  it("should reject missing path", () => {
    const result = readFileInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("readFileOutputSchema", () => {
  it("should accept valid read_file output", () => {
    const result = readFileOutputSchema.safeParse({
      content: "<!DOCTYPE html>",
      encoding: "utf-8",
      size: 15,
    });
    expect(result.success).toBe(true);
  });

  it("should reject wrong encoding value", () => {
    const result = readFileOutputSchema.safeParse({
      content: "data",
      encoding: "base64",
      size: 4,
    });
    expect(result.success).toBe(false);
  });

  it("should reject missing size", () => {
    const result = readFileOutputSchema.safeParse({
      content: "data",
      encoding: "utf-8",
    });
    expect(result.success).toBe(false);
  });
});

// ── write_file ────────────────────────────────────────────────────

describe("writeFileInputSchema", () => {
  it("should accept valid write_file input", () => {
    const result = writeFileInputSchema.safeParse({
      path: "index.html",
      content: "<html></html>",
    });
    expect(result.success).toBe(true);
  });

  it("should reject empty path", () => {
    const result = writeFileInputSchema.safeParse({ path: "", content: "data" });
    expect(result.success).toBe(false);
  });

  it("should reject missing content", () => {
    const result = writeFileInputSchema.safeParse({ path: "index.html" });
    expect(result.success).toBe(false);
  });

  it("should reject extra fields (strict schema)", () => {
    // write_file should not accept asset / content_type / subtitle / viewport per spec
    const result = writeFileInputSchema.safeParse({
      path: "index.html",
      content: "<html></html>",
      asset: "some-asset",
    });
    expect(result.success).toBe(false);
  });
});

describe("writeFileOutputSchema", () => {
  it("should accept valid write_file output", () => {
    const result = writeFileOutputSchema.safeParse({ ok: true, bytesWritten: 13 });
    expect(result.success).toBe(true);
  });

  it("should reject ok: false in output", () => {
    const result = writeFileOutputSchema.safeParse({ ok: false, bytesWritten: 0 });
    expect(result.success).toBe(false);
  });

  it("should reject missing bytesWritten", () => {
    const result = writeFileOutputSchema.safeParse({ ok: true });
    expect(result.success).toBe(false);
  });
});

// ── list_files ────────────────────────────────────────────────────

describe("listFilesInputSchema", () => {
  it("should accept empty input (all optional)", () => {
    const result = listFilesInputSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("should accept with path and depth", () => {
    const result = listFilesInputSchema.safeParse({ path: "src", depth: 2 });
    expect(result.success).toBe(true);
  });

  it("should reject depth exceeding maximum of 5", () => {
    const result = listFilesInputSchema.safeParse({ depth: 6 });
    expect(result.success).toBe(false);
  });

  it("should reject depth of 0", () => {
    const result = listFilesInputSchema.safeParse({ depth: 0 });
    expect(result.success).toBe(false);
  });

  it("should reject extra field 'filter' (ADR-005 hardcode rule 8)", () => {
    const result = listFilesInputSchema.safeParse({ filter: "*.html" });
    expect(result.success).toBe(false);
  });

  it("should reject extra field 'offset' (ADR-005 hardcode rule 8)", () => {
    const result = listFilesInputSchema.safeParse({ offset: 10 });
    expect(result.success).toBe(false);
  });
});

describe("listFilesOutputSchema", () => {
  it("should accept valid list_files output without truncated", () => {
    const result = listFilesOutputSchema.safeParse({
      path: "src",
      entries: [
        { name: "index.html", type: "file", size: 100 },
        { name: "assets", type: "dir" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("should accept with truncated: true", () => {
    const result = listFilesOutputSchema.safeParse({
      path: ".",
      entries: [],
      truncated: true,
    });
    expect(result.success).toBe(true);
  });

  it("should reject entry type other than file or dir", () => {
    const result = listFilesOutputSchema.safeParse({
      path: ".",
      entries: [{ name: "link", type: "symlink" }],
    });
    expect(result.success).toBe(false);
  });

  it("should reject missing path", () => {
    const result = listFilesOutputSchema.safeParse({ entries: [] });
    expect(result.success).toBe(false);
  });
});

// ── show_to_user ──────────────────────────────────────────────────

describe("showToUserInputSchema", () => {
  it("should accept valid show_to_user input", () => {
    const result = showToUserInputSchema.safeParse({ path: "index.html" });
    expect(result.success).toBe(true);
  });

  it("should reject empty path", () => {
    const result = showToUserInputSchema.safeParse({ path: "" });
    expect(result.success).toBe(false);
  });
});

describe("showToUserOutputSchema", () => {
  it("should accept { ok: true }", () => {
    const result = showToUserOutputSchema.safeParse({ ok: true });
    expect(result.success).toBe(true);
  });

  it("should reject { ok: false }", () => {
    const result = showToUserOutputSchema.safeParse({ ok: false });
    expect(result.success).toBe(false);
  });
});

// ── done ─────────────────────────────────────────────────────────

describe("doneInputSchema", () => {
  it("should accept valid done input", () => {
    const result = doneInputSchema.safeParse({ path: "index.html" });
    expect(result.success).toBe(true);
  });

  it("should reject empty path", () => {
    const result = doneInputSchema.safeParse({ path: "" });
    expect(result.success).toBe(false);
  });
});

describe("doneOutputSchema", () => {
  it("should accept successful done output", () => {
    const result = doneOutputSchema.safeParse({
      ok: true,
      timedOut: false,
      consoleErrors: [],
    });
    expect(result.success).toBe(true);
  });

  it("should accept timed out done output", () => {
    const result = doneOutputSchema.safeParse({
      ok: false,
      timedOut: true,
      consoleErrors: [],
    });
    expect(result.success).toBe(true);
  });

  it("should accept done with console errors", () => {
    const result = doneOutputSchema.safeParse({
      ok: true,
      timedOut: false,
      consoleErrors: ["TypeError: x is not defined"],
    });
    expect(result.success).toBe(true);
  });

  it("should reject missing timedOut", () => {
    const result = doneOutputSchema.safeParse({ ok: true, consoleErrors: [] });
    expect(result.success).toBe(false);
  });
});

// ── McpErrorCode ─────────────────────────────────────────────────

describe("McpErrorCode", () => {
  it("should contain FILE_NOT_FOUND", () => {
    expect(McpErrorCode.FILE_NOT_FOUND).toBeDefined();
  });

  it("should contain PATH_TRAVERSAL", () => {
    expect(McpErrorCode.PATH_TRAVERSAL).toBeDefined();
  });

  it("should contain READ_ERROR", () => {
    expect(McpErrorCode.READ_ERROR).toBeDefined();
  });

  it("should contain WRITE_ERROR", () => {
    expect(McpErrorCode.WRITE_ERROR).toBeDefined();
  });

  it("should contain CONTENT_TOO_LARGE", () => {
    expect(McpErrorCode.CONTENT_TOO_LARGE).toBeDefined();
  });

  it("should contain DIR_NOT_FOUND", () => {
    expect(McpErrorCode.DIR_NOT_FOUND).toBeDefined();
  });
});
