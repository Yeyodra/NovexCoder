import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { Project } from '@/types';

interface ProjectState {
  projects: Project[];
  activeProjectId: string | null;
  setProjects: (projects: Project[]) => void;
  setActiveProjectId: (id: string | null) => void;
  addProject: (project: Project) => void;
  removeProject: (id: string) => void;
  reorderProjects: (projectIds: string[]) => void;
  updateProjectMeta: (id: string, icon: string | null, color: string | null) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  projects: [],
  activeProjectId: null,
  setProjects: (projects) => set({ projects }),
  setActiveProjectId: (id) => set({ activeProjectId: id }),
  addProject: (project) => set((state) => ({ projects: [...state.projects, project] })),
  removeProject: (id) => set((state) => ({
    projects: state.projects.filter((p) => p.id !== id),
    activeProjectId: state.activeProjectId === id ? null : state.activeProjectId
  })),
  reorderProjects: (projectIds) => {
    set((state) => ({
      projects: state.projects.map((p) => {
        const idx = projectIds.indexOf(p.id);
        return idx >= 0 ? { ...p, sortOrder: idx } : p;
      })
    }));
    invoke('reorder_projects', { projectIds }).catch(console.error);
  },
  updateProjectMeta: (id, icon, color) => {
    set((state) => ({
      projects: state.projects.map((p) => p.id === id ? { ...p, icon, color } : p)
    }));
    invoke('update_project_meta', { id, icon, color }).catch(console.error);
  },
}));
