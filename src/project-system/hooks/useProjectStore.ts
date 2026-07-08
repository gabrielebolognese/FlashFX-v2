import { create } from 'zustand';
import type { ProjectMetadata, ProjectCard, CreateProjectOptions } from '../types';
import {
  createProject,
  listProjects,
  deleteProject,
  renameProject,
  duplicateProject,
  loadProjectScene,
  saveProjectScene,
  saveProjectPreview,
  getProjectPreviewUrl,
  getProjectMetadata,
} from '../services/projects';
import { exportProjectToFile, importProjectFromFile } from '../services/ffx';
import type { Composition } from '../../core/types';
import { usePanelStore } from '../../store/panels';

export type SortField = 'name' | 'modifiedAt' | 'createdAt';
export type SortDirection = 'asc' | 'desc';
export type AppView = 'dashboard' | 'editor';

interface ProjectState {
  view: AppView;
  projects: ProjectCard[];
  activeProjectId: string | null;
  loading: boolean;
  searchQuery: string;
  sortField: SortField;
  sortDirection: SortDirection;

  // Actions
  loadProjects: () => Promise<void>;
  createAndOpenProject: (options: CreateProjectOptions) => Promise<void>;
  openProject: (id: string) => Promise<Composition | null>;
  closeProject: () => void;
  deleteProject: (id: string) => Promise<void>;
  renameProject: (id: string, name: string) => Promise<void>;
  duplicateProject: (id: string) => Promise<void>;
  saveCurrentProject: (composition: Composition) => Promise<void>;
  savePreview: (blob: Blob) => Promise<void>;
  exportProject: (id: string, composition?: Composition) => Promise<void>;
  importProject: (file: File) => Promise<ProjectMetadata>;
  setSearchQuery: (query: string) => void;
  setSortField: (field: SortField) => void;
  setSortDirection: (direction: SortDirection) => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  view: 'dashboard',
  projects: [],
  activeProjectId: null,
  loading: false,
  searchQuery: '',
  sortField: 'modifiedAt',
  sortDirection: 'desc',

  loadProjects: async () => {
    set({ loading: true });
    const metadataList = await listProjects();

    const cards: ProjectCard[] = await Promise.all(
      metadataList.map(async (metadata) => {
        const previewUrl = await getProjectPreviewUrl(metadata.id);
        return { metadata, previewUrl };
      })
    );

    set({ projects: cards, loading: false });
  },

  createAndOpenProject: async (options) => {
    const metadata = await createProject(options);
    const composition = await loadProjectScene(metadata.id);
    if (composition) {
      usePanelStore.getState().setVideoFormat(metadata.videoFormat ?? 'long');
      set({ activeProjectId: metadata.id, view: 'editor' });
    }
  },

  openProject: async (id) => {
    const composition = await loadProjectScene(id);
    if (composition) {
      const metadata = await getProjectMetadata(id);
      usePanelStore.getState().setVideoFormat(metadata?.videoFormat ?? 'long');
      set({ activeProjectId: id, view: 'editor' });
    }
    return composition;
  },

  closeProject: () => {
    const { activeProjectId, projects } = get();
    if (activeProjectId) {
      // Revoke any existing preview URL for this project
      const card = projects.find((p) => p.metadata.id === activeProjectId);
      if (card?.previewUrl) {
        URL.revokeObjectURL(card.previewUrl);
      }
    }
    set({ activeProjectId: null, view: 'dashboard' });
  },

  deleteProject: async (id) => {
    const { projects } = get();
    const card = projects.find((p) => p.metadata.id === id);
    if (card?.previewUrl) URL.revokeObjectURL(card.previewUrl);

    await deleteProject(id);
    set({ projects: projects.filter((p) => p.metadata.id !== id) });
  },

  renameProject: async (id, name) => {
    await renameProject(id, name);
    const { projects } = get();
    set({
      projects: projects.map((p) =>
        p.metadata.id === id
          ? { ...p, metadata: { ...p.metadata, name, modifiedAt: Date.now() } }
          : p
      ),
    });
  },

  duplicateProject: async (id) => {
    const metadata = await duplicateProject(id);
    if (metadata) {
      const previewUrl = await getProjectPreviewUrl(metadata.id);
      const { projects } = get();
      set({ projects: [...projects, { metadata, previewUrl }] });
    }
  },

  saveCurrentProject: async (composition) => {
    const { activeProjectId } = get();
    if (!activeProjectId) return;
    await saveProjectScene(activeProjectId, composition);
  },

  savePreview: async (blob) => {
    const { activeProjectId } = get();
    if (!activeProjectId) return;
    await saveProjectPreview(activeProjectId, blob);
  },

  exportProject: async (id, composition) => {
    await exportProjectToFile(id, composition);
  },

  importProject: async (file) => {
    const metadata = await importProjectFromFile(file);
    await get().loadProjects();
    return metadata;
  },

  setSearchQuery: (query) => set({ searchQuery: query }),
  setSortField: (field) => set({ sortField: field }),
  setSortDirection: (direction) => set({ sortDirection: direction }),
}));
