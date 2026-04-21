// use-project — Zustand store for project management
import { create } from "zustand";
import {
  listProjects,
  createProject,
  deleteProject,
  type ApiProject,
} from "../api/client";

// ── State ─────────────────────────────────────────────────────────────

export interface ProjectStore {
  projects: ApiProject[];
  current_slug: string | null;
  loading: boolean;
  error: string | null;

  // Actions
  load: () => Promise<void>;
  setCurrent: (slug: string | null) => void;
  create: (name: string) => Promise<ApiProject>;
  remove: (slug: string) => Promise<void>;
}

const LAST_USED_KEY = "dh_last_project_slug";

function getLastUsed(): string | null {
  try {
    return localStorage.getItem(LAST_USED_KEY);
  } catch {
    return null;
  }
}

function setLastUsed(slug: string | null) {
  try {
    if (slug) {
      localStorage.setItem(LAST_USED_KEY, slug);
    } else {
      localStorage.removeItem(LAST_USED_KEY);
    }
  } catch {
    // localStorage may be unavailable in test environments
  }
}

export const useProjectStore = create<ProjectStore>((set, _get) => ({
  projects: [],
  current_slug: null,
  loading: false,
  error: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const projects = await listProjects();
      const lastUsed = getLastUsed();
      const current_slug =
        (lastUsed && projects.some((p) => p.slug === lastUsed) ? lastUsed : null) ??
        (projects[0]?.slug ?? null);
      set({ projects, current_slug, loading: false });
      if (current_slug) setLastUsed(current_slug);
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },

  setCurrent: (slug) => {
    set({ current_slug: slug });
    setLastUsed(slug);
  },

  create: async (name) => {
    const project = await createProject(name);
    set((s) => ({
      projects: [...s.projects, project],
      current_slug: project.slug,
    }));
    setLastUsed(project.slug);
    return project;
  },

  remove: async (slug) => {
    await deleteProject(slug);
    set((s) => {
      const projects = s.projects.filter((p) => p.slug !== slug);
      const current_slug =
        s.current_slug === slug ? (projects[0]?.slug ?? null) : s.current_slug;
      if (current_slug !== s.current_slug) setLastUsed(current_slug);
      return { projects, current_slug };
    });
  },
}));

/**
 * 便利 hook — 回傳目前 project 物件
 */
export function useCurrentProject(): ApiProject | null {
  const { projects, current_slug } = useProjectStore();
  return projects.find((p) => p.slug === current_slug) ?? null;
}
