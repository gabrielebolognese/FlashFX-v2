/**
 * SLICE 4 — UI State
 *
 * Holds all transient interface state: active tool, panel visibility,
 * modal stack, and properties panel tab. Changes only in response to
 * user interactions with UI chrome — never during playback or drag operations.
 *
 * ISOLATION GUARANTEE: Changes to this slice NEVER cause canvas elements,
 * timeline clips, or properties inputs to re-render.
 *
 * Components PERMITTED to subscribe:
 *   - HorizontalShapesBar / DrawingToolsBar (read activeTool)
 *   - Canvas.tsx (reads activeTool for cursor and tool overlays)
 *   - LayoutBar (reads panel collapse states)
 *   - PropertiesPanel (reads propertiesPanelTab)
 *   - DesignModeLayout (reads panel collapse, modal flags for rendering)
 *
 * Change frequency: User action only (clicks, keyboard shortcuts).
 *   Never changes during playback or drag operations.
 *
 * Sub-sections are independently subscribable — a component subscribing to
 * activeTool does NOT re-render when propertiesPanelTab changes.
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

export type PropertiesPanelTab = 'design' | 'edit' | 'fx';

export interface UISlice {
  activeTool: string;
  isLayersPanelCollapsed: boolean;
  isPropertiesPanelCollapsed: boolean;
  propertiesPanelTab: PropertiesPanelTab;
  showGridSettings: boolean;
  showExitConfirmModal: boolean;
  showAdvancedConfirmModal: boolean;
  showAutoSequenceModal: boolean;
  importError: string | null;
  importStatus: { type: 'success' | 'error' | 'loading'; message: string } | null;
  clipSnapEnabled: boolean;

  setActiveTool: (tool: string) => void;
  setLayersPanelCollapsed: (collapsed: boolean) => void;
  setPropertiesPanelCollapsed: (collapsed: boolean) => void;
  setPropertiesPanelTab: (tab: PropertiesPanelTab | ((current: PropertiesPanelTab) => PropertiesPanelTab)) => void;
  setShowGridSettings: (show: boolean) => void;
  setShowExitConfirmModal: (show: boolean) => void;
  setShowAdvancedConfirmModal: (show: boolean) => void;
  setShowAutoSequenceModal: (show: boolean) => void;
  setImportError: (error: string | null) => void;
  setImportStatus: (status: { type: 'success' | 'error' | 'loading'; message: string } | null) => void;
  setClipSnapEnabled: (enabled: boolean) => void;
}

export const useUIStore = create<UISlice>()(
  subscribeWithSelector((set) => ({
    activeTool: 'select',
    isLayersPanelCollapsed: false,
    isPropertiesPanelCollapsed: false,
    propertiesPanelTab: 'design',
    showGridSettings: false,
    showExitConfirmModal: false,
    showAdvancedConfirmModal: false,
    showAutoSequenceModal: false,
    importError: null,
    importStatus: null,
    clipSnapEnabled: true,

    setActiveTool: (activeTool) => set({ activeTool }),
    setLayersPanelCollapsed: (isLayersPanelCollapsed) => set({ isLayersPanelCollapsed }),
    setPropertiesPanelCollapsed: (isPropertiesPanelCollapsed) => set({ isPropertiesPanelCollapsed }),
    setPropertiesPanelTab: (tabOrUpdater) => set((state) => ({
      propertiesPanelTab: typeof tabOrUpdater === 'function'
        ? tabOrUpdater(state.propertiesPanelTab)
        : tabOrUpdater,
    })),
    setShowGridSettings: (showGridSettings) => set({ showGridSettings }),
    setShowExitConfirmModal: (showExitConfirmModal) => set({ showExitConfirmModal }),
    setShowAdvancedConfirmModal: (showAdvancedConfirmModal) => set({ showAdvancedConfirmModal }),
    setShowAutoSequenceModal: (showAutoSequenceModal) => set({ showAutoSequenceModal }),
    setImportError: (importError) => set({ importError }),
    setImportStatus: (importStatus) => set({ importStatus }),
    setClipSnapEnabled: (clipSnapEnabled) => set({ clipSnapEnabled }),
  }))
);

/**
 * Precise selector hooks for sub-field subscriptions.
 */

export const useActiveTool = (): string =>
  useUIStore((s) => s.activeTool);

export const usePropertiesPanelTab = (): PropertiesPanelTab =>
  useUIStore((s) => s.propertiesPanelTab);

export const useLayersPanelCollapsed = (): boolean =>
  useUIStore((s) => s.isLayersPanelCollapsed);

export const usePropertiesPanelCollapsed = (): boolean =>
  useUIStore((s) => s.isPropertiesPanelCollapsed);

export const useClipSnapEnabled = (): boolean =>
  useUIStore((s) => s.clipSnapEnabled);
