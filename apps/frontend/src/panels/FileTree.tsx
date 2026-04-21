// FileTree panel — 檔案樹 + fs-change 增量更新 + 點選預覽
import { useState, useEffect, useCallback } from "react";
import { File, Folder } from "lucide-react";
import { ScrollArea } from "../components/ui/scroll-area";
import { listFiles, type FileEntry } from "../api/client";
import type { UseWsReturn } from "../hooks/use-ws";

// ── Types ─────────────────────────────────────────────────────────────

export interface FileTreeProps {
  projectSlug: string;
  ws: UseWsReturn;
  onSelect: (path: string) => void;
}

// ── Component ─────────────────────────────────────────────────────────

export default function FileTree({ projectSlug, ws, onSelect }: FileTreeProps) {
  const [entries, set_entries] = useState<FileEntry[]>([]);
  const [loading, set_loading] = useState(true);

  // 初始載入
  useEffect(() => {
    let cancelled = false;
    set_loading(true);
    listFiles(projectSlug, { depth: 5 })
      .then((tree) => {
        if (!cancelled) {
          set_entries(tree.entries);
          set_loading(false);
        }
      })
      .catch(() => {
        if (!cancelled) set_loading(false);
      });
    return () => { cancelled = true; };
  }, [projectSlug]);

  // WS fs-change 事件增量更新
  useEffect(() => {
    const unsub = ws.on("fs-change", (event) => {
      if (event.projectSlug !== projectSlug) return;

      set_entries((prev) => {
        switch (event.op) {
          case "write": {
            // 新增或覆寫
            const exists = prev.some((e) => e.name === event.path);
            if (exists) return prev;
            const new_entry: FileEntry = { name: event.path, type: "file" };
            return [...prev, new_entry].sort((a, b) =>
              a.name.localeCompare(b.name)
            );
          }
          case "delete": {
            return prev.filter((e) => e.name !== event.path);
          }
          case "rename": {
            return prev.map((e) => {
              if (e.name === event.oldPath) {
                return { ...e, name: event.path };
              }
              return e;
            });
          }
          default:
            return prev;
        }
      });
    });
    return unsub;
  }, [projectSlug, ws]);

  const handleFileClick = useCallback((path: string) => {
    onSelect(path);
  }, [onSelect]);

  if (loading) {
    return (
      <div className="p-4 text-sm text-muted-foreground">載入中…</div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-2">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">
          檔案
        </div>
        {entries.length === 0 ? (
          <div className="px-2 py-3 text-sm text-muted-foreground">（空）</div>
        ) : (
          <ul className="space-y-0.5" aria-label="檔案樹">
            {entries.map((entry) => (
              <FileItem
                key={entry.name}
                entry={entry}
                onClick={() => handleFileClick(entry.name)}
              />
            ))}
          </ul>
        )}
      </div>
    </ScrollArea>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────

function FileItem({ entry, onClick }: { entry: FileEntry; onClick: () => void }) {
  const Icon = entry.type === "dir" ? Folder : File;

  return (
    <li>
      <button
        className="w-full flex items-center gap-1.5 px-2 py-1 text-sm rounded hover:bg-accent hover:text-accent-foreground text-left"
        onClick={onClick}
        disabled={entry.type === "dir"}
        aria-label={entry.name}
      >
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{entry.name}</span>
      </button>
    </li>
  );
}
