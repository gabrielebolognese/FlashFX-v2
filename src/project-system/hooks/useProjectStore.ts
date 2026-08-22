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
  setProjectStarred,
  trashProject as trashProjectService,
  restoreProject as restoreProjectService,
  purgeExpiredTrash,
} from '../services/projects';
import { exportProjectToFile, importProjectFromFile } from '../services/ffx';
import { cloudAvailable, pushProject, pushTombstone, recordLocalDelete, syncAll, useCloudSyncStore } from '../services/cloudSync';
import type { Composition, SceneDocument } from '../../core/types';
import { usePanelStore } from '../../store/panels';
import { useEditorStore } from '../../store/editor';
import { useIslandStore } from '../../ui/island/islandStore';

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
  /** Reconcile local projects with the cloud (best-effort), then refresh the list. No-op offline. */
  syncCloud: () => Promise<void>;
  createAndOpenProject: (options: CreateProjectOptions) => Promise<void>;
  openProject: (id: string) => Promise<SceneDocument | null>;
  closeProject: () => Promise<void>;
  /** Move to Trash (soft delete, recoverable). The card menu uses this. */
  trashProject: (id: string) => Promise<void>;
  /** Restore a project from Trash. */
  restoreProject: (id: string) => Promise<void>;
  /** Permanent, irreversible erase (Trash → "Delete permanently"). */
  deletePermanently: (id: string) => Promise<void>;
  /** Star / unstar (starred projects get a 30-day trash window vs 7). */
  toggleStar: (id: string) => Promise<void>;
  renameProject: (id: string, name: string) => Promise<void>;
  duplicateProject: (id: string) => Promise<void>;
  // Save the current project's state as a NEW project under `name`, then switch to it.
  saveProjectAs: (name: string) => Promise<void>;
  saveCurrentProject: () => Promise<void>;
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
    // Erase any trashed projects whose retention window (7d, or 30d if starred) has elapsed.
    try { await purgeExpiredTrash(); } catch (err) { console.error('Trash purge failed:', err); }
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
    const doc = await loadProjectScene(metadata.id);
    if (doc) {
      usePanelStore.getState().setVideoFormat(metadata.videoFormat ?? 'long');
      set({ activeProjectId: metadata.id, view: 'editor' });
    }
  },

  openProject: async (id) => {
    const doc = await loadProjectScene(id);
    if (doc) {
      const metadata = await getProjectMetadata(id);
      usePanelStore.getState().setVideoFormat(metadata?.videoFormat ?? 'long');
      set({ activeProjectId: id, view: 'editor' });
    } else {
      useIslandStore.getState().error("Couldn't open this project. The file may be corrupted or missing.");
    }
    return doc;
  },

  closeProject: async () => {
    const { activeProjectId, projects } = get();
    if (activeProjectId) {
      // Persist before leaving — New / Open / Close and the "Projects" back button
      // all funnel through here; without this they silently discarded unsaved work.
      try { await get().saveCurrentProject(); } catch (err) { console.error('Save on close failed:', err); }
      // Revoke any existing preview URL for this project
      const card = projects.find((p) => p.metadata.id === activeProjectId);
      if (card?.previewUrl) {
        URL.revokeObjectURL(card.previewUrl);
      }
    }
    set({ activeProjectId: null, view: 'dashboard' });
  },

  trashProject: async (id) => {
    await trashProjectService(id);
    const now = Date.now();
    // Keep the card (it moves to the Trash section); stamp trashedAt locally.
    set({
      projects: get().projects.map((p) =>
        p.metadata.id === id ? { ...p, metadata: { ...p.metadata, trashedAt: now } } : p
      ),
    });
  },

  restoreProject: async (id) => {
    await restoreProjectService(id);
    set({
      projects: get().projects.map((p) =>
        p.metadata.id === id ? { ...p, metadata: { ...p.metadata, trashedAt: null } } : p
      ),
    });
  },

  deletePermanently: async (id) => {
    const { projects } = get();
    const card = projects.find((p) => p.metadata.id === id);
    if (card?.previewUrl) URL.revokeObjectURL(card.previewUrl);
    await deleteProject(id);
    set({ projects: projects.filter((p) => p.metadata.id !== id) });
    // Propagate the delete to the cloud so it doesn't resurrect on the next sync (best-effort).
    if (cloudAvailable()) {
      recordLocalDelete(id);
      pushTombstone(id).catch(() => {});
    }
  },

  toggleStar: async (id) => {
    const card = get().projects.find((p) => p.metadata.id === id);
    const next = !card?.metadata.starred;
    await setProjectStarred(id, next);
    set({
      projects: get().projects.map((p) =>
        p.metadata.id === id ? { ...p, metadata: { ...p.metadata, starred: next } } : p
      ),
    });
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

  saveProjectAs: async (name) => {
    const { activeProjectId } = get();
    if (!activeProjectId) return;
    // Flush the current in-memory scene to the active project, then duplicate it
    // (a copy of the just-saved state) and switch to the copy.
    await get().saveCurrentProject();
    const metadata = await duplicateProject(activeProjectId);
    if (!metadata) return;
    const trimmed = name.trim();
    if (trimmed) await renameProject(metadata.id, trimmed);
    const previewUrl = await getProjectPreviewUrl(metadata.id);
    const finalMeta = trimmed ? { ...metadata, name: trimmed } : metadata;
    set((s) => ({ projects: [...s.projects, { metadata: finalMeta, previewUrl }] }));
    await get().openProject(metadata.id);
  },

  syncCloud: async () => {
    if (!cloudAvailable()) return;
    const sync = useCloudSyncStore.getState();
    if (sync.status === 'syncing') return;
    sync.setStatus('syncing');
    try {
      await syncAll();
      await get().loadProjects();
      useCloudSyncStore.getState().markSynced();
    } catch {
      useCloudSyncStore.getState().setStatus('error');
    }
  },

  saveCurrentProject: async () => {
    const { activeProjectId } = get();
    if (!activeProjectId) return;
    // Persist the full multi-composition document (registry + root).
    await saveProjectScene(activeProjectId, useEditorStore.getState().getDocument());
    // Best-effort cloud backup — never blocks or fails the local save.
    if (cloudAvailable()) {
      pushProject(activeProjectId)
        .then(() => useCloudSyncStore.getState().markSynced())
        .catch(() => useCloudSyncStore.getState().setStatus('error'));
    }
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
