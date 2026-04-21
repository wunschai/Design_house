// @design-house/shared/mcp-tools
import { z } from "zod";

// ── MCP Error Code ────────────────────────────────────────────────

export const McpErrorCode = {
  FILE_NOT_FOUND: "FILE_NOT_FOUND",
  PATH_TRAVERSAL: "PATH_TRAVERSAL",
  READ_ERROR: "READ_ERROR",
  WRITE_ERROR: "WRITE_ERROR",
  CONTENT_TOO_LARGE: "CONTENT_TOO_LARGE",
  DIR_NOT_FOUND: "DIR_NOT_FOUND",
} as const;

export type McpErrorCodeValue = (typeof McpErrorCode)[keyof typeof McpErrorCode];

// ── read_file ─────────────────────────────────────────────────────

export const readFileInputSchema = z
  .object({
    path: z.string().min(1),
  })
  .strict();

export const readFileOutputSchema = z.object({
  content: z.string(),
  encoding: z.literal("utf-8"),
  size: z.number().int().nonnegative(),
});

export type ReadFileInput = z.infer<typeof readFileInputSchema>;
export type ReadFileOutput = z.infer<typeof readFileOutputSchema>;

// ── write_file ────────────────────────────────────────────────────

export const writeFileInputSchema = z
  .object({
    path: z.string().min(1),
    content: z.string(),
  })
  .strict();

export const writeFileOutputSchema = z.object({
  ok: z.literal(true),
  bytesWritten: z.number().int().nonnegative(),
});

export type WriteFileInput = z.infer<typeof writeFileInputSchema>;
export type WriteFileOutput = z.infer<typeof writeFileOutputSchema>;

// ── list_files ────────────────────────────────────────────────────

export const listFilesInputSchema = z
  .object({
    path: z.string().min(1).optional(),
    depth: z.number().int().min(1).max(5).optional(),
  })
  .strict();

export const listFilesOutputSchema = z.object({
  path: z.string(),
  entries: z.array(
    z.object({
      name: z.string(),
      type: z.enum(["file", "dir"]),
      size: z.number().int().nonnegative().optional(),
    })
  ),
  truncated: z.literal(true).optional(),
});

export type ListFilesInput = z.infer<typeof listFilesInputSchema>;
export type ListFilesOutput = z.infer<typeof listFilesOutputSchema>;

// ── show_to_user ──────────────────────────────────────────────────

export const showToUserInputSchema = z
  .object({
    path: z.string().min(1),
  })
  .strict();

export const showToUserOutputSchema = z.object({
  ok: z.literal(true),
});

export type ShowToUserInput = z.infer<typeof showToUserInputSchema>;
export type ShowToUserOutput = z.infer<typeof showToUserOutputSchema>;

// ── done ─────────────────────────────────────────────────────────

export const doneInputSchema = z
  .object({
    path: z.string().min(1),
  })
  .strict();

export const doneOutputSchema = z.object({
  ok: z.boolean(),
  timedOut: z.boolean(),
  consoleErrors: z.array(z.string()),
});

export type DoneInput = z.infer<typeof doneInputSchema>;
export type DoneOutput = z.infer<typeof doneOutputSchema>;
