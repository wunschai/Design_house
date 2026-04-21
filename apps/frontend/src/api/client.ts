// API client — typed fetch wrapper for Design House REST endpoints
import type { ProjectRow, MessageRow } from "@design-house/shared/db-types";

// ── Response shapes ─────────────────────────────────────────────────

export interface ApiProject {
  slug: string;
  name: string;
  createdAt: string;
  lastActivityAt?: string;
  messageCount?: number;
}

export interface ApiMessage {
  id: string;
  projectSlug: string;
  role: MessageRow["role"];
  content: string;
  toolUseId?: string;
  toolName?: string;
  isError?: boolean;
  createdAt: string;
}

export interface FileEntry {
  name: string;
  type: "file" | "dir";
  size?: number;
}

export interface FileTree {
  path: string;
  entries: FileEntry[];
}

export interface ListMessagesOptions {
  limit?: number;
  before?: string;
}

export interface ListFilesOptions {
  path?: string;
  depth?: number;
}

// ── Base fetch helper ────────────────────────────────────────────────

async function apiFetch<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

// ── Project endpoints ────────────────────────────────────────────────

export async function listProjects(): Promise<ApiProject[]> {
  return apiFetch<ApiProject[]>("/api/projects");
}

export async function createProject(name: string): Promise<ApiProject> {
  return apiFetch<ApiProject>("/api/projects", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function getProject(slug: string): Promise<ApiProject> {
  return apiFetch<ApiProject>(`/api/projects/${slug}`);
}

export async function deleteProject(slug: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/api/projects/${slug}`, { method: "DELETE" });
}

// ── Message endpoints ────────────────────────────────────────────────

export async function listMessages(
  slug: string,
  options: ListMessagesOptions = {}
): Promise<ApiMessage[]> {
  const params = new URLSearchParams();
  if (options.limit !== undefined) params.set("limit", String(options.limit));
  if (options.before !== undefined) params.set("before", options.before);
  const query = params.toString() ? `?${params}` : "";
  return apiFetch<ApiMessage[]>(`/api/projects/${slug}/messages${query}`);
}

// ── File endpoints ────────────────────────────────────────────────────

export async function listFiles(
  slug: string,
  options: ListFilesOptions = {}
): Promise<FileTree> {
  const params = new URLSearchParams();
  if (options.path !== undefined) params.set("path", options.path);
  if (options.depth !== undefined) params.set("depth", String(options.depth));
  const query = params.toString() ? `?${params}` : "";
  return apiFetch<FileTree>(`/api/projects/${slug}/files${query}`);
}

/**
 * 組合 iframe src URL — 指向 backend 的靜態檔案端點
 * Dev 模式透過 Vite proxy 同 origin；Prod 模式 backend 直接 serve
 */
export function fileUrl(slug: string, path: string): string {
  return `/api/projects/${slug}/files/${path}`;
}

// Re-export types used throughout app
export type { ProjectRow };
