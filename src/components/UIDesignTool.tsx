import React, { useState, useCallback, useRef } from 'react';
import { ExportManager, ExportConfig } from '../export/ExportManager';
import { MP4ExportPipeline, MP4ExportConfig, MP4ExportProgress } from '../export/MP4ExportPipeline';
import RenderProgressModal from './modals/RenderProgressModal';
import LayoutManager from './layout/LayoutManager';
import LayoutModeSwitcher from './layout/LayoutModeSwitcher';
import ShortCutPopUpModal from './design-tool/ShortCutPopUpModal';
import JsonEditorModal from './design-tool/JsonEditorModal';
import ProjectJSONEditor from './design-tool/ProjectJSONEditor';
import LinePropertiesBar from './design-tool/LinePropertiesBar';
import EditorSettingsModal from './design-tool/EditorSettingsModal';
import { OnboardingModal, shouldShowOnboarding } from './modals/OnboardingModal';
import FlashFXAIComponent from './FlashFX_AI_Component';
import ProjectManager from './project/ProjectManager';
import { TutorialProvider } from '../contexts/TutorialContext';
import { AnimationProvider, useAnimation, usePlayback } from '../animation-engine';
import type { AnimationState } from '../animation-engine/types';
import { AudioProvider } from '../audio/AudioContext';
import { VideoProvider } from '../video/VideoContext';
import { DesignElement } from '../types/design';
import { BackgroundConfig, createDefaultBackground } from '../types/background';
import { othersSettingsService } from '../services/OthersSettingsService';
import { ProjectCanvas } from '../types/projectFile';
import { useCanvasHistory, CanvasState } from '../hooks/useCanvasHistory';
import { historyManager } from '../history/HistoryManager';
import { useLayoutMode } from '../hooks/useLayoutMode';
import { useGlobalKeyboardShortcuts } from '../hooks/useGlobalKeyboardShortcuts';
import { useGridSystem } from '../hooks/useGridSystem';
import { usePreviewAutoBackup } from '../hooks/usePreviewAutoBackup';
import { useAuth } from '../contexts/AuthContext';
import { createGroup, ungroupElements, updateElementInGroup, getAllElementsFlat } from '../utils/groupUtils';
import { CanvasViewport } from '../utils/canvasUtils';
import { PresetService } from '../services/PresetService';
import { supabase } from '../lib/supabase';
import { shapeDefaultsService } from '../services/ShapeDefaultsService';
import { createSolidColorMaterialConfig } from '../types/material';
import { getDefaultImageFilters } from '../utils/imageFilters';
import { Preset } from '../types/preset';
import { splitTextWithAnimation } from '../utils/textAnimationSplitter';
import { applyBoxLayouts } from '../layout/BoxLayoutEngine';

interface UIDesignToolProps {
  onBackToMain: () => void;
  editorMode?: boolean;
  projectId?: string | null;
}


interface UIDesignToolContentProps {
  onBackToMain: () => void;
  editorMode: boolean;
  projectId: string | null;
  isGuest: boolean;
  user: any;
}

const UIDesignToolContent: React.FC<UIDesignToolContentProps> = ({ onBackToMain, editorMode, projectId, isGuest, user }) => {
  const { updateKeyframesAtCurrentTime, state: animationState, deleteKeyframe, selectKeyframes, removeAnimation, selectClips, loadAnimations, loadAnimationState, getActiveSequence, setDuration, setFps, setLoop, setPixelsPerSecond, addMarker } = useAnimation();

  const initialState: CanvasState = {
    elements: [],
    selectedElements: []
  };

  const {
    currentState,
    pushToHistory,
    undo,
    redo,
    canUndo,
    canRedo,
    setCurrentState
  } = useCanvasHistory(initialState);

  const isManipulatingRef = React.useRef(false);
  const manipulationStartStateRef = React.useRef<CanvasState | null>(null);
  const latestElementsRef = React.useRef<DesignElement[]>([]);

  const [zoom, setZoom] = useState(0.25);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [showGrid, setShowGrid] = useState(true);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [showRenderModal, setShowRenderModal] = useState(false);
  const [renderBlob, setRenderBlob] = useState<Blob | null>(null);
  const [mp4Progress, setMp4Progress] = useState<MP4ExportProgress>({
    status: 'idle',
    currentFrame: 0,
    totalFrames: 0,
    percentage: 0,
    estimatedTimeRemaining: 0,
    message: '',
    startTime: null,
  });
  const mp4PipelineRef = useRef<MP4ExportPipeline | null>(null);
  const [exportManager] = useState(() => new ExportManager());
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [showJsonEditor, setShowJsonEditor] = useState(false);
  const [jsonEditorElement, setJsonEditorElement] = useState<DesignElement | null>(null);
  const [showProjectJsonEditor, setShowProjectJsonEditor] = useState(false);
  const [showLineProperties, setShowLineProperties] = useState(false);
  const [showEditorSettings, setShowEditorSettings] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => shouldShowOnboarding());
  const [projectName, setProjectName] = useState('Untitled Project');
  const [background, setBackground] = useState<BackgroundConfig>(() => {
    const bgDefaults = othersSettingsService.getBackground();
    return bgDefaults.enabled ? bgDefaults.config : createDefaultBackground();
  });
  const [projectLoaded, setProjectLoaded] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 3840, height: 2160 });
  const [projectCanvasSize, setProjectCanvasSize] = useState({ width: 3840, height: 2160 });
  const [presets, setPresets] = useState<Preset[]>([]);
  const [autoBackupInterval, setAutoBackupInterval] = useState(60000);

  // Load presets
  React.useEffect(() => {
    const loadPresets = async () => {
      if (isGuest) {
        const localPresets = PresetService.loadPresetsFromLocalStorage();
        setPresets(localPresets);
      } else if (user?.id) {
        try {
          const userPresets = await PresetService.getUserPresets(user.id);
          setPresets(userPresets);
        } catch (error) {
          console.error('Failed to load presets:', error);
        }
      }
    };
    loadPresets();
  }, [isGuest, user]);

  // Load project data when projectId is provided
  React.useEffect(() => {
    const loadProject = async () => {
      if (!projectId || projectLoaded) return;

      try {
        if (isGuest) {
          const stored = localStorage.getItem('flashfx_guest_projects');
          if (stored) {
            const projects = JSON.parse(stored);
            const project = projects.find((p: any) => p.id === projectId);
            if (project) {
              setProjectName(project.name);

              if (project.data?.projectFileLoaded && project.data?.elements) {
                const loadedElements = project.data.elements;
                const loadedCanvas = project.data.canvas;

                if (loadedElements.length > 0) {
                  pushToHistory({ elements: loadedElements, selectedElements: [] });
                }

                if (loadedCanvas) {
                  setZoom(loadedCanvas.zoom || 1);
                  setPan(loadedCanvas.pan || { x: 0, y: 0 });
                  setShowGrid(loadedCanvas.grid?.enabled ?? true);
                  setSnapEnabled(loadedCanvas.grid?.snap ?? true);
                  if (loadedCanvas.background) {
                    setBackground(loadedCanvas.background);
                  }
                  if (loadedCanvas.width && loadedCanvas.height) {
                    const size = { width: loadedCanvas.width, height: loadedCanvas.height };
                    setCanvasSize(size);
                    setProjectCanvasSize(size);
                  }
                }
              } else if (project.data?.canvas) {
                const canvas = project.data.canvas;
                if (canvas.width && canvas.height) {
                  const size = { width: canvas.width, height: canvas.height };
                  setCanvasSize(size);
                  setProjectCanvasSize(size);
                }
              } else if (project.data?.backgroundColor) {
                const bgConfig: BackgroundConfig = {
                  enabled: true,
                  layers: [{
                    id: 'layer-1',
                    type: 'solid',
                    angle: 0,
                    colorStops: [{
                      color: project.data.backgroundColor,
                      position: 0
                    }],
                    blendMode: 'normal',
                    opacity: 100
                  }]
                };
                setBackground(bgConfig);
              }
            }
          }
        } else if (user) {
          const { data, error } = await supabase
            .from('projects')
            .select('*')
            .eq('id', projectId)
            .single();

          if (!error && data) {
            setProjectName(data.name);

            if (data.data?.projectFileLoaded && data.data?.elements) {
              const loadedElements = data.data.elements;
              const loadedCanvas = data.data.canvas;

              if (loadedElements.length > 0) {
                pushToHistory({ elements: loadedElements, selectedElements: [] });
              }

              if (loadedCanvas) {
                setZoom(loadedCanvas.zoom || 1);
                setPan(loadedCanvas.pan || { x: 0, y: 0 });
                setShowGrid(loadedCanvas.grid?.enabled ?? true);
                setSnapEnabled(loadedCanvas.grid?.snap ?? true);
                if (loadedCanvas.background) {
                  setBackground(loadedCanvas.background);
                }
                if (loadedCanvas.width && loadedCanvas.height) {
                  const size = { width: loadedCanvas.width, height: loadedCanvas.height };
                  setCanvasSize(size);
                  setProjectCanvasSize(size);
                }
              }
            } else if (data.data?.canvas) {
              const canvas = data.data.canvas;
              if (canvas.width && canvas.height) {
                const size = { width: canvas.width, height: canvas.height };
                setCanvasSize(size);
                setProjectCanvasSize(size);
              }
            } else if (data.data?.backgroundColor) {
              const bgConfig: BackgroundConfig = {
                enabled: true,
                layers: [{
                  id: 'layer-1',
                  type: 'solid',
                  angle: 0,
                  colorStops: [{
                    color: data.data.backgroundColor,
                    position: 0
                  }],
                  blendMode: 'normal',
                  opacity: 100
                }]
              };
              setBackground(bgConfig);
            }
          }
        }
        setProjectLoaded(true);
      } catch (error) {
        console.error('Error loading project:', error);
      }
    };

    loadProject();
  }, [projectId, isGuest, user, projectLoaded]);

  usePreviewAutoBackup({
    projectId,
    isGuest,
    enabled: true,
    intervalMs: autoBackupInterval,
    quality: 0.8,
    maxWidth: 1280,
    maxHeight: 720
  });

  // Layout mode state
  const { currentMode, setMode, isTransitioning } = useLayoutMode();
  const { togglePlay } = usePlayback();

  // Grid system
  const {
    gridSettings,
    updateGridSettings,
    toggleGrid,
  } = useGridSystem(canvasSize);

  // Canvas viewport for shape creation
  const viewport: CanvasViewport = React.useMemo(() => ({
    width: window.innerWidth * 0.6,
    height: window.innerHeight * 0.6,
    scrollX: pan.x,
    scrollY: pan.y,
    zoom
  }), [pan.x, pan.y, zoom]);

  const currentCanvas: ProjectCanvas = {
    width: canvasSize.width,
    height: canvasSize.height,
    fps: 30,
    unit: 'px',
    background,
    grid: {
      enabled: showGrid,
      size: gridSettings.gridSize,
      snap: snapEnabled
    },
    zoom,
    pan
  };

  const handleProjectLoaded = useCallback((
    newElements: DesignElement[],
    newCanvas: ProjectCanvas,
    newAnimationState: AnimationState,
    _projectName: string
  ) => {
    const newState: CanvasState = {
      elements: newElements,
      selectedElements: []
    };
    pushToHistory(newState);

    setZoom(newCanvas.zoom || 0.25);
    setPan(newCanvas.pan || { x: 0, y: 0 });
    setShowGrid(newCanvas.grid?.enabled ?? true);
    setSnapEnabled(newCanvas.grid?.snap ?? true);

    if (newCanvas.background) {
      setBackground(newCanvas.background);
    }

    if (newCanvas.width && newCanvas.height) {
      const size = { width: newCanvas.width, height: newCanvas.height };
      setCanvasSize(size);
      setProjectCanvasSize(size);
    }

    loadAnimationState(newAnimationState.animations, newAnimationState.sequences ?? {}, newAnimationState.activeSequenceId ?? null);

    const tl = newAnimationState.timeline;
    if (tl.duration) setDuration(tl.duration);
    if (tl.fps) setFps(tl.fps);
    setLoop(tl.loop ?? false);
    if (tl.pixelsPerSecond) setPixelsPerSecond(tl.pixelsPerSecond);

    for (const marker of tl.markers ?? []) {
      addMarker(marker.time, marker.name, marker.color);
    }

  }, [pushToHistory, loadAnimationState, setCanvasSize, setProjectCanvasSize, setDuration, setFps, setLoop, setPixelsPerSecond, addMarker]);

  const updateCanvas = useCallback((newElements: DesignElement[], newSelectedElements?: string[], skipHistory = false) => {
    const newState: CanvasState = {
      elements: newElements,
      selectedElements: newSelectedElements ?? currentState.selectedElements
    };
    if (skipHistory || isManipulatingRef.current) {
      setCurrentState(newState);
    } else {
      pushToHistory(newState);
    }
  }, [pushToHistory, setCurrentState, currentState.selectedElements]);

  const updateElement = useCallback((id: string, updates: Partial<DesignElement>) => {
    updateKeyframesAtCurrentTime(id, updates);
    const baseElements = latestElementsRef.current.length > 0
      ? latestElementsRef.current
      : currentState.elements;
    const rawElements = updateElementInGroup(baseElements, id, updates);
    const newElements = applyBoxLayouts(rawElements);
    latestElementsRef.current = newElements;
    setCurrentState(prev => ({ elements: newElements, selectedElements: prev.selectedElements }));
  }, [currentState.elements, setCurrentState, updateKeyframesAtCurrentTime]);

  // Atomically applies position updates for all elements in a multi-drag commit.
  // Sequential updateElement calls can't be used here because each call reads from
  // a stale closure of currentState.elements, causing all but the last call to be lost.
  const batchUpdateElements = useCallback((updates: Array<{ id: string; x: number; y: number }>) => {
    const baseElements = latestElementsRef.current.length > 0
      ? latestElementsRef.current
      : currentState.elements;
    let rawElements = baseElements;
    for (const { id, x, y } of updates) {
      rawElements = updateElementInGroup(rawElements, id, { x, y });
    }
    const newElements = applyBoxLayouts(rawElements);
    latestElementsRef.current = newElements;
    setCurrentState(prev => ({ elements: newElements, selectedElements: prev.selectedElements }));
  }, [currentState.elements, setCurrentState]);

  const addElement = useCallback((element: DesignElement) => {
    const newElements = [...currentState.elements, element];
    updateCanvas(newElements, [element.id]);
  }, [currentState.elements, updateCanvas]);

  const addMultipleElements = useCallback((elements: DesignElement[]) => {
    const newElements = [...currentState.elements, ...elements];
    const newSelectedIds = elements.map(el => el.id);
    updateCanvas(newElements, newSelectedIds);
  }, [currentState.elements, updateCanvas]);

  const handleApplyTextAnimationControl = useCallback((elementId: string) => {
    const element = currentState.elements.find(el => el.id === elementId);
    if (!element || element.type !== 'text' || !element.textAnimationMode || element.textAnimationMode === 'whole') {
      console.log('Cannot apply animation control: element not found, not text, or mode is "whole"');
      return;
    }

    const mode = element.textAnimationMode;
    const staggerDelay = element.textAnimationStaggerDelay || 0.1;

    const animation = animationState.animations[elementId];

    const result = splitTextWithAnimation(element, animation, mode, staggerDelay);

    if (result.newElements.length > 0) {
      let newElements = currentState.elements.filter(el => el.id !== elementId);
      newElements = [...newElements, ...result.newElements];

      const updatedAnimations = { ...animationState.animations };

      Object.entries(result.newAnimations).forEach(([newElId, newAnim]) => {
        updatedAnimations[newElId] = newAnim;
      });

      if (animation) {
        delete updatedAnimations[elementId];
      }

      loadAnimations(updatedAnimations);

      const newSelectedIds = result.newElements.map(el => el.id);
      updateCanvas(newElements, newSelectedIds);

      console.log(`Successfully split text into ${result.newElements.length} units`);
    }
  }, [currentState.elements, animationState, updateCanvas, loadAnimations]);

  const deleteElement = useCallback((id: string) => {
    const target = currentState.elements.find(el => el.id === id);
    const childrenToRemove = new Set<string>();
    if (target && (target.type === 'hbox' || target.type === 'vbox') && target.childIds) {
      target.childIds.forEach(cid => childrenToRemove.add(cid));
    }
    const newElements = currentState.elements.filter(
      el => el.id !== id && !childrenToRemove.has(el.id)
    );
    const newSelected = currentState.selectedElements.filter(
      selId => selId !== id && !childrenToRemove.has(selId)
    );
    updateCanvas(newElements, newSelected);
  }, [currentState.elements, currentState.selectedElements, updateCanvas]);

  const deleteElements = useCallback((ids: string[]) => {
    const idSet = new Set(ids);
    const newElements = currentState.elements.filter(el => !idSet.has(el.id));
    updateCanvas(newElements, []);
  }, [currentState.elements, updateCanvas]);

  const reparentToBox = useCallback((elementId: string, containerId: string) => {
    const element = currentState.elements.find(el => el.id === elementId);
    const container = currentState.elements.find(el => el.id === containerId);
    if (!element || !container) return;
    const existingChildIds = container.childIds ?? [];
    if (existingChildIds.includes(elementId)) return;
    const rawElements = currentState.elements.map(el => {
      if (el.id === containerId) {
        return { ...el, childIds: [...existingChildIds, elementId] };
      }
      if (el.id === elementId) {
        return { ...el, parentId: containerId };
      }
      return el;
    });
    const newElements = applyBoxLayouts(rawElements);
    updateCanvas(newElements, currentState.selectedElements);
  }, [currentState.elements, currentState.selectedElements, updateCanvas]);

  const duplicateElement = useCallback((id: string) => {
    const allElements = getAllElementsFlat(currentState.elements);
    const element = allElements.find(el => el.id === id);
    if (element) {
      const newElement = {
        ...element,
        id: Date.now().toString(),
        x: element.x + 20,
        y: element.y + 20,
        name: `${element.name} Copy`
      };
      addElement(newElement);
    }
  }, [currentState.elements, addElement]);

  const setSelectedElements = useCallback((selectedIds: string[]) => {
    setCurrentState({
      elements: currentState.elements,
      selectedElements: selectedIds
    });
  }, [currentState.elements, setCurrentState]);

  const handleManipulationStart = useCallback(() => {
    if (!isManipulatingRef.current) {
      isManipulatingRef.current = true;
      manipulationStartStateRef.current = { ...currentState };
      latestElementsRef.current = currentState.elements;
      historyManager.beginAction('__bulk__', 'elements', 'Move / Resize', {
        kind: 'elements',
        elements: currentState.elements,
      });
    }
  }, [currentState]);

  const handleManipulationEnd = useCallback(() => {
    if (isManipulatingRef.current) {
      isManipulatingRef.current = false;
      const afterElements = latestElementsRef.current.length > 0
        ? latestElementsRef.current
        : currentState.elements;
      historyManager.commitAction({ kind: 'elements', elements: afterElements });
      manipulationStartStateRef.current = null;
    }
  }, [currentState]);

  // Keyboard shortcut handlers
  const handleDuplicate = useCallback(() => {
    if (currentState.selectedElements.length === 1) {
      duplicateElement(currentState.selectedElements[0]);
    }
  }, [currentState.selectedElements, duplicateElement]);

  const handleGroup = useCallback(() => {
    if (currentState.selectedElements.length >= 2) {
      const newElements = createGroup(currentState.elements, currentState.selectedElements);
      const newGroup = newElements.find(el => el.type === 'group' && !currentState.elements.find(existing => existing.id === el.id));
      updateCanvas(newElements, newGroup ? [newGroup.id] : []);
    }
  }, [currentState.elements, currentState.selectedElements, updateCanvas]);

  const handleUngroup = useCallback(() => {
    if (currentState.selectedElements.length === 1) {
      const selectedElement = currentState.elements.find(el => el.id === currentState.selectedElements[0]);
      if (selectedElement?.type === 'group') {
        const newElements = ungroupElements(currentState.elements, selectedElement.id);
        const childIds = selectedElement.children?.map(child => child.id) || [];
        updateCanvas(newElements, childIds);
      }
    }
  }, [currentState.elements, currentState.selectedElements, updateCanvas]);

  const handleDelete = useCallback(() => {
    const { selectedKeyframeIds, selectedClipId } = animationState.timeline;

    if (selectedKeyframeIds.length > 0 && selectedClipId) {
      const animation = animationState.animations[selectedClipId];
      if (animation) {
        animation.tracks.forEach(track => {
          selectedKeyframeIds.forEach(kfId => {
            const keyframe = track.keyframes.find(kf => kf.id === kfId);
            if (keyframe) {
              deleteKeyframe(selectedClipId, track.property, kfId);
            }
          });
        });
        selectKeyframes([]);
      }
    } else if (currentState.selectedElements.length > 0) {
      const ids = currentState.selectedElements;
      const idSet = new Set(ids);
      const newElements = currentState.elements.filter(el => !idSet.has(el.id));
      ids.forEach(id => {
        if (animationState.animations[id]) {
          removeAnimation(id);
        }
      });
      selectClips([]);
      updateCanvas(newElements, []);
    }
  }, [currentState.elements, currentState.selectedElements, updateCanvas, animationState, deleteKeyframe, selectKeyframes, removeAnimation, selectClips]);

  const handleNudge = useCallback((direction: 'up' | 'down' | 'left' | 'right', amount: number) => {
    if (currentState.selectedElements.length === 0) return;

    let newElements = [...currentState.elements];
    currentState.selectedElements.forEach(id => {
      const elementIndex = newElements.findIndex(el => el.id === id);
      if (elementIndex !== -1) {
        const element = newElements[elementIndex];
        let updates: Partial<DesignElement> = {};

        switch (direction) {
          case 'up':
            updates.y = element.y - amount;
            break;
          case 'down':
            updates.y = element.y + amount;
            break;
          case 'left':
            updates.x = element.x - amount;
            break;
          case 'right':
            updates.x = element.x + amount;
            break;
        }

        newElements = updateElementInGroup(newElements, id, updates);
      }
    });

    updateCanvas(newElements);
  }, [currentState.elements, currentState.selectedElements, updateCanvas]);

  const handleSelectAll = useCallback(() => {
    const allIds = currentState.elements.map(el => el.id);
    setSelectedElements(allIds);
  }, [currentState.elements, setSelectedElements]);

  const handleExportDesign = useCallback(async () => {
    const config: ExportConfig = {
      mode: 'canvas',
      projectName: projectName || 'FlashFX_Project',
      canvasWidth: canvasSize.width,
      canvasHeight: canvasSize.height,
      format: 'png',
      quality: 0.95,
    };
    try {
      await exportManager.exportCanvas(config, currentState.elements);
    } catch (error) {
      console.error('Export failed:', error);
    }
  }, [exportManager, projectName, canvasSize, currentState.elements]);

  const handleExportLayers = useCallback(async () => {
    const config: ExportConfig = {
      mode: 'stacked',
      projectName: projectName || 'FlashFX_Project',
      canvasWidth: canvasSize.width,
      canvasHeight: canvasSize.height,
      format: 'png',
      quality: 0.95,
    };
    try {
      await exportManager.exportShapesStacked(config, currentState.elements);
    } catch (error) {
      console.error('Export layers failed:', error);
    }
  }, [exportManager, projectName, canvasSize, currentState.elements]);

  const handleRenderSequence = useCallback(async () => {
    const activeSequence = getActiveSequence();
    if (!activeSequence) return;

    setRenderBlob(null);
    setShowRenderModal(true);
    setMp4Progress({
      status: 'loading',
      currentFrame: 0,
      totalFrames: Math.ceil(animationState.timeline.duration * animationState.timeline.fps),
      percentage: 0,
      estimatedTimeRemaining: 0,
      message: 'Initializing...',
      startTime: null,
    });

    const pipeline = new MP4ExportPipeline();
    mp4PipelineRef.current = pipeline;

    const mp4Config: MP4ExportConfig = {
      fps: animationState.timeline.fps,
      duration: animationState.timeline.duration,
      width: canvasSize.width,
      height: canvasSize.height,
      projectName: projectName || 'FlashFX_Project',
    };

    try {
      const blob = await pipeline.export(
        mp4Config,
        currentState.elements,
        animationState.animations,
        background,
        (p) => setMp4Progress(p)
      );
      setRenderBlob(blob);
      setMp4Progress(prev => ({
        ...prev,
        status: 'completed',
        percentage: 100,
        message: 'Export complete!',
      }));
    } catch (error) {
      if ((error as Error).message !== 'Export cancelled') {
        console.error('MP4 render failed:', error);
      }
      setMp4Progress(prev => ({
        ...prev,
        status: 'error',
        message: error instanceof Error ? error.message : 'Render failed',
      }));
    } finally {
      mp4PipelineRef.current = null;
    }
  }, [getActiveSequence, animationState, canvasSize, projectName, currentState.elements, background]);

  const handleCancelRender = useCallback(() => {
    mp4PipelineRef.current?.abort();
    setMp4Progress(prev => ({
      ...prev,
      status: 'error',
      message: 'Export cancelled by user',
    }));
  }, []);

  const handleDownloadRender = useCallback(() => {
    if (!renderBlob) return;
    const activeSequence = getActiveSequence();
    MP4ExportPipeline.downloadBlob(
      renderBlob,
      `${activeSequence?.name || projectName || 'animation'}.mp4`
    );
  }, [renderBlob, getActiveSequence, projectName]);

  const handleCloseRenderModal = useCallback(() => {
    setShowRenderModal(false);
    setMp4Progress({
      status: 'idle',
      currentFrame: 0,
      totalFrames: 0,
      percentage: 0,
      estimatedTimeRemaining: 0,
      message: '',
      startTime: null,
    });
    setRenderBlob(null);
  }, []);

  const handleDeselect = useCallback(() => {
    setSelectedElements([]);
  }, [setSelectedElements]);

  const handleToggleTimeline = useCallback(() => {
    setMode(currentMode === 'edit' ? 'design' : 'edit');
  }, [currentMode, setMode]);

  const moveElementUp = useCallback((id: string) => {
    const index = currentState.elements.findIndex(el => el.id === id);
    if (index < currentState.elements.length - 1) {
      const newElements = [...currentState.elements];
      [newElements[index], newElements[index + 1]] = [newElements[index + 1], newElements[index]];
      updateCanvas(newElements);
    }
  }, [currentState.elements, updateCanvas]);

  const moveElementDown = useCallback((id: string) => {
    const index = currentState.elements.findIndex(el => el.id === id);
    if (index > 0) {
      const newElements = [...currentState.elements];
      [newElements[index], newElements[index - 1]] = [newElements[index - 1], newElements[index]];
      updateCanvas(newElements);
    }
  }, [currentState.elements, updateCanvas]);

  const bringElementToFront = useCallback((id: string) => {
    const index = currentState.elements.findIndex(el => el.id === id);
    if (index !== -1 && index < currentState.elements.length - 1) {
      const newElements = [...currentState.elements];
      const [element] = newElements.splice(index, 1);
      newElements.push(element);
      updateCanvas(newElements);
    }
  }, [currentState.elements, updateCanvas]);

  const sendElementToBack = useCallback((id: string) => {
    const index = currentState.elements.findIndex(el => el.id === id);
    if (index > 0) {
      const newElements = [...currentState.elements];
      const [element] = newElements.splice(index, 1);
      newElements.unshift(element);
      updateCanvas(newElements);
    }
  }, [currentState.elements, updateCanvas]);

  const handleOpenJsonEditor = useCallback((element: DesignElement) => {
    setJsonEditorElement(element);
    setShowJsonEditor(true);
  }, []);

  const handleSaveJsonEdit = useCallback((updatedElement: DesignElement) => {
    updateElement(updatedElement.id, updatedElement);
    setShowJsonEditor(false);
    setJsonEditorElement(null);
  }, [updateElement]);

  const handleOpenLineProperties = useCallback(() => {
    const lineElements = currentState.elements.filter(el => 
      el.type === 'line' && currentState.selectedElements.includes(el.id)
    );
    if (lineElements.length > 0) {
      setShowLineProperties(true);
    }
  }, [currentState.elements, currentState.selectedElements]);
  const handleOpenProjectJsonEditor = useCallback(() => {
    setShowProjectJsonEditor(true);
  }, []);

  const handleApplyProject = useCallback((elements: DesignElement[], selectedElements: string[]) => {
    pushToHistory({ elements, selectedElements });
  }, [pushToHistory]);

  const handleShowShortcuts = useCallback(() => {
    setShowShortcutsModal(true);
  }, []);

  const handleOpenEditorSettings = useCallback(() => {
    setShowEditorSettings(true);
  }, []);

  const handleSavePreset = useCallback(async (name: string, description: string, elements: DesignElement[]) => {
    try {
      if (isGuest) {
        const localPresets = PresetService.loadPresetsFromLocalStorage();
        const newPreset = {
          id: `preset-${Date.now()}`,
          user_id: 'guest',
          name,
          description,
          elements,
          element_count: elements.length,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        PresetService.savePresetsToLocalStorage([...localPresets, newPreset]);
      } else if (user?.id) {
        await PresetService.createPreset(user.id, {
          name,
          description,
          elements,
          element_count: elements.length
        });
      }
    } catch (error) {
      console.error('Error saving preset:', error);
      throw error;
    }
  }, [isGuest, user]);

  const handleSaveProject = useCallback(async () => {
    if (!projectId) return;

    try {
      if (isGuest) {
        const stored = localStorage.getItem('flashfx_guest_projects');
        if (stored) {
          const projects = JSON.parse(stored);
          const updatedProjects = projects.map((p: any) => {
            if (p.id === projectId) {
              return {
                ...p,
                name: projectName,
                data: {
                  ...p.data,
                  projectFileLoaded: true,
                  elements: currentState.elements,
                  selectedElements: currentState.selectedElements,
                  canvas: currentCanvas,
                  background
                },
                updated_at: new Date().toISOString()
              };
            }
            return p;
          });
          localStorage.setItem('flashfx_guest_projects', JSON.stringify(updatedProjects));
        }
      } else if (user) {
        await supabase
          .from('projects')
          .update({
            name: projectName,
            data: {
              projectFileLoaded: true,
              elements: currentState.elements,
              selectedElements: currentState.selectedElements,
              canvas: currentCanvas,
              background
            },
            updated_at: new Date().toISOString()
          })
          .eq('id', projectId);
      }
    } catch (error) {
      console.error('Error saving project:', error);
      throw error;
    }
  }, [projectId, isGuest, user, projectName, currentState.elements, currentState.selectedElements, currentCanvas, background]);

  // Canvas context menu handlers
  const handleCreateShapeAtPosition = useCallback((type: 'rectangle' | 'circle' | 'line' | 'text' | 'image', clientX: number, clientY: number) => {
    const canvasElement = document.getElementById('canvas-artboard');
    if (!canvasElement) return;

    const rect = canvasElement.getBoundingClientRect();
    const x = (clientX - rect.left) / zoom;
    const y = (clientY - rect.top) / zoom;

    const defaultWidth = type === 'circle' ? 600 : type === 'text' ? 600 : type === 'line' ? 300 : 800;
    const defaultHeight = type === 'circle' ? 600 : type === 'text' ? 120 : type === 'line' ? 2 : 500;

    const element: Partial<DesignElement> = {
      id: Date.now().toString(),
      type,
      name: type.charAt(0).toUpperCase() + type.slice(1),
      x: Math.max(0, x - defaultWidth / 2),
      y: Math.max(0, y - defaultHeight / 2),
      width: defaultWidth,
      height: defaultHeight,
      rotation: 0,
      locked: false,
      visible: true
    };

    const defaultsKey = type === 'chat-bubble' ? 'chatBubble' : type === 'chat-frame' ? 'chatFrame' : type;
    const defaults = shapeDefaultsService.getShapeDefaults(defaultsKey as any);
    const defaultColor = (defaults as any).material?.color || (defaults as any).fill || '#3B82F6';
    const materialConfig = createSolidColorMaterialConfig(defaultColor);

    if (type === 'line') {
      const lineElement: DesignElement = {
        ...element,
        ...defaults,
        materialConfig,
        cornerRadius: 0,
        pointCornerRadii: [],
        points: [
          { x: 0, y: 0, radius: 0 },
          { x: 300, y: 0, radius: 0 }
        ],
        trimStart: 0,
        trimEnd: 1,
        closePath: false,
        autoScaleArrows: false
      } as DesignElement;
      addElement(lineElement);
    } else {
      addElement({ ...element, ...defaults, materialConfig } as DesignElement);
    }
  }, [addElement, pan, zoom]);

  const handleImportImageAtPosition = useCallback(async (clientX: number, clientY: number) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = false;

    input.onchange = async (e: Event) => {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0];
      if (!file) return;

      try {
        const asset = await mediaPoolService.createAssetFromFile(file);
        await mediaPoolService.addAsset(asset);

        const canvasElement = document.getElementById('canvas-artboard');
        if (!canvasElement) return;

        const rect = canvasElement.getBoundingClientRect();
        const x = (clientX - rect.left) / zoom;
        const y = (clientY - rect.top) / zoom;

        const maxImageSize = 400;
        let width = asset.width;
        let height = asset.height;
        const aspectRatio = width / height;

        if (width > maxImageSize || height > maxImageSize) {
          if (width > height) {
            width = maxImageSize;
            height = width / aspectRatio;
          } else {
            height = maxImageSize;
            width = height * aspectRatio;
          }
        }

        const imageElement: DesignElement = {
          id: Date.now().toString(),
          type: 'image',
          name: asset.name,
          x: Math.max(0, x - width / 2),
          y: Math.max(0, y - height / 2),
          width,
          height,
          rotation: 0,
          opacity: 1,
          locked: false,
          visible: true,
          fill: 'transparent',
          stroke: 'transparent',
          strokeWidth: 0,
          borderRadius: 0,
          shadow: {
            blur: 0,
            color: 'transparent',
            x: 0,
            y: 0
          },
          imageData: asset.data,
          originalWidth: asset.width,
          originalHeight: asset.height,
          aspectRatioLocked: true,
          blendMode: 'normal',
          filters: getDefaultImageFilters()
        };

        addElement(imageElement);
      } catch (error) {
        console.error('Failed to import image:', error);
      }
    };

    input.click();
  }, [addElement, pan, zoom]);

  const handleLoadPresetAtPosition = useCallback(async (preset: Preset, clientX: number, clientY: number) => {
    const canvasElement = document.getElementById('canvas-artboard');
    if (!canvasElement) return;

    const rect = canvasElement.getBoundingClientRect();
    const x = (clientX - rect.left) / zoom;
    const y = (clientY - rect.top) / zoom;

    const elements = JSON.parse(JSON.stringify(preset.elements)) as DesignElement[];

    let minX = Infinity;
    let minY = Infinity;
    elements.forEach(el => {
      if (el.x < minX) minX = el.x;
      if (el.y < minY) minY = el.y;
    });

    const offsetX = x - minX;
    const offsetY = y - minY;

    elements.forEach(el => {
      el.id = `${Date.now()}-${Math.random()}`;
      el.x += offsetX;
      el.y += offsetY;
    });

    addMultipleElements(elements);
  }, [addMultipleElements, pan, zoom]);

  const handlePasteAtPosition = useCallback((clientX: number, clientY: number, inPlace: boolean) => {
    // TODO: Implement paste functionality with clipboard
    console.log('Paste at position:', clientX, clientY, inPlace);
  }, []);

  const getCenteredPan = useCallback((containerWidth: number, containerHeight: number, targetZoom: number) => ({
    x: (containerWidth - canvasSize.width * targetZoom) / 2,
    y: (containerHeight - canvasSize.height * targetZoom) / 2,
  }), [canvasSize]);

  const handleFitToScreen = useCallback(() => {
    const container = document.getElementById('canvas-container');
    if (!container) return;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    const padding = 80;
    const zoomX = (containerWidth - padding * 2) / canvasSize.width;
    const zoomY = (containerHeight - padding * 2) / canvasSize.height;
    const newZoom = Math.min(zoomX, zoomY, 1);
    setZoom(newZoom);
    setPan(getCenteredPan(containerWidth, containerHeight, newZoom));
  }, [canvasSize, getCenteredPan]);

  const handleResetZoom = useCallback(() => {
    const container = document.getElementById('canvas-container');
    const newZoom = 1;
    setZoom(newZoom);
    if (container) {
      setPan(getCenteredPan(container.clientWidth, container.clientHeight, newZoom));
    } else {
      setPan({ x: 0, y: 0 });
    }
  }, [getCenteredPan]);

  const handleClearCanvas = useCallback(() => {
    updateCanvas([], []);
  }, [updateCanvas]);

  const handleViewCanvas = useCallback(() => {
    setPan({ x: 0, y: 0 });
  }, [setPan]);

  const handleResetTransform = useCallback(() => {
    const container = document.getElementById('canvas-container');
    const newZoom = 1;
    setZoom(newZoom);
    if (container) {
      setPan(getCenteredPan(container.clientWidth, container.clientHeight, newZoom));
    } else {
      setPan({ x: 0, y: 0 });
    }
  }, [getCenteredPan]);

  // Enhanced keyboard shortcuts with shortcut modal
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Ctrl + Alt + Shift + S
      if (e.ctrlKey && e.altKey && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleShowShortcuts();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleShowShortcuts]);
  
  // Global keyboard shortcuts
  React.useEffect(() => {
    console.log('[UIDesignTool] useGlobalKeyboardShortcuts props:', {
      canvasSize,
      viewport,
      addElement: typeof addElement,
      selectedElementsCount: currentState.selectedElements.length,
      elementsCount: currentState.elements.length
    });
  }, [canvasSize, viewport, currentState.selectedElements.length, currentState.elements.length]);

  useGlobalKeyboardShortcuts({
    onAddElement: addElement,
    selectedElements: currentState.selectedElements,
    elements: currentState.elements,
    setSelectedElements,
    updateElement,
    duplicateElement: handleDuplicate,
    onDelete: handleDelete,
    onSelectAll: handleSelectAll,
    onDeselect: handleDeselect,
    onGroup: handleGroup,
    onUngroup: handleUngroup,
    canvasSize,
    viewport,
    snapEnabled,
    setSnapEnabled,
    gridEnabled: gridSettings.enabled,
    toggleGrid,
    onNudge: handleNudge,
    zoom,
    setZoom,
    onResetZoom: handleResetTransform,
    onUndo: undo,
    onRedo: redo,
    canUndo,
    canRedo,
    onExport: handleExportDesign,
    onTogglePlay: togglePlay,
    onToggleTimeline: handleToggleTimeline,
  });
  


  return (
    <TutorialProvider>
      <ProjectManager
        elements={currentState.elements}
        canvas={currentCanvas}
        animationState={animationState}
        userId={user?.id || null}
        userName={user?.email || null}
        onProjectLoaded={handleProjectLoaded}
      >
        {({ handleSaveClick, handleLoadClick, currentProjectName }) => (
          <div className="h-full flex flex-col">
          {/* Main Layout Area */}
          <div className="flex-1">
            <LayoutManager
              currentMode={currentMode}
              setMode={setMode}
              isTransitioning={isTransitioning}
              elements={currentState.elements}
              selectedElements={currentState.selectedElements}
              setSelectedElements={setSelectedElements}
              updateElement={updateElement}
              batchUpdateElements={batchUpdateElements}
              deleteElement={deleteElement}
              deleteElements={deleteElements}
              reparentToBox={reparentToBox}
              duplicateElement={duplicateElement}
              moveElementUp={moveElementUp}
              moveElementDown={moveElementDown}
              bringElementToFront={bringElementToFront}
              sendElementToBack={sendElementToBack}
              onAddElement={addElement}
              canvasSize={canvasSize}
              zoom={zoom}
              setZoom={setZoom}
              pan={pan}
              setPan={setPan}
              showGrid={showGrid}
              setShowGrid={setShowGrid}
              snapEnabled={snapEnabled}
              setSnapEnabled={setSnapEnabled}
              canUndo={canUndo}
              canRedo={canRedo}
              onUndo={undo}
          onRedo={redo}
          onGroup={handleGroup}
          onUngroup={handleUngroup}
          onManipulationStart={handleManipulationStart}
          onManipulationEnd={handleManipulationEnd}
          onExportDesign={handleExportDesign}
          onRenderSequence={handleRenderSequence}
          onExportLayers={handleExportLayers}
          onDownloadProject={handleSaveClick}
          onOpenJsonEditor={handleOpenJsonEditor}
          onOpenLineProperties={handleOpenLineProperties}
          onOpenProjectJsonEditor={handleOpenProjectJsonEditor}
          onOpenEditorSettings={handleOpenEditorSettings}
          editorMode={editorMode}
          onBackToMain={onBackToMain}
          background={background}
          onUpdateBackground={setBackground}
          onAddMultipleElements={addMultipleElements}
          onSavePreset={handleSavePreset}
          userId={user?.id || null}
          isGuest={isGuest}
          onSaveProject={handleSaveProject}
          onExitToHome={onBackToMain}
          onSaveProjectFile={handleSaveClick}
          onLoadProjectFile={handleLoadClick}
          onCreateShape={handleCreateShapeAtPosition}
          onImportImage={handleImportImageAtPosition}
          onLoadPreset={handleLoadPresetAtPosition}
          onPasteElements={handlePasteAtPosition}
          onFitToScreen={handleFitToScreen}
          onResetZoom={handleResetZoom}
          onClearCanvas={handleClearCanvas}
          onResetTransform={handleResetTransform}
          onViewCanvas={handleViewCanvas}
          presets={presets}
          canvasViewport={viewport}
          onApplyTextAnimationControl={handleApplyTextAnimationControl}
            />
          </div>

          <FlashFXAIComponent 
        onAddElement={addElement}
        onAddMultipleElements={addMultipleElements}
        onUpdateElement={updateElement}
      />
      
      <RenderProgressModal
        isOpen={showRenderModal}
        progress={{
          status: mp4Progress.status === 'loading' ? 'preloading' :
                  mp4Progress.status === 'capturing' ? 'rendering' :
                  mp4Progress.status as 'idle' | 'preloading' | 'rendering' | 'encoding' | 'completed' | 'error',
          currentFrame: mp4Progress.currentFrame,
          totalFrames: mp4Progress.totalFrames,
          percentage: mp4Progress.percentage,
          estimatedTimeRemaining: mp4Progress.estimatedTimeRemaining,
          message: mp4Progress.message,
          startTime: mp4Progress.startTime,
        }}
        onCancel={handleCancelRender}
        onClose={handleCloseRenderModal}
        onDownload={handleDownloadRender}
        renderBlob={renderBlob}
        sequenceName={getActiveSequence()?.name || projectName}
        sequenceDuration={animationState.timeline.duration}
      />
      
      <ShortCutPopUpModal
        isOpen={showShortcutsModal}
        onClose={() => setShowShortcutsModal(false)}
      />
      
      <JsonEditorModal
        isOpen={showJsonEditor}
        onClose={() => {
          setShowJsonEditor(false);
          setJsonEditorElement(null);
        }}
        element={jsonEditorElement}
        onSave={handleSaveJsonEdit}
        elementAnimation={jsonEditorElement ? (animationState.animations[jsonEditorElement.id] ?? null) : null}
      />

      <ProjectJSONEditor
        isOpen={showProjectJsonEditor}
        onClose={() => setShowProjectJsonEditor(false)}
        onApplyProject={handleApplyProject}
        projectElements={currentState.elements}
        selectedElements={currentState.selectedElements}
        animationState={animationState}
        projectName={projectName}
        canvasSize={canvasSize}
      />
      
      <LinePropertiesBar
        selectedElements={currentState.elements.filter(el =>
          el.type === 'line' && currentState.selectedElements.includes(el.id)
        )}
        updateElement={updateElement}
        isOpen={showLineProperties}
        onClose={() => setShowLineProperties(false)}
      />

      <OnboardingModal
        isOpen={showOnboarding}
        onClose={() => setShowOnboarding(false)}
      />

      <EditorSettingsModal
        isOpen={showEditorSettings}
        onClose={() => setShowEditorSettings(false)}
        projectName={projectName}
        onProjectNameChange={setProjectName}
        gridSettings={gridSettings}
        updateGridSettings={updateGridSettings}
        shapeSnapEnabled={snapEnabled}
        onToggleShapeSnap={() => setSnapEnabled(!snapEnabled)}
        canvasSize={canvasSize}
        onCanvasSizeChange={setCanvasSize}
        autoBackupInterval={autoBackupInterval}
        onAutoBackupIntervalChange={setAutoBackupInterval}
      />
        </div>
        )}
      </ProjectManager>
    </TutorialProvider>
  );
};

const UIDesignTool: React.FC<UIDesignToolProps> = ({ onBackToMain, editorMode = false, projectId = null }) => {
  const { isGuest, user } = useAuth();

  return (
    <AnimationProvider>
      <AudioProvider>
        <VideoProvider>
          <UIDesignToolContent
            onBackToMain={onBackToMain}
            editorMode={editorMode}
            projectId={projectId}
            isGuest={isGuest}
            user={user}
          />
        </VideoProvider>
      </AudioProvider>
    </AnimationProvider>
  );
};

export default UIDesignTool;