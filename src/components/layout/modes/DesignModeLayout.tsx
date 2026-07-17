import React, { useState, useCallback, useEffect, useRef } from 'react';
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
import ResizableSplitter from '../../timeline/ResizableSplitter';
import TutorialOverlay from '../../tutorial/TutorialOverlay';
import TutorialWelcomeModal from '../../tutorial/TutorialWelcomeModal';
import { useTutorial } from '../../../contexts/TutorialContext';
import { Preset } from '../../../types/preset';
import CreateSequenceModal from '../../sequence/CreateSequenceModal';
import DrawingToolsBar, { DrawingDefaults } from '../../DrawingToolsBar';
import { useMobileLandscape } from '../../../hooks/useMobileLandscape';
import MobileLandscapeLayout from '../../mobile/MobileLandscapeLayout';
import { useVideo } from '../../../video/VideoContext';
import { VideoAsset } from '../../../video/types';
import { useUIStore } from '../../../store/uiStore';

interface DesignModeLayoutProps {
  // Mode state
  currentMode: LayoutMode;
  setMode: (mode: LayoutMode) => void;
  isTransitioning: boolean;

  // Canvas state
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

  // Canvas dimensions
  canvasSize?: { width: number; height: number };

  // Canvas controls
  zoom: number;
  setZoom: (zoom: number) => void;
  pan: { x: number; y: number };
  setPan: (pan: { x: number; y: number }) => void;
  showGrid: boolean;
  setShowGrid: (show: boolean) => void;
  snapEnabled: boolean;
  setSnapEnabled: (enabled: boolean) => void;
  
  // History
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  
  // Group operations
  onGroup: () => void;
  onUngroup: () => void;
  
  // JSON Editor
  onOpenJsonEditor: (element: DesignElement) => void;
  
  // Line Properties
  onOpenLineProperties: () => void;
  
  // Project JSON Editor
  onOpenProjectJsonEditor: () => void;
  
  // Export
  onExportDesign?: () => void;
  onRenderSequence?: () => void;
  onExportLayers?: () => void;
  onDownloadProject?: () => void;

  // Editor Settings
  onOpenEditorSettings?: () => void;

  // Editor mode
  editorMode?: boolean;
  onBackToMain?: () => void;

  // Background
  background?: BackgroundConfig;
  onUpdateBackground?: (background: BackgroundConfig) => void;

  // Presets
  onSavePreset?: (name: string, description: string, elements: DesignElement[]) => Promise<void>;
  userId?: string | null;
  isGuest?: boolean;

  // Project Save/Exit
  onSaveProject?: () => Promise<void>;
  onExitToHome?: () => void;

  // Project File Management
  onSaveProjectFile?: () => void;
  onLoadProjectFile?: () => void;

  // Canvas Context Menu
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

  // Text Animation Control
  onApplyTextAnimationControl?: (elementId: string) => void;

  // Interaction tracking for history
  onManipulationStart?: () => void;
  onManipulationEnd?: () => void;

}

const DesignModeLayout: React.FC<DesignModeLayoutProps> = ({
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
  const isMobileLandscape = useMobileLandscape();
  const {
    activeTool, setActiveTool,
    isLayersPanelCollapsed, setLayersPanelCollapsed,
    isPropertiesPanelCollapsed, setPropertiesPanelCollapsed,
    showGridSettings, setShowGridSettings,
    showExitConfirmModal, setShowExitConfirmModal,
    showAdvancedConfirmModal: showAdvancedConfirm, setShowAdvancedConfirmModal: setShowAdvancedConfirm,
    showAutoSequenceModal, setShowAutoSequenceModal,
    importError, setImportError,
    importStatus, setImportStatus,
    propertiesPanelTab, setPropertiesPanelTab,
  } = useUIStore();
  const setIsLayersPanelCollapsed = setLayersPanelCollapsed;
  const setIsPropertiesPanelCollapsed = setPropertiesPanelCollapsed;
  const [drawingDefaults, setDrawingDefaults] = useState<DrawingDefaults>({ stroke: '#FFFFFF', strokeWidth: 4, opacity: 1 });
  const [pendingImageElement, setPendingImageElement] = useState<DesignElement | null>(null);
  const [pendingVideoAsset, setPendingVideoAsset] = useState<VideoAsset | null>(null);
  const { placeVideoAsset, updateClip, videoState } = useVideo();
  const prevModeRef = useRef<LayoutMode>(currentMode);

  const [leftColumnWidth, setLeftColumnWidth] = useState(25);
  const [rightColumnWidth, setRightColumnWidth] = useState(25);
  const [topRowHeight, setTopRowHeight] = useState(60);

  const previousTabRef = useRef<'design' | 'edit' | 'fx'>('design');
  const prevSelectedCountRef = useRef<number>(0);

  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

  const canvasSizeForHandler = canvasSizeProp || { width: 3840, height: 2160 };

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

  const handlePlaceVideoAsset = useCallback((asset: VideoAsset, canvasX: number, canvasY: number) => {
    const cs = canvasSizeForHandler;
    const maxDim = Math.min(cs.width, cs.height) / 3;
    const scale = Math.min(maxDim / asset.width, maxDim / asset.height, 1);
    const displayW = Math.round(asset.width * scale);
    const displayH = Math.round(asset.height * scale);
    const x = canvasX - displayW / 2;
    const y = canvasY - displayH / 2;
    const clipId = placeVideoAsset(asset.id, x, y, displayW, displayH);
    if (!clipId) return;
    const element: DesignElement = {
      id: clipId,
      type: 'video',
      name: asset.fileName.replace(/\.[^.]+$/, ''),
      x,
      y,
      width: displayW,
      height: displayH,
      rotation: 0,
      opacity: 1,
      locked: false,
      visible: true,
      fill: 'transparent',
      stroke: 'transparent',
      strokeWidth: 0,
      borderRadius: 0,
      shadow: { blur: 0, color: '#000000', x: 0, y: 0 },
      videoClipId: clipId,
      videoAssetId: asset.id,
    };
    onAddElement(element);
    setSelectedElements([clipId]);
  }, [placeVideoAsset, onAddElement, setSelectedElements, canvasSizeForHandler]);

  // Animation context for syncing selection
  const { selectClips, state: animationState, createSequence, getActiveSequence, updateSequence } = useAnimation();

  const handleDeleteClips = React.useCallback((ids: string[]) => {
    if (deleteElements) {
      deleteElements(ids);
    } else {
      ids.forEach(id => deleteElement(id));
    }
    setSelectedElements([]);
  }, [deleteElement, deleteElements, setSelectedElements]);
  const activeSequence = getActiveSequence();

  // Store design mode pan/zoom when switching to edit mode
  const [designModePan, setDesignModePan] = useState({ x: 0, y: 0 });
  const [designModeZoom, setDesignModeZoom] = useState(1);

  // Track if we're syncing to prevent infinite loops
  const syncingRef = React.useRef(false);

  // Ref that always holds the latest selectedElements without being a reactive dependency.
  // Used by the timeline→canvas sync effect so that effect only fires when selectedClipIds
  // changes, not when selectedElements changes (which would cause stale-closure deselection).
  const selectedElementsRef = React.useRef(selectedElements);
  React.useEffect(() => { selectedElementsRef.current = selectedElements; });

  // Grid system - use prop or default to 4K
  const canvasSize = canvasSizeProp || { width: 3840, height: 2160 };
  const {
    gridSettings,
    gridCalculations,
    updateGridSettings,
    toggleGrid,
    toggleSnap
  } = useGridSystem(canvasSize);

  // Canvas viewport for shape creation
  const viewport: CanvasViewport = React.useMemo(() => ({
    width: window.innerWidth * 0.5, // 50% for canvas
    height: window.innerHeight,
    scrollX: pan.x,
    scrollY: pan.y,
    zoom
  }), [pan.x, pan.y, zoom]);

  // Calculate initial zoom to fit canvas properly
  const calculateInitialZoom = useCallback(() => {
    const layersWidth = window.innerWidth * 0.25;
    const propertiesWidth = window.innerWidth * 0.25;
    const padding = 40;

    const availableWidth = window.innerWidth - layersWidth - propertiesWidth - padding;
    const availableHeight = window.innerHeight - 100;

    const zoomX = availableWidth / canvasSize.width;
    const zoomY = availableHeight / canvasSize.height;

    return Math.min(zoomX, zoomY, 1) * 0.8;
  }, [canvasSize.width, canvasSize.height]);

  // Initialize zoom on mount
  useEffect(() => {
    const layersWidth = window.innerWidth * (leftColumnWidth / 100);
    const propertiesWidth = window.innerWidth * (rightColumnWidth / 100);
    const padding = 40;
    const availableWidth = window.innerWidth - layersWidth - propertiesWidth - padding;
    const availableHeight = window.innerHeight - 100;
    const initialZoom = calculateInitialZoom();
    const initialPanX = (availableWidth - canvasSize.width * initialZoom) / 2;
    const initialPanY = (availableHeight - canvasSize.height * initialZoom) / 2;
    setZoom(initialZoom);
    setPan({ x: initialPanX, y: initialPanY });
  }, [calculateInitialZoom, setZoom, setPan, leftColumnWidth, rightColumnWidth, canvasSize.width, canvasSize.height]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      const newZoom = calculateInitialZoom();
      setZoom(newZoom);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [calculateInitialZoom, setZoom]);

  // Handle mode switching - center canvas in edit mode
  // Note: pan and zoom are intentionally NOT in dependency array to avoid infinite loops
  // We capture their values at the moment of mode switch, which is the desired behavior
  useEffect(() => {
    if (currentMode === 'edit') {
      // Save current design mode state (capture current pan/zoom values)
      setDesignModePan(pan);
      setDesignModeZoom(zoom);

      // Calculate center position for edit mode
      // Calculate center column width first (must be done before using it)
      const calculatedCenterColumnWidth = 100 - leftColumnWidth - rightColumnWidth;

      // Available viewport is the center column in the top row
      const centerColumnWidthPx = window.innerWidth * (calculatedCenterColumnWidth / 100);
      const availableHeight = window.innerHeight * (topRowHeight / 100);

      // Calculate zoom to fit canvas in available space with padding
      const padding = 60;
      const availableWidthForCanvas = centerColumnWidthPx - padding;
      const availableHeightForCanvas = availableHeight - padding;

      const zoomX = availableWidthForCanvas / canvasSize.width;
      const zoomY = availableHeightForCanvas / canvasSize.height;
      const newZoom = Math.min(zoomX, zoomY, 1) * 0.9;

      // Center the canvas in the available viewport
      const scaledCanvasWidth = canvasSize.width * newZoom;
      const scaledCanvasHeight = canvasSize.height * newZoom;
      const centerX = (centerColumnWidthPx - scaledCanvasWidth) / 2;
      const centerY = (availableHeight - scaledCanvasHeight) / 2;

      setZoom(newZoom);
      setPan({ x: centerX, y: centerY });
    } else if (currentMode === 'design') {
      // Restore design mode state
      setZoom(designModeZoom);
      setPan(designModePan);
    }
  }, [currentMode, leftColumnWidth, rightColumnWidth, topRowHeight, canvasSize.width, canvasSize.height, setZoom, setPan]);

  useEffect(() => {
    const prevMode = prevModeRef.current;
    prevModeRef.current = currentMode;
    if (currentMode === 'edit' && prevMode !== 'edit' && !activeSequence) {
      setShowAutoSequenceModal(true);
    }
  }, [currentMode, activeSequence]);

  useEffect(() => {
    const prev = prevSelectedCountRef.current;
    const curr = selectedElements.length;
    prevSelectedCountRef.current = curr;
    if (curr > 0 && prev === 0) {
      setPropertiesPanelTab('design');
    }
  }, [selectedElements, setPropertiesPanelTab]);

  useEffect(() => {
    if (syncingRef.current) {
      syncingRef.current = false;
      return;
    }

    if (selectedElements.length === 1) {
      syncingRef.current = true;
      selectClips([selectedElements[0]]);
    } else if (selectedElements.length > 1) {
      syncingRef.current = true;
      selectClips(selectedElements);
    } else {
      syncingRef.current = true;
      selectClips([]);
    }
  }, [selectedElements, selectClips]);

  useEffect(() => {
    if (animationState.timeline.selectedKeyframeIds.length >= 2) {
      setPropertiesPanelTab(current => {
        if (current !== 'edit') {
          previousTabRef.current = current;
        }
        return 'edit';
      });
    } else {
      setPropertiesPanelTab(current => {
        if (current === 'edit') {
          return previousTabRef.current;
        }
        return current;
      });
    }
  }, [animationState.timeline.selectedKeyframeIds]);

  useEffect(() => {
    // This effect syncs timeline clip selection → canvas element selection.
    // It intentionally does NOT include selectedElements in its dependency array.
    // Including selectedElements caused the effect to fire in both directions:
    // when timeline selection changed AND when canvas selection changed. The
    // canvas-triggered firing read a stale selectedClipIds value (empty, from the
    // previous render) and incorrectly called setSelectedElements([]), which
    // immediately deselected any clip that had just been clicked.
    // Using selectedElementsRef (updated every render via a layout-free effect)
    // lets us read the current canvas selection without making it a reactive dep.
    if (syncingRef.current) {
      syncingRef.current = false;
      return;
    }

    const selectedClipIds = animationState.timeline.selectedClipIds;
    const currentSelectedElements = selectedElementsRef.current;

    const currentSet = new Set(currentSelectedElements);
    const same = currentSelectedElements.length === selectedClipIds.length && selectedClipIds.every(id => currentSet.has(id));
    if (same) return;

    syncingRef.current = true;
    if (selectedClipIds.length > 0) {
      setSelectedElements(selectedClipIds);
    } else if (currentSelectedElements.length > 0) {
      setSelectedElements([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animationState.timeline.selectedClipIds, setSelectedElements]);

  useEffect(() => {
    for (const el of elements) {
      if (el.type !== 'video' || !el.videoClipId || !el.videoAssetId) continue;
      const asset = videoState.assets[el.videoAssetId];
      if (!asset) continue;
      updateClip(el.videoClipId, {
        transform: {
          x: el.x,
          y: el.y,
          scaleX: el.width / asset.width,
          scaleY: el.height / asset.height,
          rotation: el.rotation,
        },
        opacity: el.opacity,
      });
    }
  }, [elements, videoState.assets, updateClip]);

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

  // Determine grid layout based on current mode
  const gridLayout = currentMode === 'design'
    ? {
        gridTemplateColumns: `${leftColumnWidth}% ${centerColumnWidth}% ${rightColumnWidth}%`,
        gridTemplateRows: '100%', // Single row for design mode
      }
    : {
        gridTemplateColumns: `${leftColumnWidth}% ${centerColumnWidth}% ${rightColumnWidth}%`,
        gridTemplateRows: `${topRowHeight}% ${bottomRowHeight}%`, // Two rows for edit mode
      };

  if (isMobileLandscape) {
    const mobileCanvas = (
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
        isEditMode={currentMode === 'edit'}
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
        pendingImageElement={pendingImageElement}
        onClearPendingImageElement={() => setPendingImageElement(null)}
        pendingVideoAsset={pendingVideoAsset}
        onClearPendingVideoAsset={() => setPendingVideoAsset(null)}
        onPlaceVideoAsset={handlePlaceVideoAsset}
        onDoubleClickElement={handleDoubleClickElement}
        drawingDefaults={drawingDefaults}
        activeGroupId={activeGroupId}
        onEnterGroup={handleEnterGroup}
        onExitGroup={handleExitGroup}
      />
    );

    const mobileLeftDrawer = (
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
        onSetActiveTool={setActiveTool}
        onSetPendingImageElement={setPendingImageElement}
        onSetPendingVideoAsset={setPendingVideoAsset}
        isCollapsed={false}
        onToggleCollapse={() => {}}
        onSavePreset={onSavePreset}
        userId={userId}
        isGuest={isGuest}
        onSaveProject={onSaveProject}
        onExitToHome={onExitToHome}
      />
    );

    const mobileRightDrawer = (
      <PropertiesPanel
        selectedElements={selectedElementsData}
        updateElement={updateElement}
        isCollapsed={false}
        onToggleCollapse={() => {}}
        background={background}
        onUpdateBackground={onUpdateBackground}
        currentTab={propertiesPanelTab}
        onTabChange={setPropertiesPanelTab}
        canvasSize={canvasSize}
        onApplyTextAnimationControl={onApplyTextAnimationControl}
        hideEditTab={true}
        onInteractionStart={onManipulationStart}
        onInteractionEnd={onManipulationEnd}
        allElements={elements}
      />
    );

    const mobileTimeline = currentMode === 'edit' && activeSequence ? (
      <div className="h-full" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
        <GeneralTimeline elements={elements} selectedCanvasElements={selectedElements} onAudioClipSelect={() => { setSelectedElements([]); selectClips([]); }} onSelectClips={(ids) => { syncingRef.current = true; setSelectedElements(ids); }} onDeleteClips={handleDeleteClips} />
        <AnimationTimeline
          elements={elements}
          activeSequence={activeSequence}
          onEditSequence={handleEditSequence}
          multipleSelected={selectedElements.length > 1}
        />
      </div>
    ) : undefined;

    return (
      <div className="h-screen bg-gray-900 overflow-hidden" style={{ touchAction: 'none' }}>
        <MobileLandscapeLayout
          canvasElement={mobileCanvas}
          leftDrawerContent={mobileLeftDrawer}
          rightDrawerContent={mobileRightDrawer}
          onUndo={onUndo}
          onRedo={onRedo}
          canUndo={canUndo}
          canRedo={canRedo}
          onExportDesign={onExportDesign}
          onExitToHome={handleExitClick}
          onSaveCurrentProject={handleSaveCurrentProject}
          activeTool={activeTool}
          setActiveTool={setActiveTool}
          currentMode={currentMode}
          setMode={setMode}
          isTransitioning={isTransitioning}
          zoom={zoom}
          setZoom={setZoom}
          pan={pan}
          setPan={setPan}
          timelineContent={mobileTimeline}
          showTimeline={currentMode === 'edit'}
        >
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
            onOpenYoutube={() => { window.open('https://www.youtube.com/@FlashFX', '_blank'); hideWelcomeModal(); }}
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
            onConfirm={() => { setShowAdvancedConfirm(false); setMode('advanced'); }}
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
          {importStatus && (
            <div className={`fixed bottom-16 left-1/2 -translate-x-1/2 z-[99999] flex items-center gap-3 text-xs font-medium px-4 py-3 rounded-xl shadow-2xl max-w-xs transition-all ${
              importStatus.type === 'success' ? 'bg-emerald-900/95 border border-emerald-700/60 text-emerald-200' :
              importStatus.type === 'error' ? 'bg-red-900/95 border border-red-700/60 text-red-200' :
              'bg-blue-900/95 border border-blue-700/60 text-blue-200'
            }`}>
              {importStatus.type === 'loading' && <span className="shrink-0 w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />}
              {importStatus.type === 'success' && <span className="shrink-0 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center text-white text-[10px] font-bold">&#x2713;</span>}
              {importStatus.type === 'error' && <span className="shrink-0 w-4 h-4 rounded-full bg-red-500 flex items-center justify-center text-white text-[10px] font-bold">!</span>}
              <span>{importStatus.message}</span>
            </div>
          )}
        </MobileLandscapeLayout>
      </div>
    );
  }

  return (
    <div className={`${editorMode ? 'h-screen' : 'h-[calc(100vh-80px)]'} bg-gray-900 overflow-hidden editor-cursor-default`}>
      <div className={`h-full transition-opacity duration-150 ${isTransitioning ? 'opacity-50' : 'opacity-100'}`} style={{
        display: 'grid',
        zoom: '0.8',
        transformOrigin: 'top left',
        ...gridLayout
      }}>
        {/* Top Row - Three Columns */}
        {/* Layers Panel (Left Column) */}
        <div className="bg-gray-800/50 backdrop-blur-xl border-r border-gray-700/50 overflow-hidden">
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
            onSetActiveTool={setActiveTool}
            onSetPendingImageElement={setPendingImageElement}
            onSetPendingVideoAsset={setPendingVideoAsset}
            isCollapsed={isLayersPanelCollapsed}
            onToggleCollapse={() => setIsLayersPanelCollapsed(!isLayersPanelCollapsed)}
            onSavePreset={onSavePreset}
            userId={userId}
            isGuest={isGuest}
            onSaveProject={onSaveProject}
            onExitToHome={onExitToHome}
          />
        </div>

        {/* Center Column (Canvas + Red Bar) */}
        <div className="flex flex-col overflow-hidden">
          {/* Red Toolbar Bar - Preserved exactly as is */}
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

          {/* Canvas Area + Layout Bar Container */}
          <div className="flex-1 flex flex-col bg-gray-900 relative overflow-hidden">
            {/* Canvas Area */}
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
                isEditMode={currentMode === 'edit'}
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
                pendingImageElement={pendingImageElement}
                onClearPendingImageElement={() => setPendingImageElement(null)}
                pendingVideoAsset={pendingVideoAsset}
                onClearPendingVideoAsset={() => setPendingVideoAsset(null)}
                onPlaceVideoAsset={handlePlaceVideoAsset}
                onDoubleClickElement={handleDoubleClickElement}
                drawingDefaults={drawingDefaults}
                activeGroupId={activeGroupId}
                onEnterGroup={handleEnterGroup}
                onExitGroup={handleExitGroup}
              />
            </div>

            {/* Drawing Tools Bar */}
            <DrawingToolsBar
              activeTool={activeTool}
              onSetActiveTool={setActiveTool}
              onSetDrawingDefaults={setDrawingDefaults}
            />

            {/* Layout Bar - Fixed at bottom of preview panel */}
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

        {/* Properties Panel (Right Column) */}
        <div className="bg-gray-800/50 backdrop-blur-xl border-l border-gray-700/50 overflow-hidden" data-tutorial-target="properties-panel">
          <PropertiesPanel
            selectedElements={selectedElementsData}
            updateElement={updateElement}
            isCollapsed={isPropertiesPanelCollapsed}
            onToggleCollapse={() => setIsPropertiesPanelCollapsed(!isPropertiesPanelCollapsed)}
            background={background}
            onUpdateBackground={onUpdateBackground}
            currentTab={propertiesPanelTab}
            onTabChange={setPropertiesPanelTab}
            canvasSize={canvasSize}
            onApplyTextAnimationControl={onApplyTextAnimationControl}
            hideEditTab={true}
            onInteractionStart={onManipulationStart}
            onInteractionEnd={onManipulationEnd}
            allElements={elements}
          />
        </div>

        {/* Bottom Row - Two Timelines (50% / 50%) spanning full width - Only visible in Edit mode */}
        {currentMode === 'edit' && (
          <div style={{ gridColumn: '1 / 4' }} className="overflow-hidden">
            {activeSequence ? (
              <div className="h-full" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                {/* General Timeline (Left 50%) */}
                <div className="overflow-hidden" data-tutorial-target="general-timeline">
                  <GeneralTimeline elements={elements} selectedCanvasElements={selectedElements} onAudioClipSelect={() => { setSelectedElements([]); selectClips([]); }} onSelectClips={(ids) => { syncingRef.current = true; setSelectedElements(ids); }} onDeleteClips={handleDeleteClips} />
                </div>
                {/* Animation Timeline (Right 50%) */}
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
        )}
      </div>
      
      {/* Grid Settings Panel */}
      <GridSettingsPanel
        isOpen={showGridSettings}
        onClose={() => setShowGridSettings(false)}
        gridSettings={gridSettings}
        updateGridSettings={updateGridSettings}
        shapeSnapEnabled={snapEnabled}
        onToggleShapeSnap={() => setSnapEnabled(!snapEnabled)}
      />

      {/* Tutorial Overlay */}
      <TutorialOverlay />

      {/* Tutorial Welcome Modal */}
      <TutorialWelcomeModal
        isOpen={tutorialState.showWelcomeModal}
        onStartTutorial={startTutorial}
        onOpenYoutube={() => {
          window.open('https://www.youtube.com/@FlashFX', '_blank');
          hideWelcomeModal();
        }}
        onClose={hideWelcomeModal}
      />

      {/* Exit Confirmation Modal */}
      <ExitConfirmModal
        isOpen={showExitConfirmModal}
        onClose={() => setShowExitConfirmModal(false)}
        onSaveAndExit={handleSaveAndExit}
        onExitOnly={handleExitOnly}
      />

      {/* Advanced Mode Confirmation Modal */}
      <AdvancedModeConfirmModal
        isOpen={showAdvancedConfirm}
        onConfirm={() => {
          setShowAdvancedConfirm(false);
          setMode('advanced');
        }}
        onCancel={() => setShowAdvancedConfirm(false)}
      />

      {/* Auto-triggered sequence creation modal */}
      <CreateSequenceModal
        isOpen={showAutoSequenceModal}
        onClose={() => setShowAutoSequenceModal(false)}
        onCreate={(name, frameRate, duration) => {
          createSequence(name, frameRate, duration, 'current-canvas');
          setShowAutoSequenceModal(false);
        }}
      />

      {importStatus && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[99999] flex items-center gap-3 text-xs font-medium px-4 py-3 rounded-xl shadow-2xl max-w-md transition-all ${
          importStatus.type === 'success' ? 'bg-emerald-900/95 border border-emerald-700/60 text-emerald-200' :
          importStatus.type === 'error' ? 'bg-red-900/95 border border-red-700/60 text-red-200' :
          'bg-blue-900/95 border border-blue-700/60 text-blue-200'
        }`}>
          {importStatus.type === 'loading' && (
            <span className="shrink-0 w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          )}
          {importStatus.type === 'success' && (
            <span className="shrink-0 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center text-white text-[10px] font-bold">&#x2713;</span>
          )}
          {importStatus.type === 'error' && (
            <span className="shrink-0 w-4 h-4 rounded-full bg-red-500 flex items-center justify-center text-white text-[10px] font-bold">!</span>
          )}
          <span>{importStatus.message}</span>
          {importStatus.type !== 'loading' && (
            <button onClick={() => setImportStatus(null)} className="ml-2 shrink-0 text-current opacity-60 hover:opacity-100 transition-opacity">&#x2715;</button>
          )}
        </div>
      )}


    </div>
  );
};

export default DesignModeLayout;