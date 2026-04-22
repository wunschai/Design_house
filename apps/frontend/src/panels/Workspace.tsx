// Workspace panel — tab bar + iframe preview + collapsible file drawer
// 對照 Claude Design 原版：左對話、右工作區。Workspace 是右側整個「成果 + 檔案」管理容器。
import { useState, useEffect, useCallback } from "react";
import { X, FolderTree } from "lucide-react";
import { Button } from "../components/ui/button";
import Preview from "./Preview";
import FileTree from "./FileTree";
import type { UseWsReturn } from "../hooks/use-ws";

export interface WorkspaceProps {
  projectSlug: string;
  ws: UseWsReturn;
}

interface TabState {
  path: string;
}

export default function Workspace({ projectSlug, ws }: WorkspaceProps) {
  const [tabs, setTabs] = useState<TabState[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // 切換 project 時清 tabs（每個 project 的工作區獨立）
  useEffect(() => {
    setTabs([]);
    setActiveTab(null);
    setDrawerOpen(false);
  }, [projectSlug]);

  const openTab = useCallback((path: string) => {
    setTabs((cur) => (cur.some((t) => t.path === path) ? cur : [...cur, { path }]));
    setActiveTab(path);
  }, []);

  const closeTab = useCallback((path: string) => {
    // 僅關閉視圖，不刪檔案（使用者已確認）
    setTabs((cur) => {
      const next = cur.filter((t) => t.path !== path);
      setActiveTab((prevActive) => {
        if (prevActive !== path) return prevActive;
        // 選鄰近的 tab
        const idx = cur.findIndex((t) => t.path === path);
        return next[Math.max(0, idx - 1)]?.path ?? null;
      });
      return next;
    });
  }, []);

  // WS 事件：show-to-user / done-request 自動開 tab + 激活
  useEffect(() => {
    const unsubs: Array<() => void> = [];

    unsubs.push(
      ws.on("show-to-user", (event) => {
        if (event.projectSlug !== projectSlug) return;
        openTab(event.path);
      })
    );

    unsubs.push(
      ws.on("done-request", (event) => {
        if (event.projectSlug !== projectSlug) return;
        openTab(event.path);
      })
    );

    return () => unsubs.forEach((fn) => fn());
  }, [ws, projectSlug, openTab]);

  // FileTree 選取 → 開 tab + 收合抽屜
  const handleFileSelect = useCallback(
    (path: string) => {
      openTab(path);
      setDrawerOpen(false);
    },
    [openTab]
  );

  return (
    <div data-testid="panel-workspace" className="flex h-full relative">
      {/* 主區：tab bar + iframe */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Tab bar */}
        <div
          data-testid="tab-bar"
          className="h-9 border-b bg-muted/30 flex items-center px-1 gap-1 overflow-x-auto shrink-0"
        >
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 shrink-0"
            aria-label="展開檔案抽屜"
            data-testid="files-drawer-toggle"
            onClick={() => setDrawerOpen((v) => !v)}
          >
            <FolderTree className="h-3.5 w-3.5" />
          </Button>

          {tabs.length === 0 ? (
            <span className="text-xs text-muted-foreground px-2">（尚未開啟任何檔案）</span>
          ) : (
            tabs.map((tab) => {
              const isActive = tab.path === activeTab;
              return (
                <div
                  key={tab.path}
                  data-testid={`tab-${tab.path}`}
                  className={
                    "group flex items-center gap-1 px-2 h-7 rounded text-xs cursor-pointer shrink-0 " +
                    (isActive
                      ? "bg-background border border-border"
                      : "hover:bg-background/60")
                  }
                  onClick={() => setActiveTab(tab.path)}
                  role="tab"
                  aria-selected={isActive}
                >
                  <span className="truncate max-w-[200px]" title={tab.path}>
                    {tab.path}
                  </span>
                  <button
                    className="opacity-0 group-hover:opacity-70 hover:opacity-100 p-0.5"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(tab.path);
                    }}
                    aria-label={`關閉 ${tab.path}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Preview */}
        <div data-testid="panel-preview" className="flex-1 min-h-0">
          <Preview
            projectSlug={projectSlug}
            currentPath={activeTab}
            ws={ws}
            onPathChange={openTab}
          />
        </div>
      </div>

      {/* 檔案抽屜（overlay on top of iframe，不佔 layout flow 寬度） */}
      {drawerOpen && (
        <>
          {/* 背景 — 點擊關閉 */}
          <div
            className="absolute inset-0 bg-black/20 z-10"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <aside
            data-testid="drawer-files"
            className="absolute top-0 left-0 h-full w-64 bg-background border-r shadow-lg z-20 flex flex-col"
            aria-label="檔案抽屜"
          >
            <div className="h-9 border-b flex items-center px-3 text-sm font-semibold shrink-0">
              檔案
            </div>
            <div className="flex-1 min-h-0">
              <FileTree projectSlug={projectSlug} ws={ws} onSelect={handleFileSelect} />
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
