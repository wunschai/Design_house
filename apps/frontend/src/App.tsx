// App — 雙欄 layout（Chat / Workspace）+ project switcher + WS provider
import React, { useState, useEffect, createContext, useContext, useCallback } from "react";
import { Toaster } from "sonner";
import { toast } from "sonner";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "./components/ui/resizable";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./components/ui/dialog";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import Chat from "./panels/Chat";
import Workspace from "./panels/Workspace";
import { useProjectStore } from "./hooks/use-project";
import { useWs, type UseWsReturn } from "./hooks/use-ws";

// ── WS Context ─────────────────────────────────────────────────────────

const WsContext = createContext<UseWsReturn | null>(null);

export function useWsContext(): UseWsReturn {
  const ctx = useContext(WsContext);
  if (!ctx) throw new Error("useWsContext must be used inside WsProvider");
  return ctx;
}

// ── WsProvider ─────────────────────────────────────────────────────────

function WsProvider({
  projectSlug,
  children,
}: {
  projectSlug: string | null;
  children: React.ReactNode;
}) {
  const ws = useWs({
    projectSlug,
    onStatusChange: (status) => {
      if (status === "disconnected") {
        // silent reconnect in progress
      }
    },
  });

  // Listen for WS errors → toast
  useEffect(() => {
    const unsub = ws.on("error", (event) => {
      switch (event.code) {
        case "TURN_ALREADY_ACTIVE":
          toast.error("已有進行中的對話，請等待完成");
          break;
        case "CC_NOT_INSTALLED":
          toast.error("claude CLI 未安裝", {
            description: "請先安裝 Claude Code：https://claude.ai/download",
            duration: 10_000,
          });
          break;
        case "CC_NOT_AUTHENTICATED":
          toast.error("claude CLI 未登入", {
            description: "請在終端機執行 `claude` 完成登入，然後刷新此頁",
            duration: 10_000,
          });
          break;
        case "CC_SESSION_RESET":
          toast.warning("Session 已重設", {
            description: event.message,
          });
          break;
        case "CC_MAX_TURNS":
        case "CC_EXECUTION_ERROR":
        case "CC_UNKNOWN_RESULT_SUBTYPE":
          toast.error(`CC 執行錯誤（${event.code}）`, { description: event.message });
          break;
        default:
          toast.error(`錯誤：${event.message}`);
      }
    });
    return unsub;
  }, [ws]);

  return <WsContext.Provider value={ws}>{children}</WsContext.Provider>;
}

// ── App ────────────────────────────────────────────────────────────────

export default function App() {
  const { projects, current_slug, load, setCurrent, create, remove } = useProjectStore();
  const [show_new_dialog, set_show_new_dialog] = useState(false);
  const [new_project_name, set_new_project_name] = useState("");
  const [creating, set_creating] = useState(false);

  // 初始載入 projects
  useEffect(() => {
    load();
  }, [load]);

  const handleCreateProject = useCallback(async () => {
    if (!new_project_name.trim() || creating) return;
    set_creating(true);
    try {
      await create(new_project_name.trim());
      set_show_new_dialog(false);
      set_new_project_name("");
    } catch {
      toast.error("建立專案失敗");
    } finally {
      set_creating(false);
    }
  }, [new_project_name, creating, create]);

  const handleDeleteProject = useCallback(async (slug: string) => {
    try {
      await remove(slug);
    } catch {
      toast.error("刪除專案失敗");
    }
  }, [remove]);

  const currentProject = projects.find((p) => p.slug === current_slug) ?? null;

  return (
    <WsProvider projectSlug={current_slug}>
      <AppInner
        currentProject={currentProject}
        projects={projects}
        current_slug={current_slug}
        show_new_dialog={show_new_dialog}
        new_project_name={new_project_name}
        creating={creating}
        onSetShowNewDialog={set_show_new_dialog}
        onSetNewProjectName={set_new_project_name}
        onSetCurrent={setCurrent}
        onCreateProject={handleCreateProject}
        onDeleteProject={handleDeleteProject}
      />
    </WsProvider>
  );
}

// ── Inner component (receives WsContext) ───────────────────────────────

interface AppInnerProps {
  currentProject: { slug: string; name: string } | null;
  projects: Array<{ slug: string; name: string }>;
  current_slug: string | null;
  show_new_dialog: boolean;
  new_project_name: string;
  creating: boolean;
  onSetShowNewDialog: (v: boolean) => void;
  onSetNewProjectName: (v: string) => void;
  onSetCurrent: (slug: string | null) => void;
  onCreateProject: () => void;
  onDeleteProject: (slug: string) => void;
}

function AppInner({
  currentProject,
  projects,
  current_slug,
  show_new_dialog,
  new_project_name,
  creating,
  onSetShowNewDialog,
  onSetNewProjectName,
  onSetCurrent,
  onCreateProject,
  onDeleteProject,
}: AppInnerProps) {
  const ws = useWsContext();

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* 頂部導覽列 */}
      <header className="h-10 border-b flex items-center px-3 gap-2 shrink-0">
        <span className="text-sm font-semibold text-foreground/70 mr-1">Design House</span>

        {/* Project switcher */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 h-7"
              aria-label="切換專案"
            >
              <span className="max-w-[160px] truncate">
                {currentProject?.name ?? "（無專案）"}
              </span>
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {projects.map((p) => (
              <DropdownMenuItem
                key={p.slug}
                className="flex items-center justify-between group"
                onSelect={() => onSetCurrent(p.slug)}
              >
                <span className={p.slug === current_slug ? "font-semibold" : ""}>
                  {p.name}
                </span>
                {p.slug === current_slug && projects.length > 1 && (
                  <Trash2
                    className="h-3.5 w-3.5 opacity-0 group-hover:opacity-60 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteProject(p.slug);
                    }}
                    aria-label={`刪除 ${p.name}`}
                  />
                )}
              </DropdownMenuItem>
            ))}
            {projects.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem onSelect={() => onSetShowNewDialog(true)} aria-label="新增專案">
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              新增專案
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* 雙欄 layout — 對齊 Claude Design 原版：左對話、右工作區（tab bar + preview + 檔案抽屜）*/}
      {current_slug ? (
        <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0">
          {/* 左：對話（~45%）*/}
          <ResizablePanel defaultSize={45} minSize={25} aria-label="對話面板">
            <div data-testid="panel-chat" className="h-full">
              <Chat projectSlug={current_slug} ws={ws} />
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* 右：Workspace — tab bar + iframe + file drawer（~55%）*/}
          <ResizablePanel defaultSize={55} minSize={30} aria-label="工作區">
            <Workspace projectSlug={current_slug} ws={ws} />
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          <div className="text-center space-y-3">
            <p>尚無專案，請先建立一個</p>
            <Button onClick={() => onSetShowNewDialog(true)} size="sm">
              新增專案
            </Button>
          </div>
        </div>
      )}

      {/* 新增專案 Dialog */}
      <Dialog open={show_new_dialog} onOpenChange={onSetShowNewDialog}>
        <DialogContent aria-label="新增專案對話框">
          <DialogHeader>
            <DialogTitle>新增專案</DialogTitle>
          </DialogHeader>
          <Input
            value={new_project_name}
            onChange={(e) => onSetNewProjectName(e.target.value)}
            placeholder="專案名稱"
            onKeyDown={(e) => {
              if (e.key === "Enter") onCreateProject();
            }}
            aria-label="專案名稱輸入"
          />
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => onSetShowNewDialog(false)}
            >
              取消
            </Button>
            <Button
              onClick={onCreateProject}
              disabled={creating || !new_project_name.trim()}
            >
              建立
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Toast 容器 */}
      <Toaster richColors position="top-right" />
    </div>
  );
}
