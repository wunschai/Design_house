// list_files.ts — Task 3.B.10 Green
import * as fs from "node:fs";
import * as path from "node:path";
import { joinProject, PathTraversalError } from "@design-house/shared/paths";
import { listFilesInputSchema } from "@design-house/shared/mcp-tools";
import { env } from "../env.js";

const MAX_ENTRIES = 1000;
const DEFAULT_DEPTH = 1;

type Entry = { name: string; type: "file" | "dir"; size?: number };

type McpErrorResult = {
  isError: true;
  content: Array<{ type: "text"; text: string }>;
};

function errorResult(text: string): McpErrorResult {
  return { isError: true, content: [{ type: "text", text }] };
}

function collectEntries(
  dirPath: string,
  projectRootReal: string,
  currentDepth: number,
  maxDepth: number,
  entries: Entry[]
): void {
  if (currentDepth > maxDepth) return;
  if (entries.length >= MAX_ENTRIES) return;

  let dirEntries: fs.Dirent[];
  try {
    dirEntries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  // 字母序排序
  dirEntries.sort((a, b) => a.name.localeCompare(b.name));

  for (const dirent of dirEntries) {
    if (entries.length >= MAX_ENTRIES) break;

    // symlink 檢查：若指向 projectRoot 外則跳過
    if (dirent.isSymbolicLink()) {
      try {
        const symlinkTarget = fs.realpathSync(path.join(dirPath, dirent.name));
        if (!symlinkTarget.startsWith(projectRootReal)) {
          continue; // 跳過跨出 boundary 的 symlink
        }
      } catch {
        continue; // realpath 失敗（dangling symlink 等）也跳過
      }
    }

    if (dirent.isDirectory() || (dirent.isSymbolicLink() && isDirectory(path.join(dirPath, dirent.name)))) {
      entries.push({ name: dirent.name, type: "dir" });
      // 遞迴列下一層
      collectEntries(
        path.join(dirPath, dirent.name),
        projectRootReal,
        currentDepth + 1,
        maxDepth,
        entries
      );
    } else if (dirent.isFile()) {
      let size: number | undefined;
      try {
        size = fs.statSync(path.join(dirPath, dirent.name)).size;
      } catch {
        // 忽略 stat 失敗
      }
      entries.push({ name: dirent.name, type: "file", size });
    }
  }
}

function isDirectory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export async function listFilesTool(input: unknown): Promise<
  | { path: string; entries: Entry[]; truncated?: true }
  | McpErrorResult
> {
  // 1. 輸入驗證
  const parseResult = listFilesInputSchema.safeParse(input);
  if (!parseResult.success) {
    return errorResult(`INVALID_INPUT: ${parseResult.error.message}`);
  }
  const { path: relPath = ".", depth = DEFAULT_DEPTH } = parseResult.data;

  // 2. 字串層 path guard
  let nativePath: string;
  if (relPath === ".") {
    nativePath = env.DH_PROJECT_ROOT;
  } else {
    try {
      nativePath = joinProject(env.DH_PROJECT_ROOT, relPath);
    } catch (e) {
      if (e instanceof PathTraversalError) {
        return errorResult(`PATH_TRAVERSAL: ${e.message}`);
      }
      throw e;
    }
  }

  // 3. runtime 層 symlink boundary check
  let dirRealPath: string;
  try {
    const projectRootReal = fs.realpathSync(env.DH_PROJECT_ROOT);
    dirRealPath = fs.realpathSync(nativePath);
    if (dirRealPath !== projectRootReal && !dirRealPath.startsWith(projectRootReal + path.sep)) {
      return errorResult(`PATH_TRAVERSAL: symlink escapes project root`);
    }
  } catch (e) {
    const nodeErr = e as NodeJS.ErrnoException;
    if (nodeErr.code === "ENOENT") {
      return errorResult(`DIR_NOT_FOUND: ${relPath}`);
    }
    return errorResult(`PATH_TRAVERSAL: realpath check failed`);
  }

  // 4. 檢查是否為目錄
  try {
    const stat = fs.statSync(nativePath);
    if (!stat.isDirectory()) {
      return errorResult(`DIR_NOT_FOUND: ${relPath} is not a directory`);
    }
  } catch (e) {
    const nodeErr = e as NodeJS.ErrnoException;
    if (nodeErr.code === "ENOENT") {
      return errorResult(`DIR_NOT_FOUND: ${relPath}`);
    }
    throw e;
  }

  // 5. 列舉目錄
  const projectRootReal = fs.realpathSync(env.DH_PROJECT_ROOT);
  const entries: Entry[] = [];
  collectEntries(nativePath, projectRootReal, 1, depth, entries);

  const truncated = entries.length >= MAX_ENTRIES;
  const result: { path: string; entries: Entry[]; truncated?: true } = {
    path: relPath,
    entries: entries.slice(0, MAX_ENTRIES),
  };
  if (truncated) {
    result.truncated = true;
  }
  return result;
}
