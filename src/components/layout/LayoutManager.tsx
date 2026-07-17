import React from 'react';
import { LayoutMode } from '../../hooks/useLayoutMode';
import DesignModeLayout from './modes/DesignModeLayout';
import AdvancedModeLayout from './modes/AdvancedModeLayout';
import { DesignElement } from '../../types/design';
import { BackgroundConfig } from '../../types/background';
import { Preset } from '../../types/preset';
import { CanvasViewport } from '../../utils/canvasUtils';

interface LayoutManagerProps {
  currentMode: LayoutMode;
  setMode: (mode: LayoutMode) => void;
  isTransitioning: boolean;

  elements: DesignElement[];
  selectedElements: string[];
  setSelectedElements: (ids: string[]) => void;
  updateElement: (id: string, updates: Partial<DesignElement>) => void;
  batchUpdateElements?: (updates: Array<{ id: string; x: number; y: number }>) => void;
  deleteElement: (id: string) => void;
  deleteElements?: (ids: string[]) => void;
  reparentToBox?: (elementId: string, containerId: string) => void;
  duplicateElement: (id: string) => void;
  moveElementUp: (id: string) => void;
  moveElementDown: (id: string) => void;
  bringElementToFront: (id: string) => void;
  sendElementToBack: (id: string) => void;
  onAddElement: (element: DesignElement) => void;
  onAddMultipleElements?: (elements: DesignElement[]) => void;

  canvasSize?: { width: number; height: number };

  zoom: number;
  setZoom: (zoom: number) => void;
  pan: { x: number; y: number };
  setPan: (pan: { x: number; y: number }) => void;
  showGrid: boolean;
  setShowGrid: (show: boolean) => void;
  snapEnabled: boolean;
  setSnapEnabled: (enabled: boolean) => void;

  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;

  onGroup: () => void;
  onUngroup: () => void;

  onOpenJsonEditor: (element: DesignElement) => void;
  onOpenLineProperties: () => void;

  onExportDesign?: () => void;
  onRenderSequence?: () => void;
  onExportLayers?: () => void;
  onDownloadProject?: () => void;

  onOpenProjectJsonEditor: () => void;
  onOpenEditorSettings?: () => void;

  editorMode?: boolean;
  onBackToMain?: () => void;

  background?: BackgroundConfig;
  onUpdateBackground?: (background: BackgroundConfig) => void;

  onSavePreset?: (name: string, description: string, elements: DesignElement[]) => Promise<void>;
  userId?: string | null;
  isGuest?: boolean;

  onSaveProject?: () => Promise<void>;
  onExitToHome?: () => void;

  onSaveProjectFile?: () => void;
  onLoadProjectFile?: () => void;

  onCreateShape?: (type: 'rectangle' | 'circle' | 'line' | 'text' | 'image', x: number, y: number) => void;
  onLoadPreset?: (preset: Preset, x: number, y: number) => void;
  onPasteElements?: (x: number, y: number, inPlace: boolean) => void;
  onFitToScreen?: () => void;
  onResetZoom?: () => void;
  onClearCanvas?: () => void;
  onResetTransform?: () => void;
  onViewCanvas?: () => void;
  presets?: Preset[];
  canvasViewport?: CanvasViewport;

  onApplyTextAnimationControl?: (elementId: string) => void;

  onManipulationStart?: () => void;
  onManipulationEnd?: () => void;
}

const LayoutManager: React.FC<LayoutManagerProps> = (props) => {
  const { currentMode, setMode, isTransitioning } = props;

  const commonProps = {
    currentMode,
    setMode,
    isTransitioning,
    elements: props.elements,
    selectedElements: props.selectedElements,
    setSelectedElements: props.setSelectedElements,
    updateElement: props.updateElement,
    batchUpdateElements: props.batchUpdateElements,
    deleteElement: props.deleteElement,
    deleteElements: props.deleteElements,
    reparentToBox: props.reparentToBox,
    duplicateElement: props.duplicateElement,
    moveElementUp: props.moveElementUp,
    moveElementDown: props.moveElementDown,
    bringElementToFront: props.bringElementToFront,
    sendElementToBack: props.sendElementToBack,
    onAddElement: props.onAddElement,
    onAddMultipleElements: props.onAddMultipleElements,
    canvasSize: props.canvasSize,
    zoom: props.zoom,
    setZoom: props.setZoom,
    pan: props.pan,
    setPan: props.setPan,
    showGrid: props.showGrid,
    setShowGrid: props.setShowGrid,
    snapEnabled: props.snapEnabled,
    setSnapEnabled: props.setSnapEnabled,
    canUndo: props.canUndo,
    canRedo: props.canRedo,
    onUndo: props.onUndo,
    onRedo: props.onRedo,
    onGroup: props.onGroup,
    onUngroup: props.onUngroup,
    onOpenJsonEditor: props.onOpenJsonEditor,
    onOpenLineProperties: props.onOpenLineProperties,
    onExportDesign: props.onExportDesign,
    onRenderSequence: props.onRenderSequence,
    onExportLayers: props.onExportLayers,
    onDownloadProject: props.onDownloadProject,
    onOpenProjectJsonEditor: props.onOpenProjectJsonEditor,
    onOpenEditorSettings: props.onOpenEditorSettings,
    editorMode: props.editorMode,
    onBackToMain: props.onBackToMain,
    background: props.background,
    onUpdateBackground: props.onUpdateBackground,
    onSavePreset: props.onSavePreset,
    userId: props.userId,
    isGuest: props.isGuest,
    onSaveProject: props.onSaveProject,
    onExitToHome: props.onExitToHome,
    onSaveProjectFile: props.onSaveProjectFile,
    onLoadProjectFile: props.onLoadProjectFile,
    onCreateShape: props.onCreateShape,
    onLoadPreset: props.onLoadPreset,
    onPasteElements: props.onPasteElements,
    onFitToScreen: props.onFitToScreen,
    onResetZoom: props.onResetZoom,
    onClearCanvas: props.onClearCanvas,
    onResetTransform: props.onResetTransform,
    onViewCanvas: props.onViewCanvas,
    presets: props.presets,
    canvasViewport: props.canvasViewport,
    onApplyTextAnimationControl: props.onApplyTextAnimationControl,
    onManipulationStart: props.onManipulationStart,
    onManipulationEnd: props.onManipulationEnd,
  };

  const isAdvancedMode = currentMode === 'advanced';

  return (
    <div className="w-full h-full relative">
      <div
        className="w-full h-full"
        style={isAdvancedMode ? { visibility: 'hidden', pointerEvents: 'none', position: 'absolute', inset: 0 } : undefined}
      >
        <div className={`w-full h-full transition-opacity duration-150 ${isTransitioning ? 'opacity-50' : 'opacity-100'}`}>
          <DesignModeLayout {...commonProps} />
        </div>
      </div>

      {isAdvancedMode && (
        <div className="absolute inset-0 w-full h-full">
          <div className={`w-full h-full transition-opacity duration-150 ${isTransitioning ? 'opacity-50' : 'opacity-100'}`}>
            <AdvancedModeLayout {...commonProps} />
          </div>
        </div>
      )}
    </div>
  );
};

export default LayoutManager;
