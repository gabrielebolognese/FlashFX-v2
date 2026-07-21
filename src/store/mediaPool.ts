import { create } from 'zustand';

// View/sort state for the Media Pool, lifted out of the MediaPool component so
// the media-pool context menus (which are built by pure functions with no access
// to component state) can read and drive it. See menuDefinitions.buildMediaPoolEmptyMenu.
export type MediaSortMode = 'name' | 'date' | 'resolution' | 'duration' | 'type';
export type MediaViewMode = 'grid' | 'list';
export type MediaThumbSize = 'small' | 'large';

interface MediaPoolState {
  sortMode: MediaSortMode;
  viewMode: MediaViewMode;
  thumbSize: MediaThumbSize;
  setSortMode: (m: MediaSortMode) => void;
  setViewMode: (m: MediaViewMode) => void;
  setThumbSize: (s: MediaThumbSize) => void;
}

export const useMediaPoolStore = create<MediaPoolState>((set) => ({
  sortMode: 'date',
  viewMode: 'grid',
  thumbSize: 'small',
  setSortMode: (sortMode) => set({ sortMode }),
  setViewMode: (viewMode) => set({ viewMode }),
  setThumbSize: (thumbSize) => set({ thumbSize }),
}));
