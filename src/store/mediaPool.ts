import { create } from 'zustand';
import type { AssetFolder } from '../library/types';

// View/sort state for the Media Pool, lifted out of the MediaPool component so
// the media-pool context menus (which are built by pure functions with no access
// to component state) can read and drive it. See menuDefinitions.buildMediaPoolEmptyMenu.
export type MediaSortMode = 'name' | 'date' | 'resolution' | 'duration' | 'type';
export type MediaViewMode = 'grid' | 'list';
export type MediaThumbSize = 'small' | 'large';

export interface MediaImportOptions {
  accept?: string;
  directory?: boolean;
}

interface MediaPoolState {
  sortMode: MediaSortMode;
  viewMode: MediaViewMode;
  thumbSize: MediaThumbSize;
  setSortMode: (m: MediaSortMode) => void;
  setViewMode: (m: MediaViewMode) => void;
  setThumbSize: (s: MediaThumbSize) => void;
  // Asset id currently shown in the preview lightbox (null = closed).
  previewAssetId: string | null;
  setPreviewAsset: (id: string | null) => void;
  // Callbacks registered by the mounted MediaPool so the (pure) context menus can
  // trigger imports/refresh that need the component's file input + asset manager.
  onImport: ((opts?: MediaImportOptions) => void) | null;
  onRefresh: (() => void) | null;
  // Folder list published by the mounted FolderBrowser (for the current tab) so the
  // pure asset menu can build a "Move to Folder" picker; onFolderRefresh reloads it
  // after a menu-driven folder mutation.
  folders: AssetFolder[];
  setFolders: (folders: AssetFolder[]) => void;
  onFolderRefresh: (() => void) | null;
  setHandlers: (h: Partial<Pick<MediaPoolState, 'onImport' | 'onRefresh' | 'onFolderRefresh'>>) => void;
}

export const useMediaPoolStore = create<MediaPoolState>((set) => ({
  sortMode: 'date',
  viewMode: 'grid',
  thumbSize: 'small',
  setSortMode: (sortMode) => set({ sortMode }),
  setViewMode: (viewMode) => set({ viewMode }),
  setThumbSize: (thumbSize) => set({ thumbSize }),
  previewAssetId: null,
  setPreviewAsset: (previewAssetId) => set({ previewAssetId }),
  onImport: null,
  onRefresh: null,
  folders: [],
  setFolders: (folders) => set({ folders }),
  onFolderRefresh: null,
  setHandlers: (h) => set(h),
}));
