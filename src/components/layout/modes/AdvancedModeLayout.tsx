import React, { useState, useCallback, useEffect, useRef } from 'react';
import DrawingToolsBar, { DrawingDefaults } from '../../DrawingToolsBar';
import HorizontalShapesBar from '../HorizontalShapesBar';
import LayersPanel from '../../design-tool/LayersPanel';
import Canvas from '../../design-tool/Canvas';
import PropertiesPanel from '../PropertiesPanel';
import LayoutBar from '../LayoutBar';
import ExitConfirmModal from '../../modals/ExitConfirmModal';
import AdvancedModeConfirmModal from '../../modals/AdvancedModeConfirmModal';
import { DesignElement } from '../../../types/design';
import { BackgroundConfig } from '../../../types/background';
import { useGridSystem } from '../../../hooks/useGridSystem';
import { LayoutMode } from '../../../hooks/useLayoutMode';
import { useAnimation, Sequence } from '../../../animation-engine';
import { CanvasViewport } from '../../../utils/canvasUtils';
import GridSettingsPanel from '../../design-tool/GridSettingsPanel';
import GeneralTimeline from '../../timeline/GeneralTimeline';
import AnimationTimeline from '../../timeline/AnimationTimeline';
import TimelineControlsPanel from '../../timeline/TimelineControlsPanel';
import KeyframeEditor from '../../animation/KeyframeEditor';
import TutorialOverlay from '../../tutorial/TutorialOverlay';
import TutorialWelcomeModal from '../../tutorial/TutorialWelcomeModal';
import { useTutorial } from '../../../contexts/TutorialContext';
import { Preset } from '../../../types/preset';
import CreateSequenceModal from '../../sequence/CreateSequenceModal';

interface AdvancedModeLayoutProps {
  // Mode state
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
  onOpenProjectJsonEditor: () => void;
  onExportDesign?: () => void;
  onRenderSequence?: () => void;
  onExportLayers?: () => void;
  onDownloadProject?: () => void;
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

const AdvancedModeLayout: React.FC<AdvancedModeLayoutProps> = ({
  currentMode,
  setMode,
  isTransitioning,
  elements,
  selectedElements,
  setSelectedElements,
  updateElement,
  batchUpdateElements,
  deleteElement,
  deleteElements,
  reparentToBox,
  duplicateElement,
  moveElementUp,
  moveElementDown,
  bringElementToFront,
  sendElementToBack,
  onAddElement,
  onAddMultipleElements,
  canvasSize: canvasSizeProp,
  zoom,
  setZoom,
  pan,
  setPan,
  showGrid,
  setShowGrid,
  snapEnabled,
  setSnapEnabled,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onGroup,
  onUngroup,
  onOpenJsonEditor,
  onOpenLineProperties,
  onOpenProjectJsonEditor,
  onExportDesign,
  onRenderSequence,
  onExportLayers,
  onDownloadProject,
  onOpenEditorSettings,
  editorMode = false,
  onBackToMain,
  background,
  onUpdateBackground,
  onSavePreset,
  userId,
  isGuest = false,
  onSaveProject,
  onExitToHome,
  onSaveProjectFile,
  onLoadProjectFile,
  onCreateShape,
  onLoadPreset,
  onPasteElements,
  onFitToScreen,
  onResetZoom,
  onClearCanvas,
  onResetTransform,
  onViewCanvas,
  presets,
  canvasViewport,
  onApplyTextAnimationControl,
  onManipulationStart,
  onManipulationEnd,
}) => {
  const { startTutorial, showWelcomeModal, hideWelcomeModal, state: tutorialState } = useTutorial();
  const [showGridSettings, setShowGridSettings] = useState(false);
  const [activeTool, setActiveTool] = useState<'select' | 'line' | 'pen'>('select');
  const [drawingDefaults, setDrawingDefaults] = useState<DrawingDefaults>({ stroke: '#FFFFFF', strokeWidth: 4, opacity: 1 });
  const [isLayersPanelCollapsed, setIsLayersPanelCollapsed] = useState(false);
  const [isPropertiesPanelCollapsed, setIsPropertiesPanelCollapsed] = useState(false);
  const [showExitConfirmModal, setShowExitConfirmModal] = useState(false);
  const [showAdvancedConfirm, setShowAdvancedConfirm] = useState(false);
  const [showAutoSequenceModal, setShowAutoSequenceModal] = useState(false);

  const [leftColumnWidth, setLeftColumnWidth] = useState(25);
  const [rightColumnWidth, setRightColumnWidth] = useState(25);
  const [topRowHeight, setTopRowHeight] = useState(60);

  const [propertiesPanelTab, setPropertiesPanelTab] = useState<'design' | 'fx'>('design');
  const { selectClip, state: animationState, createSequence, getActiveSequence, updateSequence } = useAnimation();

  const handleDeleteClips = useCallback((ids: string[]) => {
    if (deleteElements) {
      deleteElements(ids);
    } else {
      ids.forEach(id => deleteElement(id));
    }
    setSelectedElements([]);
  }, [deleteElement, deleteElements, setSelectedElements]);
  const activeSequence = getActiveSequence();

  const [designModePan, setDesignModePan] = useState({ x: 0, y: 0 });
  const [designModeZoom, setDesignModeZoom] = useState(1);
  const syncingRef = React.useRef(false);

  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

  const handleDoubleClickElement = useCallback((elementId: string) => {
    const el = elements.find(e => e.id === elementId);
    if (el?.type === 'group') {
      setActiveGroupId(elementId);
      setSelectedElements([]);
      return;
    }
  }, [elements, setSelectedElements]);

  const handleEnterGroup = useCallback((groupId: string) => {
    setActiveGroupId(groupId);
    setSelectedElements([]);
  }, [setSelectedElements]);

  const handleExitGroup = useCallback(() => {
    setActiveGroupId(null);
    setSelectedElements([]);
  }, [setSelectedElements]);

  const canvasSize = canvasSizeProp || { width: 3840, height: 2160 };
  const {
    gridSettings,
    gridCalculations,
    updateGridSettings,
    toggleGrid,
    toggleSnap
  } = useGridSystem(canvasSize);

  const viewport: CanvasViewport = React.useMemo(() => ({
    width: window.innerWidth * 0.5,
    height: window.innerHeight,
    scrollX: pan.x,
    scrollY: pan.y,
    zoom
  }), [pan.x, pan.y, zoom]);

  const calculateInitialZoom = useCallback(() => {
    const layersWidth = window.innerWidth * 0.25;
    const propertiesWidth = window.innerWidth * 0.25;
    const padding = 40;

    const availableWidth = window.innerWidth - layersWidth - propertiesWidth - padding;
    const availableHeight = window.innerHeight * 0.6 - 100;

    const zoomX = availableWidth / canvasSize.width;
    const zoomY = availableHeight / canvasSize.height;

    return Math.min(zoomX, zoomY, 1) * 0.8;
  }, [canvasSize.width, canvasSize.height]);

  useEffect(() => {
    const initialZoom = calculateInitialZoom();
    setZoom(initialZoom);
    setPan({ x: 0, y: 0 });
  }, [calculateInitialZoom, setZoom, setPan]);

  useEffect(() => {
    const handleResize = () => {
      const newZoom = calculateInitialZoom();
      setZoom(newZoom);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [calculateInitialZoom, setZoom]);

  useEffect(() => {
    if (!activeSequence) {
      setShowAutoSequenceModal(true);
    }
  }, []);

  useEffect(() => {
    if (syncingRef.current) {
      syncingRef.current = false;
      return;
    }

    if (selectedElements.length === 1) {
      syncingRef.current = true;
      selectClip(selectedElements[0]);
    } else {
      syncingRef.current = true;
      selectClip(null);
    }
  }, [selectedElements, selectClip]);

  useEffect(() => {
    if (syncingRef.current) {
      syncingRef.current = false;
      return;
    }

    if (selectedElements.length > 1) return;

    const selectedClipId = animationState.timeline.selectedClipId;

    if (selectedClipId && selectedElements.length === 1 && selectedElements[0] === selectedClipId) {
      return;
    }

    if (selectedClipId) {
      syncingRef.current = true;
      setSelectedElements([selectedClipId]);
    } else if (selectedElements.length > 0) {
      syncingRef.current = true;
      setSelectedElements([]);
    }
  }, [animationState.timeline.selectedClipId, selectedElements, setSelectedElements]);

  const handleExitClick = useCallback(() => {
    setShowExitConfirmModal(true);
  }, []);

  const handleSaveAndExit = useCallback(async () => {
    setShowExitConfirmModal(false);
    if (onSaveProject) {
      try {
        await onSaveProject();
      } catch (error) {
        console.error('Error saving project:', error);
      }
    }
    if (onExitToHome) {
      onExitToHome();
    }
  }, [onSaveProject, onExitToHome]);

  const handleExitOnly = useCallback(() => {
    setShowExitConfirmModal(false);
    if (onExitToHome) {
      onExitToHome();
    }
  }, [onExitToHome]);

  const handleSaveCurrentProject = useCallback(async () => {
    if (onSaveProject) {
      try {
        await onSaveProject();
      } catch (error) {
        console.error('Error saving project:', error);
      }
    }
  }, [onSaveProject]);

  const handleCreateSequence = useCallback((sequence: Sequence) => {
    createSequence(sequence.name, sequence.frameRate, sequence.duration, sequence.canvasId);
  }, [createSequence]);

  const handleEditSequence = useCallback((sequence: Sequence) => {
    updateSequence(sequence.id, {
      name: sequence.name,
      frameRate: sequence.frameRate,
      duration: sequence.duration,
    });
  }, [updateSequence]);

  const selectedElementsData = elements.filter(el => selectedElements.includes(el.id));

  const centerColumnWidth = 100 - leftColumnWidth - rightColumnWidth;
  const bottomRowHeight = 100 - topRowHeight;

  return (
    <div className={`${editorMode ? 'h-screen' : 'h-[calc(100vh-80px)]'} bg-gray-900 overflow-hidden editor-cursor-default`}>
      <div className={`h-full transition-opacity duration-150 ${isTransitioning ? 'opacity-50' : 'opacity-100'}`} style={{
        display: 'grid',
        zoom: '0.8',
        transformOrigin: 'top left',
        gridTemplateColumns: `${leftColumnWidth}% ${centerColumnWidth}% ${rightColumnWidth}%`,
        gridTemplateRows: `${topRowHeight}% ${bottomRowHeight}%`,
      }}>
        <div className="bg-gray-800/50 backdrop-blur-xl border-r border-gray-700/50 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-hidden">
            <LayersPanel
              elements={elements}
              selectedElements={selectedElements}
              setSelectedElements={setSelectedElements}
              updateElement={updateElement}
              deleteElement={deleteElement}
              duplicateElement={duplicateElement}
              moveElementUp={moveElementUp}
              moveElementDown={moveElementDown}
              bringElementToFront={bringElementToFront}
              sendElementToBack={sendElementToBack}
              onGroup={onGroup}
              onUngroup={onUngroup}
              onOpenJsonEditor={onOpenJsonEditor}
              onOpenLineProperties={onOpenLineProperties}
              onOpenProjectJsonEditor={onOpenProjectJsonEditor}
              onAddElement={onAddElement}
              onAddMultipleElements={onAddMultipleElements}
              onUpdateElement={updateElement}
              isCollapsed={isLayersPanelCollapsed}
              onToggleCollapse={() => setIsLayersPanelCollapsed(!isLayersPanelCollapsed)}
              onSavePreset={onSavePreset}
              userId={userId}
              isGuest={isGuest}
              onSaveProject={onSaveProject}
              onExitToHome={onExitToHome}
            />
          </div>
          <div className="flex-shrink-0">
            <TimelineControlsPanel />
          </div>
        </div>

        <div className="flex flex-col overflow-hidden">
          <div className="flex-shrink-0">
            <HorizontalShapesBar
              onAddElement={onAddElement}
              onAddMultipleElements={onAddMultipleElements}
              canvasSize={canvasSize}
              viewport={viewport}
              zoom={zoom}
              setZoom={setZoom}
              onOpenGridSettings={() => setShowGridSettings(true)}
              onOpenEditorSettings={onOpenEditorSettings}
              onOpenTutorial={showWelcomeModal}
              onExportDesign={onExportDesign}
              onRenderSequence={onRenderSequence}
              onExportLayers={onExportLayers}
              onDownloadProject={onDownloadProject}
              gridEnabled={gridSettings.enabled}
              snapEnabled={gridSettings.snapEnabled}
              onToggleGrid={toggleGrid}
              onToggleSnap={toggleSnap}
              onLoadProject={onLoadProjectFile}
              onSaveCurrentProject={handleSaveCurrentProject}
              onExitToHome={handleExitClick}
              canUndo={canUndo}
              canRedo={canRedo}
              onUndo={onUndo}
              onRedo={onRedo}
              currentMode="design"
              onModeChange={() => {}}
              isTransitioning={false}
              activeTool={activeTool}
              onSetActiveTool={setActiveTool}
            />
          </div>

          <div className="flex-1 flex flex-col bg-gray-900 relative overflow-hidden">
            <div ref={canvasContainerRef} className="flex-1 relative overflow-hidden" data-tutorial-target="canvas">
              <Canvas
                elements={elements}
                selectedElements={selectedElements}
                setSelectedElements={setSelectedElements}
                updateElement={updateElement}
                batchUpdateElements={batchUpdateElements}
                zoom={zoom}
                pan={pan}
                setPan={setPan}
                showGrid={!gridSettings.enabled && showGrid}
                onDuplicateElement={duplicateElement}
                onDeleteElement={deleteElement}
                onReparentToBox={reparentToBox}
                onMoveElementUp={moveElementUp}
                onMoveElementDown={moveElementDown}
                onBringElementToFront={bringElementToFront}
                onSendElementToBack={sendElementToBack}
                snapEnabled={snapEnabled}
                gridSettings={gridSettings}
                gridCalculations={gridCalculations}
                onGridSnap={gridCalculations.snapToGrid}
                background={background}
                canvasWidth={canvasSize.width}
                canvasHeight={canvasSize.height}
                isEditMode={true}
                onCreateShape={onCreateShape}
                onLoadPreset={onLoadPreset}
                onPasteElements={onPasteElements}
                setZoom={setZoom}
                onFitToScreen={onFitToScreen}
                onResetZoom={onResetZoom}
                setShowGrid={toggleGrid}
                setSnapEnabled={toggleSnap}
                onClearCanvas={onClearCanvas}
                onResetTransform={onResetTransform}
                onViewCanvas={onViewCanvas}
                hasClipboard={false}
                presets={presets}
                canvasViewport={viewport}
                activeTool={activeTool}
                onSetActiveTool={setActiveTool}
                onAddElement={onAddElement}
                onDoubleClickElement={handleDoubleClickElement}
                activeGroupId={activeGroupId}
                onEnterGroup={handleEnterGroup}
                onExitGroup={handleExitGroup}
                drawingDefaults={drawingDefaults}
              />
            </div>

            <DrawingToolsBar
              activeTool={activeTool}
              onSetActiveTool={setActiveTool}
              onSetDrawingDefaults={setDrawingDefaults}
            />

            <div className="flex-shrink-0">
              <LayoutBar
                currentMode={currentMode}
                onModeChange={setMode}
                isTransitioning={isTransitioning}
                onRequestAdvancedMode={() => setShowAdvancedConfirm(true)}
              />
            </div>
          </div>
        </div>

        <div className="bg-gray-800/50 backdrop-blur-xl border-l border-gray-700/50 overflow-hidden" data-tutorial-target="properties-panel">
          <PropertiesPanel
            selectedElements={selectedElementsData}
            updateElement={updateElement}
            isCollapsed={isPropertiesPanelCollapsed}
            onToggleCollapse={() => setIsPropertiesPanelCollapsed(!isPropertiesPanelCollapsed)}
            background={background}
            onUpdateBackground={onUpdateBackground}
            currentTab={propertiesPanelTab}
            onTabChange={(tab) => setPropertiesPanelTab(tab as 'design' | 'fx')}
            hideEditTab={true}
            hideSelectionCount={true}
            onApplyTextAnimationControl={onApplyTextAnimationControl}
            canvasSize={canvasSize}
            onInteractionStart={onManipulationStart}
            onInteractionEnd={onManipulationEnd}
            allElements={elements}
          />
        </div>

        <div style={{ gridColumn: '1 / 3' }} className="overflow-hidden border-r border-gray-700/50">
          {activeSequence ? (
            <div className="h-full" style={{ display: 'grid', gridTemplateColumns: `${(leftColumnWidth / (leftColumnWidth + centerColumnWidth)) * 100}% 1fr` }}>
              <div className="overflow-hidden" data-tutorial-target="general-timeline">
                <GeneralTimeline elements={elements} compactMode={true} selectedCanvasElements={selectedElements} onAudioClipSelect={() => { setSelectedElements([]); selectClip(null); }} onDeleteClips={handleDeleteClips} />
              </div>
              <div className="overflow-hidden" data-tutorial-target="animation-timeline">
                <AnimationTimeline
                  elements={elements}
                  activeSequence={activeSequence}
                  onEditSequence={handleEditSequence}
                  multipleSelected={selectedElements.length > 1}
                />
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center bg-gray-900/50">
              <button
                onClick={() => setShowAutoSequenceModal(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-500 hover:text-gray-300 border border-gray-700/50 hover:border-gray-600 rounded-lg transition-all duration-200 bg-gray-800/30 hover:bg-gray-800/60"
              >
                <span>+ New Sequence</span>
              </button>
            </div>
          )}
        </div>

        <div className="bg-gray-800/50 backdrop-blur-xl border-l border-gray-700/50 overflow-hidden">
          <div className="h-full flex flex-col">
            <div className="px-3 py-2 border-b border-gray-700/50">
              <h3 className="text-xs font-semibold text-white">Edit Tab</h3>
            </div>
            <div className="flex-1 overflow-hidden">
              <KeyframeEditor selectedElements={selectedElementsData} />
            </div>
          </div>
        </div>
      </div>

      <GridSettingsPanel
        isOpen={showGridSettings}
        onClose={() => setShowGridSettings(false)}
        gridSettings={gridSettings}
        updateGridSettings={updateGridSettings}
        shapeSnapEnabled={snapEnabled}
        onToggleShapeSnap={() => setSnapEnabled(!snapEnabled)}
      />

      <TutorialOverlay />

      <TutorialWelcomeModal
        isOpen={tutorialState.showWelcomeModal}
        onStartTutorial={startTutorial}
        onOpenYoutube={() => {
          window.open('https://www.youtube.com/@FlashFX', '_blank');
          hideWelcomeModal();
        }}
        onClose={hideWelcomeModal}
      />

      <ExitConfirmModal
        isOpen={showExitConfirmModal}
        onClose={() => setShowExitConfirmModal(false)}
        onSaveAndExit={handleSaveAndExit}
        onExitOnly={handleExitOnly}
      />

      <AdvancedModeConfirmModal
        isOpen={showAdvancedConfirm}
        onConfirm={() => {
          setShowAdvancedConfirm(false);
          setMode('advanced');
        }}
        onCancel={() => setShowAdvancedConfirm(false)}
      />

      <CreateSequenceModal
        isOpen={showAutoSequenceModal}
        onClose={() => setShowAutoSequenceModal(false)}
        onCreate={(name, frameRate, duration) => {
          createSequence(name, frameRate, duration, 'current-canvas');
          setShowAutoSequenceModal(false);
        }}
      />


    </div>
  );
};

export default AdvancedModeLayout;
