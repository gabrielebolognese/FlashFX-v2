import React, { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import VideoRenderer from '../../video/VideoRenderer';
import { DesignElement } from '../../types/design';
import { VideoAsset } from '../../video/types';
import { BackgroundConfig, generateBackgroundStyle } from '../../types/background';
import EnhancedDesignElementComponent from './EnhancedDesignElementComponent';
import { canvasEngine } from '../../engine/CanvasEngine';
import ContextMenu from './ContextMenu';
import CanvasContextMenu from './CanvasContextMenu';
import SnapGuides from './SnapGuides';
import { useSnapping } from '../../hooks/useSnapping';
import AdvancedGrid from './AdvancedGrid';
import { GridSettings, GridCalculations } from '../../hooks/useGridSystem';
import { useAnimation, globalToLocalTime } from '../../animation-engine';
import { usePlaybackCurrentTime, usePlaybackStore } from '../../store/playbackStore';
import { Preset } from '../../types/preset';
import { CanvasViewport, createShapeAtPosition } from '../../utils/canvasUtils';
import { updateChildInGroup } from '../../utils/groupUtils';

const SHAPE_PLACEMENT_TOOLS = ['rectangle', 'circle', 'text', 'chat-bubble', 'chat-frame', 'star', 'gradient', 'adjustment-layer', 'hbox', 'vbox'] as const;
type ShapePlacementTool = typeof SHAPE_PLACEMENT_TOOLS[number];
const SHAPE_TOOL_LABELS: Record<ShapePlacementTool, string> = {
  'rectangle': 'Rectangle',
  'circle': 'Circle',
  'text': 'Text',
  'chat-bubble': 'Chat Bubble',
  'chat-frame': 'Chat Frame',
  'star': 'Star',
  'gradient': 'Gradient',
  'adjustment-layer': 'Adjustment Layer',
  'hbox': 'HBox',
  'vbox': 'VBox',
};
const isShapePlacementTool = (tool: string): tool is ShapePlacementTool =>
  SHAPE_PLACEMENT_TOOLS.includes(tool as ShapePlacementTool);

interface CanvasProps {
  elements: DesignElement[];
  selectedElements: string[];
  setSelectedElements: (ids: string[]) => void;
  updateElement: (id: string, updates: Partial<DesignElement>) => void;
  batchUpdateElements?: (updates: Array<{ id: string; x: number; y: number }>) => void;
  activeGroupId?: string | null;
  onEnterGroup?: (groupId: string) => void;
  onExitGroup?: () => void;
  zoom: number;
  pan: { x: number; y: number };
  setPan: (pan: { x: number; y: number }) => void;
  showGrid: boolean;
  onDuplicateElement: (id: string) => void;
  onDeleteElement: (id: string) => void;
  onReparentToBox?: (elementId: string, containerId: string) => void;
  onMoveElementUp: (id: string) => void;
  onMoveElementDown: (id: string) => void;
  onBringElementToFront: (id: string) => void;
  onSendElementToBack: (id: string) => void;
  snapEnabled?: boolean;
  gridSettings?: GridSettings;
  gridCalculations?: GridCalculations;
  onGridSnap?: (x: number, y: number) => { x: number; y: number };
  background?: BackgroundConfig;
  canvasWidth?: number;
  canvasHeight?: number;
  isEditMode?: boolean;
  onCreateShape?: (type: 'rectangle' | 'circle' | 'line' | 'text' | 'image', x: number, y: number) => void;
  onLoadPreset?: (preset: Preset, x: number, y: number) => void;
  onPasteElements?: (x: number, y: number, inPlace: boolean) => void;
  setZoom?: (zoom: number) => void;
  onFitToScreen?: () => void;
  onResetZoom?: () => void;
  setShowGrid?: (show: boolean) => void;
  setSnapEnabled?: (enabled: boolean) => void;
  onClearCanvas?: () => void;
  onResetTransform?: () => void;
  onViewCanvas?: () => void;
  hasClipboard?: boolean;
  presets?: Preset[];
  canvasViewport?: CanvasViewport;
  activeTool?: string;
  onSetActiveTool?: (tool: string) => void;
  onAddElement?: (element: DesignElement) => void;
  pendingImageElement?: DesignElement | null;
  onClearPendingImageElement?: () => void;
  pendingVideoAsset?: VideoAsset | null;
  onClearPendingVideoAsset?: () => void;
  onPlaceVideoAsset?: (asset: VideoAsset, canvasX: number, canvasY: number) => void;
  onDoubleClickElement?: (elementId: string) => void;
  drawingDefaults?: {
    stroke?: string;
    strokeWidth?: number;
    opacity?: number;
    lineCap?: 'round' | 'butt' | 'square';
    lineJoin?: 'round' | 'bevel' | 'miter';
    smoothing?: number;
    pressureSensitive?: boolean;
  };
}

const DEFAULT_CANVAS_WIDTH = 3840;
const DEFAULT_CANVAS_HEIGHT = 2160;

const Canvas: React.FC<CanvasProps> = ({
  elements,
  selectedElements,
  setSelectedElements,
  updateElement,
  batchUpdateElements,
  activeGroupId = null,
  onEnterGroup,
  onExitGroup,
  zoom,
  pan,
  setPan,
  showGrid,
  onDuplicateElement,
  onDeleteElement,
  onReparentToBox,
  onMoveElementUp,
  onMoveElementDown,
  onBringElementToFront,
  onSendElementToBack,
  snapEnabled = true,
  gridSettings,
  gridCalculations,
  onGridSnap,
  background,
  canvasWidth = DEFAULT_CANVAS_WIDTH,
  canvasHeight = DEFAULT_CANVAS_HEIGHT,
  isEditMode = false,
  onCreateShape,
  onLoadPreset,
  onPasteElements,
  setZoom,
  onFitToScreen,
  onResetZoom,
  setShowGrid,
  setSnapEnabled,
  onClearCanvas,
  onResetTransform,
  onViewCanvas,
  hasClipboard = false,
  presets = [],
  canvasViewport,
  activeTool = 'select',
  onSetActiveTool,
  onAddElement,
  pendingImageElement = null,
  onClearPendingImageElement,
  pendingVideoAsset = null,
  onClearPendingVideoAsset,
  onPlaceVideoAsset,
  onDoubleClickElement,
  drawingDefaults,
}) => {
  const { getAnimatedElementState, hasKeyframesForProperty, addKeyframe, getTrack, state: animationState } = useAnimation();
  const currentTime = usePlaybackCurrentTime();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const artboardRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [shouldClearSelection, setShouldClearSelection] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    elementId: string | null;
    type: 'element' | 'canvas';
  } | null>(null);
  const [selectionBox, setSelectionBox] = useState<{
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  } | null>(null);
  const [hoveredElement, setHoveredElement] = useState<string | null>(null);
  const [isCtrlHeld, setIsCtrlHeld] = useState(false);
  const [manipulatingElements, setManipulatingElements] = useState<Set<string>>(new Set());
  const manipulatedPropertiesRef = useRef<Map<string, Set<string>>>(new Map());

  const selectedElementsRef = useRef(selectedElements);
  const elementsRef = useRef(elements);
  useEffect(() => { selectedElementsRef.current = selectedElements; }, [selectedElements]);
  useEffect(() => { elementsRef.current = elements; }, [elements]);

  const multiDragInitialPositions = useRef<Map<string, { x: number; y: number; width: number; height: number }>>(new Map());
  const multiDragPrimaryId = useRef<string | null>(null);
  const secondaryFinalPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  const [dropTargetBoxId, setDropTargetBoxId] = useState<string | null>(null);
  const dropTargetBoxIdRef = useRef<string | null>(null);

  const touchStateRef = useRef<{ touches: React.Touch[]; lastZoom: number; lastPan: { x: number; y: number } } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      touchStateRef.current = {
        touches: [e.touches[0], e.touches[1]],
        lastZoom: zoom,
        lastPan: pan,
      };
    }
  }, [zoom, pan]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 2 || !touchStateRef.current) return;
    e.preventDefault();

    const t1 = e.touches[0];
    const t2 = e.touches[1];
    const s1 = touchStateRef.current.touches[0];
    const s2 = touchStateRef.current.touches[1];

    const prevDist = Math.hypot(s2.clientX - s1.clientX, s2.clientY - s1.clientY);
    const newDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
    const pinchRatio = prevDist > 0 ? newDist / prevDist : 1;

    const prevMidX = (s1.clientX + s2.clientX) / 2;
    const prevMidY = (s1.clientY + s2.clientY) / 2;
    const newMidX = (t1.clientX + t2.clientX) / 2;
    const newMidY = (t1.clientY + t2.clientY) / 2;

    const panDeltaX = newMidX - prevMidX;
    const panDeltaY = newMidY - prevMidY;

    const newZoom = Math.max(0.05, Math.min(3, zoom * pinchRatio));
    if (setZoom) setZoom(newZoom);
    setPan({ x: pan.x + panDeltaX, y: pan.y + panDeltaY });

    touchStateRef.current = {
      touches: [t1, t2],
      lastZoom: newZoom,
      lastPan: { x: pan.x + panDeltaX, y: pan.y + panDeltaY },
    };
  }, [zoom, pan, setZoom, setPan]);

  const handleTouchEnd = useCallback(() => {
    touchStateRef.current = null;
  }, []);

  const [lineDrawingPoints, setLineDrawingPoints] = useState<{ x: number; y: number }[]>([]);
  const [mousePreviewPos, setMousePreviewPos] = useState<{ x: number; y: number } | null>(null);
  const [penPoints, setPenPoints] = useState<{ x: number; y: number; pressure?: number }[]>([]);
  const [penDrawingActive, setPenDrawingActive] = useState(false);
  const lastPenPoint = useRef<{ x: number; y: number } | null>(null);
  const [eraserPoints, setEraserPoints] = useState<{ x: number; y: number }[]>([]);
  const [eraserActive, setEraserActive] = useState(false);
  const lastEraserPoint = useRef<{ x: number; y: number } | null>(null);
  const [shapeCursorContainerPos, setShapeCursorContainerPos] = useState<{ x: number; y: number } | null>(null);

  const shapeDragStartRef = useRef<{
    startCanvas: { x: number; y: number };
    startClient: { x: number; y: number };
  } | null>(null);
  const [shapeDragPreview, setShapeDragPreview] = useState<{
    startCanvas: { x: number; y: number };
    currentCanvas: { x: number; y: number };
  } | null>(null);

  const canvasCenter = { x: canvasWidth / 2, y: canvasHeight / 2 };

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!setZoom) return;
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const canvasX = (mouseX - pan.x) / zoom;
    const canvasY = (mouseY - pan.y) / zoom;
    const newZoom = e.deltaY < 0
      ? Math.min(3, zoom + 0.05)
      : Math.max(0.05, zoom - 0.05);
    const newPanX = mouseX - canvasX * newZoom;
    const newPanY = mouseY - canvasY * newZoom;
    setZoom(newZoom);
    setPan({ x: newPanX, y: newPanY });
  }, [zoom, setZoom, pan.x, pan.y, setPan]);

  // Callbacks to track element manipulation state
  const collectBoxChildren = useCallback((boxId: string, positions: Map<string, { x: number; y: number; width: number; height: number }>) => {
    const box = elementsRef.current.find(e => e.id === boxId);
    if (!box || !box.childIds) return;
    box.childIds.forEach(childId => {
      if (positions.has(childId)) return;
      const child = elementsRef.current.find(e => e.id === childId);
      if (child) {
        positions.set(childId, { x: child.x, y: child.y, width: child.width, height: child.height });
        if (child.type === 'hbox' || child.type === 'vbox') {
          collectBoxChildren(childId, positions);
        }
      }
    });
  }, []);

  const handleManipulationStart = useCallback((elementId: string) => {
    setManipulatingElements(prev => new Set(prev).add(elementId));
    manipulatedPropertiesRef.current.set(elementId, new Set());

    const currentSelected = selectedElementsRef.current;
    const currentElements = elementsRef.current;
    const draggedEl = currentElements.find(e => e.id === elementId);
    const isDraggingBox = draggedEl?.type === 'hbox' || draggedEl?.type === 'vbox';

    if (currentSelected.length > 1 && currentSelected.includes(elementId)) {
      multiDragPrimaryId.current = elementId;
      const positions = new Map<string, { x: number; y: number; width: number; height: number }>();
      currentSelected.forEach(selId => {
        const el = currentElements.find(e => e.id === selId);
        if (el) {
          positions.set(selId, { x: el.x, y: el.y, width: el.width, height: el.height });
          if (selId !== elementId) {
            manipulatedPropertiesRef.current.set(selId, new Set());
          }
          if (el.type === 'hbox' || el.type === 'vbox') {
            collectBoxChildren(selId, positions);
          }
        }
      });
      multiDragInitialPositions.current = positions;
    } else if (isDraggingBox && draggedEl?.childIds && draggedEl.childIds.length > 0) {
      multiDragPrimaryId.current = elementId;
      const positions = new Map<string, { x: number; y: number; width: number; height: number }>();
      positions.set(elementId, { x: draggedEl.x, y: draggedEl.y, width: draggedEl.width, height: draggedEl.height });
      collectBoxChildren(elementId, positions);
      multiDragInitialPositions.current = positions;
    } else {
      multiDragPrimaryId.current = null;
      multiDragInitialPositions.current.clear();
    }
  }, [collectBoxChildren]);

  const finalizeKeyframesForElement = useCallback((elId: string, pendingUpdates?: Partial<DesignElement>) => {
    const manipulatedProps = manipulatedPropertiesRef.current.get(elId);
    if (!manipulatedProps || manipulatedProps.size === 0) return;
    const currentTime = usePlaybackStore.getState().currentTime;
    const el = elementsRef.current.find(e => e.id === elId);
    if (!el) return;
    const clipStart = animationState.animations[elId]?.clipStart ?? 0;
    const localTime = globalToLocalTime(currentTime, clipStart);
    manipulatedProps.forEach(propKey => {
      const animProperty = propKey as any;
      if (hasKeyframesForProperty(elId, animProperty)) {
        const track = getTrack(elId, animProperty);
        if (!track) return;
        const existingKeyframe = track.keyframes.find(kf => Math.abs(kf.time - localTime) < 0.01);
        if (!existingKeyframe) {
          let value: any;
          if (animProperty === 'shadowBlur' || animProperty === 'shadowX' || animProperty === 'shadowY') {
            if (el.shadow) {
              if (animProperty === 'shadowBlur') value = el.shadow.blur;
              else if (animProperty === 'shadowX') value = el.shadow.x;
              else if (animProperty === 'shadowY') value = el.shadow.y;
            }
          } else {
            // Prefer pendingUpdates (the final drag position not yet in elementsRef)
            // over the stale elementsRef value so keyframes capture the actual dragged position.
            value = pendingUpdates && animProperty in pendingUpdates
              ? (pendingUpdates as any)[animProperty]
              : (el as any)[animProperty];
          }
          if (value !== undefined) {
            addKeyframe(elId, animProperty, localTime, value);
          }
        }
      }
    });
    manipulatedPropertiesRef.current.delete(elId);
  }, [hasKeyframesForProperty, getTrack, addKeyframe, animationState.animations]);

  const isDescendantOf = useCallback((containerId: string, elementId: string): boolean => {
    const container = elementsRef.current.find(e => e.id === containerId);
    if (!container || !container.childIds) return false;
    for (const childId of container.childIds) {
      if (childId === elementId) return true;
      if (isDescendantOf(childId, elementId)) return true;
    }
    return false;
  }, []);

  const handleManipulationEnd = useCallback((elementId: string, pendingUpdates?: Partial<DesignElement>) => {
    setManipulatingElements(prev => {
      const next = new Set(prev);
      next.delete(elementId);
      return next;
    });

    if (multiDragPrimaryId.current === elementId) {
      const primaryEl = elementsRef.current.find(e => e.id === elementId);
      const isPrimaryBox = primaryEl?.type === 'hbox' || primaryEl?.type === 'vbox';

      const getAllBoxDescendants = (el: typeof primaryEl): Set<string> => {
        const ids = new Set<string>();
        if (!el?.childIds) return ids;
        const recurse = (childIds: string[]) => {
          childIds.forEach(cid => {
            ids.add(cid);
            const child = elementsRef.current.find(e => e.id === cid);
            if (child?.childIds) recurse(child.childIds);
          });
        };
        recurse(el.childIds);
        return ids;
      };

      const boxChildIds = isPrimaryBox ? getAllBoxDescendants(primaryEl) : new Set<string>();

      // Collect all secondary final positions and reset their CSS transforms.
      const positionUpdates: Array<{ id: string; x: number; y: number }> = [];
      secondaryFinalPositionsRef.current.forEach((pos, selId) => {
        canvasEngine.resetTranslate(selId);
        if (boxChildIds.has(selId)) return;
        positionUpdates.push({ id: selId, x: pos.x, y: pos.y });
        if (isEditMode) finalizeKeyframesForElement(selId, { x: pos.x, y: pos.y });
      });
      // Commit all secondary positions atomically — sequential updateElement calls would
      // each start from a stale closure of currentState.elements and overwrite each other.
      if (positionUpdates.length > 0) {
        if (batchUpdateElements) {
          batchUpdateElements(positionUpdates);
        } else {
          positionUpdates.forEach(({ id, x, y }) => updateElement(id, { x, y }));
        }
      }
      secondaryFinalPositionsRef.current.clear();
      multiDragPrimaryId.current = null;
      multiDragInitialPositions.current.clear();
    }

    const dropId = dropTargetBoxIdRef.current;
    if (dropId && dropId !== elementId) {
      const draggedEl = elementsRef.current.find(e => e.id === elementId);
      const container = elementsRef.current.find(e => e.id === dropId);
      if (draggedEl && container && !isDescendantOf(dropId, elementId)) {
        if (onReparentToBox) {
          onReparentToBox(elementId, dropId);
        } else {
          const existingChildIds = container.childIds ?? [];
          if (!existingChildIds.includes(elementId)) {
            updateElement(dropId, { childIds: [...existingChildIds, elementId] });
            updateElement(elementId, { parentId: dropId });
          }
        }
      }
      dropTargetBoxIdRef.current = null;
      setDropTargetBoxId(null);
    } else {
      dropTargetBoxIdRef.current = null;
      setDropTargetBoxId(null);
    }

    if (isEditMode) {
      finalizeKeyframesForElement(elementId, pendingUpdates);
    } else {
      manipulatedPropertiesRef.current.delete(elementId);
    }
  }, [isEditMode, finalizeKeyframesForElement, updateElement, batchUpdateElements, onDeleteElement, onReparentToBox, isDescendantOf]);

  // Track which properties are being manipulated (for auto-keyframe on release)
  const trackManipulatedProperties = useCallback((elementId: string, updates: Partial<DesignElement>) => {
    if (!isEditMode) return;

    const propsSet = manipulatedPropertiesRef.current.get(elementId);
    if (!propsSet) return;

    // Map of DesignElement properties to AnimatableProperty types
    const propertyMap: Record<string, string> = {
      'x': 'x',
      'y': 'y',
      'width': 'width',
      'height': 'height',
      'rotation': 'rotation',
      'opacity': 'opacity',
      'fill': 'fill',
      'stroke': 'stroke',
      'strokeWidth': 'strokeWidth',
      'borderRadius': 'borderRadius',
      'fontSize': 'fontSize',
      'letterSpacing': 'letterSpacing'
    };

    for (const [key, value] of Object.entries(updates)) {
      const animProperty = propertyMap[key];
      if (!animProperty) {
        // Handle shadow properties
        if (key === 'shadow' && typeof value === 'object' && value !== null) {
          const shadow = value as any;
          if (shadow.blur !== undefined) propsSet.add('shadowBlur');
          if (shadow.x !== undefined) propsSet.add('shadowX');
          if (shadow.y !== undefined) propsSet.add('shadowY');
        }
        continue;
      }

      if (value !== undefined) {
        propsSet.add(animProperty);
      }
    }
  }, [isEditMode]);

  const displayElements = useMemo(() => {
    if (!isEditMode) return elements;
    return elements.map((element) => {
      // Skip animated state for elements currently being manipulated
      if (manipulatingElements.has(element.id)) {
        return element;
      }
      const animatedState = getAnimatedElementState(element);
      return { ...element, ...animatedState };
    });
  }, [elements, isEditMode, getAnimatedElementState, manipulatingElements, currentTime]);

  const {
    detectSnaps,
    showGuides,
    hideGuides,
    activeGuides
  } = useSnapping(elements, canvasCenter, zoom, snapEnabled, { width: canvasWidth, height: canvasHeight });

  // Clamp position to canvas boundaries
  const clampToCanvas = useCallback((x: number, y: number, width: number, height: number) => {
    const clampedX = Math.max(0, Math.min(canvasWidth - width, x));
    const clampedY = Math.max(0, Math.min(canvasHeight - height, y));
    return { x: clampedX, y: clampedY };
  }, [canvasWidth, canvasHeight]);

  /**
   * Called each frame by the primary dragged element to keep all other
   * selected elements visually in sync via CSS translate (zero React re-renders).
   * Final positions are committed to React state in handleManipulationEnd.
   */
  const handleDragProgress = useCallback((primaryId: string, dx: number, dy: number, altKey = false) => {
    if (multiDragPrimaryId.current !== primaryId) return;
    multiDragInitialPositions.current.forEach((initial, selId) => {
      if (selId === primaryId) return;
      // Alt+drag bypasses boundary clamping for secondary elements to match primary behavior
      const newX = initial.x + dx;
      const newY = initial.y + dy;
      const clampedX = altKey ? newX : Math.max(0, Math.min(canvasWidth - initial.width, newX));
      const clampedY = altKey ? newY : Math.max(0, Math.min(canvasHeight - initial.height, newY));
      canvasEngine.applyTranslate(selId, clampedX - initial.x, clampedY - initial.y);
      secondaryFinalPositionsRef.current.set(selId, { x: clampedX, y: clampedY });
    });
  }, [canvasWidth, canvasHeight]);

  const handleDragPositionUpdate = useCallback((draggedId: string, x: number, y: number, w: number, h: number) => {
    const boxes = elementsRef.current.filter(
      e => (e.type === 'hbox' || e.type === 'vbox') && e.id !== draggedId && !isDescendantOf(e.id, draggedId)
    );
    let best: DesignElement | null = null;
    let bestArea = Infinity;
    for (const box of boxes) {
      const overlaps = x < box.x + box.width && x + w > box.x && y < box.y + box.height && y + h > box.y;
      if (overlaps) {
        const area = box.width * box.height;
        if (area < bestArea) {
          bestArea = area;
          best = box;
        }
      }
    }
    const newTarget = best ? best.id : null;
    if (newTarget !== dropTargetBoxIdRef.current) {
      dropTargetBoxIdRef.current = newTarget;
      setDropTargetBoxId(newTarget);
    }
  }, [isDescendantOf]);

  const getCanvasCoordinates = useCallback((clientX: number, clientY: number) => {
    const artboard = artboardRef.current;
    if (!artboard) return { x: 0, y: 0 };
    const rect = artboard.getBoundingClientRect();
    const scaleX = rect.width / canvasWidth;
    const scaleY = rect.height / canvasHeight;
    const canvasX = (clientX - rect.left) / scaleX;
    const canvasY = (clientY - rect.top) / scaleY;
    return { x: canvasX, y: canvasY };
  }, [canvasWidth, canvasHeight]);

  const rdpSimplify = useCallback((pts: { x: number; y: number; pressure?: number }[], tolerance: number): { x: number; y: number; pressure?: number }[] => {
    if (pts.length <= 2) return pts;
    let maxDist = 0;
    let maxIdx = 0;
    const first = pts[0];
    const last = pts[pts.length - 1];
    const dx = last.x - first.x;
    const dy = last.y - first.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    for (let i = 1; i < pts.length - 1; i++) {
      let dist: number;
      if (len === 0) {
        dist = Math.sqrt((pts[i].x - first.x) ** 2 + (pts[i].y - first.y) ** 2);
      } else {
        dist = Math.abs(dy * pts[i].x - dx * pts[i].y + last.x * first.y - last.y * first.x) / len;
      }
      if (dist > maxDist) { maxDist = dist; maxIdx = i; }
    }
    if (maxDist > tolerance) {
      const left = rdpSimplify(pts.slice(0, maxIdx + 1), tolerance);
      const right = rdpSimplify(pts.slice(maxIdx), tolerance);
      return [...left.slice(0, -1), ...right];
    }
    return [first, last];
  }, []);

  const finalizeDrawnLine = useCallback((absPoints: { x: number; y: number; pressure?: number }[], toolType: 'line' | 'pen') => {
    if (absPoints.length < 2) return;

    const simplifiedPoints = toolType === 'pen'
      ? rdpSimplify(absPoints, 1.5)
      : absPoints;

    const minX = Math.min(...simplifiedPoints.map(p => p.x));
    const maxX = Math.max(...simplifiedPoints.map(p => p.x));
    const minY = Math.min(...simplifiedPoints.map(p => p.y));
    const maxY = Math.max(...simplifiedPoints.map(p => p.y));

    const width = Math.max(maxX - minX, 1);
    const height = Math.max(maxY - minY, 1);

    const relativePoints = simplifiedPoints.map(p => ({
      x: p.x - minX,
      y: p.y - minY,
      radius: 0,
      ...(p.pressure !== undefined ? { pressure: p.pressure } : {}),
    }));

    const smoothingVal = drawingDefaults?.smoothing ?? (toolType === 'pen' ? 0.5 : 0);

    const element: DesignElement = {
      id: Date.now().toString(),
      type: 'line',
      name: toolType === 'pen' ? 'Pen' : 'Line',
      x: minX,
      y: minY,
      width,
      height,
      rotation: 0,
      opacity: drawingDefaults?.opacity ?? 1,
      locked: false,
      visible: true,
      fill: 'none',
      stroke: drawingDefaults?.stroke ?? '#FFFFFF',
      strokeWidth: drawingDefaults?.strokeWidth ?? 4,
      borderRadius: 0,
      shadow: { blur: 0, color: '#000000', x: 0, y: 0 },
      points: relativePoints,
      lineType: toolType,
      lineCap: drawingDefaults?.lineCap ?? 'round',
      lineJoin: drawingDefaults?.lineJoin ?? 'round',
      dashArray: [],
      trimStart: 0,
      trimEnd: 1,
      closePath: false,
      arrowStart: false,
      arrowEnd: false,
      arrowheadType: 'triangle',
      arrowheadSize: 12,
      smoothing: smoothingVal,
      cornerRadius: 0,
      pointCornerRadii: [],
      autoScaleArrows: false
    };

    onAddElement?.(element);
  }, [onAddElement, drawingDefaults, rdpSimplify]);

  const finalizeEraser = useCallback((eraserPath: { x: number; y: number }[]) => {
    if (eraserPath.length < 2 || !elements) return;
    const eraserRadius = (drawingDefaults?.strokeWidth ?? 20) / 2;
    const toDelete: string[] = [];
    for (const el of elements) {
      if (el.type !== 'line' || !el.points || el.points.length < 2) continue;
      let hit = false;
      outer: for (const ep of eraserPath) {
        for (const sp of el.points) {
          const spAbs = { x: el.x + sp.x, y: el.y + sp.y };
          const d = Math.sqrt((ep.x - spAbs.x) ** 2 + (ep.y - spAbs.y) ** 2);
          if (d <= eraserRadius + (el.strokeWidth ?? 2) / 2) {
            hit = true;
            break outer;
          }
        }
      }
      if (hit) toDelete.push(el.id);
    }
    toDelete.forEach(id => onDeleteElement(id));
  }, [elements, drawingDefaults, onDeleteElement]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && activeTool === 'line' && lineDrawingPoints.length >= 2) {
        finalizeDrawnLine(lineDrawingPoints, 'line');
        setLineDrawingPoints([]);
        setMousePreviewPos(null);
        onSetActiveTool?.('select');
      }
      if (e.key === 'Escape') {
        if (activeTool === 'line') {
          setLineDrawingPoints([]);
          setMousePreviewPos(null);
          onSetActiveTool?.('select');
        }
        if (activeTool === 'pen') {
          setPenPoints([]);
          setPenDrawingActive(false);
          lastPenPoint.current = null;
          onSetActiveTool?.('select');
        }
        if (activeTool === 'eraser') {
          setEraserPoints([]);
          setEraserActive(false);
          lastEraserPoint.current = null;
          onSetActiveTool?.('select');
        }
        if (isShapePlacementTool(activeTool)) {
          setShapeCursorContainerPos(null);
          onSetActiveTool?.('select');
        }
        if (activeTool === 'image-placement') {
          onClearPendingImageElement?.();
          onSetActiveTool?.('select');
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [activeTool, lineDrawingPoints, finalizeDrawnLine, onSetActiveTool, onClearPendingImageElement]);

  useEffect(() => {
    if (activeTool === 'select') {
      setLineDrawingPoints([]);
      setMousePreviewPos(null);
      setPenPoints([]);
      setPenDrawingActive(false);
      lastPenPoint.current = null;
      setEraserPoints([]);
      setEraserActive(false);
      lastEraserPoint.current = null;
      setShapeCursorContainerPos(null);
    }
  }, [activeTool]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Meta') {
        setIsCtrlHeld(true);
      }
      if (e.key === 'Escape') {
        if (activeGroupId) {
          onExitGroup?.();
          setSelectedElements([]);
        } else if (selectionBox) {
          setSelectedElements([]);
          setSelectionBox(null);
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Meta') {
        setIsCtrlHeld(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
    };
  }, [selectionBox, setSelectedElements]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 2) return; // Right click
    if (isShapePlacementTool(activeTool)) return;

    const { x: canvasX, y: canvasY } = getCanvasCoordinates(e.clientX, e.clientY);

    // Check if clicking inside artboard
    if (canvasX < 0 || canvasX > canvasWidth || canvasY < 0 || canvasY > canvasHeight) {
      // Outside artboard - start viewport panning
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      setShouldClearSelection(false);
      return;
    }

    // If inside group mode, clicking outside group exits it
    if (activeGroupId) {
      const activeGroup = elements.find(el => el.id === activeGroupId);
      if (activeGroup) {
        const inGroup =
          canvasX >= activeGroup.x &&
          canvasX <= activeGroup.x + activeGroup.width &&
          canvasY >= activeGroup.y &&
          canvasY <= activeGroup.y + activeGroup.height;
        if (!inGroup) {
          onExitGroup?.();
          setSelectedElements([]);
          return;
        }
      }
    }

    // Check if clicking on an element
    const clickedElement = elements.find(element => {
      return canvasX >= element.x &&
             canvasX <= element.x + element.width &&
             canvasY >= element.y &&
             canvasY <= element.y + element.height;
    });

    if (!clickedElement) {
      // Start selection box or pan
      if (e.ctrlKey || e.metaKey || e.shiftKey) {
        // Start selection box for multi-select
        setSelectionBox({
          startX: canvasX,
          startY: canvasY,
          endX: canvasX,
          endY: canvasY
        });
        setShouldClearSelection(false);
      } else {
        // Prepare for potential pan or clear selection
        setIsDragging(true);
        setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
        // Mark that we might clear selection on mouseup (if no drag occurs)
        setShouldClearSelection(true);
      }
    }
  }, [pan, zoom, elements, getCanvasCoordinates, canvasWidth, canvasHeight]);

  const constrainToCardinal = useCallback((
    from: { x: number; y: number },
    to: { x: number; y: number }
  ): { x: number; y: number } => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
      return { x: to.x, y: from.y };
    }
    return { x: from.x, y: to.y };
  }, []);

  const handleDrawingPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button === 2) return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const { x, y } = getCanvasCoordinates(e.clientX, e.clientY);
    const pressure = (drawingDefaults?.pressureSensitive && e.pressure > 0) ? e.pressure : 0.5;

    if (activeTool === 'line') {
      const ctrlHeld = e.ctrlKey;
      setLineDrawingPoints(prev => {
        const raw = { x, y };
        const point = ctrlHeld && prev.length > 0
          ? constrainToCardinal(prev[prev.length - 1], raw)
          : raw;
        return [...prev, point];
      });
    } else if (activeTool === 'pen') {
      setPenPoints([{ x, y, pressure }]);
      setPenDrawingActive(true);
      lastPenPoint.current = { x, y };
    } else if (activeTool === 'eraser') {
      setEraserPoints([{ x, y }]);
      setEraserActive(true);
      lastEraserPoint.current = { x, y };
    }
  }, [activeTool, getCanvasCoordinates, constrainToCardinal, drawingDefaults]);

  const handleDrawingPointerMove = useCallback((e: React.PointerEvent) => {
    const { x, y } = getCanvasCoordinates(e.clientX, e.clientY);
    const pressure = (drawingDefaults?.pressureSensitive && e.pressure > 0) ? e.pressure : 0.5;

    if (activeTool === 'line') {
      const raw = { x, y };
      const preview = e.ctrlKey && lineDrawingPoints.length > 0
        ? constrainToCardinal(lineDrawingPoints[lineDrawingPoints.length - 1], raw)
        : raw;
      setMousePreviewPos(preview);
    } else if (activeTool === 'pen' && penDrawingActive) {
      const last = lastPenPoint.current;
      if (last) {
        const dist = Math.sqrt((x - last.x) ** 2 + (y - last.y) ** 2);
        if (dist >= 2) {
          setPenPoints(prev => [...prev, { x, y, pressure }]);
          lastPenPoint.current = { x, y };
        }
      }
    } else if (activeTool === 'eraser' && eraserActive) {
      const last = lastEraserPoint.current;
      if (last) {
        const dist = Math.sqrt((x - last.x) ** 2 + (y - last.y) ** 2);
        if (dist >= 4) {
          setEraserPoints(prev => [...prev, { x, y }]);
          lastEraserPoint.current = { x, y };
        }
      }
    }
  }, [activeTool, penDrawingActive, eraserActive, getCanvasCoordinates, lineDrawingPoints, constrainToCardinal, drawingDefaults]);

  const handleDrawingPointerUp = useCallback(() => {
    if (activeTool === 'pen' && penDrawingActive) {
      setPenDrawingActive(false);
      if (penPoints.length >= 2) {
        finalizeDrawnLine(penPoints, 'pen');
      }
      setPenPoints([]);
      lastPenPoint.current = null;
      onSetActiveTool?.('select');
    } else if (activeTool === 'eraser' && eraserActive) {
      setEraserActive(false);
      if (eraserPoints.length >= 1) {
        finalizeEraser(eraserPoints);
      }
      setEraserPoints([]);
      lastEraserPoint.current = null;
    }
  }, [activeTool, penDrawingActive, eraserActive, penPoints, eraserPoints, finalizeDrawnLine, finalizeEraser, onSetActiveTool]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isShapePlacementTool(activeTool)) {
      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        const cssZoom = rect.width / container.offsetWidth;
        setShapeCursorContainerPos({
          x: (e.clientX - rect.left) / cssZoom,
          y: (e.clientY - rect.top) / cssZoom
        });
      }
      return;
    }
    if (selectionBox) {
      const { x: canvasX, y: canvasY } = getCanvasCoordinates(e.clientX, e.clientY);

      setSelectionBox(prev => prev ? {
        ...prev,
        endX: Math.max(0, Math.min(canvasWidth, canvasX)),
        endY: Math.max(0, Math.min(canvasHeight, canvasY))
      } : null);

      const minX = Math.min(selectionBox.startX, canvasX);
      const maxX = Math.max(selectionBox.startX, canvasX);
      const minY = Math.min(selectionBox.startY, canvasY);
      const maxY = Math.max(selectionBox.startY, canvasY);

      const liveSelectedIds = elementsRef.current
        .filter(element => !(
          element.x + element.width < minX ||
          element.x > maxX ||
          element.y + element.height < minY ||
          element.y > maxY
        ))
        .map(el => el.id);

      setSelectedElements(liveSelectedIds);
    } else if (isDragging) {
      // Zoom-adjusted panning
      const newPan = {
        x: (e.clientX - dragStart.x),
        y: (e.clientY - dragStart.y)
      };
      setPan(newPan);
      // If we're actually panning, don't clear selection
      setShouldClearSelection(false);
    }
  }, [isDragging, dragStart, setPan, selectionBox, getCanvasCoordinates, canvasWidth, canvasHeight, setSelectedElements]);

  const handleMouseUp = useCallback(() => {
    if (selectionBox) {
      const minX = Math.min(selectionBox.startX, selectionBox.endX);
      const maxX = Math.max(selectionBox.startX, selectionBox.endX);
      const minY = Math.min(selectionBox.startY, selectionBox.endY);
      const maxY = Math.max(selectionBox.startY, selectionBox.endY);

      const selectedIds = elements.filter(element => !(
        element.x + element.width < minX ||
        element.x > maxX ||
        element.y + element.height < minY ||
        element.y > maxY
      )).map(el => el.id);

      setSelectedElements(selectedIds);
      setSelectionBox(null);
    } else if (shouldClearSelection) {
      setSelectedElements([]);
    }

    setIsDragging(false);
    setShouldClearSelection(false);
  }, [selectionBox, elements, setSelectedElements, shouldClearSelection]);

  const handleContextMenu = useCallback((e: React.MouseEvent, elementId?: string) => {
    e.preventDefault();
    if (elementId) {
      e.stopPropagation();
    }
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      elementId: elementId || null,
      type: elementId ? 'element' : 'canvas'
    });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  useEffect(() => {
    const handleClickOutside = () => {
      closeContextMenu();
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [closeContextMenu]);

  // Grid lines for the artboard
  const renderLegacyGrid = () => {
    if (gridSettings?.enabled) return null; // Don't render legacy grid if advanced grid is enabled
    
    return renderLegacyGridLines();
  };

  const gridSize = 40;
  const renderLegacyGridLines = () => {
    const gridLines = [];

    if (showGrid) {
    // Vertical lines
    for (let x = 0; x <= canvasWidth; x += gridSize) {
      gridLines.push(
        <line
          key={`v-${x}`}
          x1={x}
          y1={0}
          x2={x}
          y2={canvasHeight}
          stroke="rgba(255, 255, 255, 0.1)"
          strokeWidth="1"
        />
      );
    }

    // Horizontal lines
    for (let y = 0; y <= canvasHeight; y += gridSize) {
      gridLines.push(
        <line
          key={`h-${y}`}
          x1={0}
          y1={y}
          x2={canvasWidth}
          y2={y}
          stroke="rgba(255, 255, 255, 0.1)"
          strokeWidth="1"
        />
      );
    }
    }

    return gridLines;
  };

  // Unified element rendering - groups are treated as single interactive units
  const renderElements = (elementList: DesignElement[], parentOffset = { x: 0, y: 0 }, insideGroupId?: string | null) => {
    return elementList.map((element) => {
      const isInsideGroup = !!insideGroupId;
      const parentGroupId = insideGroupId ?? null;
      const parentEl = element.parentId ? elements.find(e => e.id === element.parentId) : null;
      const isBoxChild = parentEl?.type === 'hbox' || parentEl?.type === 'vbox';

      const handleUpdate = (updates: Partial<DesignElement>) => {
        const altDrag = !!(updates as Record<string, unknown>)._altDrag;
        if (altDrag) {
          const { _altDrag: _removed, ...cleanUpdates } = updates as Record<string, unknown>;
          const clean = cleanUpdates as Partial<DesignElement>;
          trackManipulatedProperties(element.id, clean);
          if (parentGroupId) {
            updateElement(parentGroupId, {
              children: updateChildInGroup(
                elements.find(el => el.id === parentGroupId)?.children || [],
                parentGroupId,
                element.id,
                clean
              ).find(el => el.id === parentGroupId)?.children,
            } as Partial<DesignElement>);
          } else {
            updateElement(element.id, clean);
          }
          return;
        }
        if (parentGroupId) {
          trackManipulatedProperties(element.id, updates);
          const parentGroup = elements.find(el => el.id === parentGroupId);
          if (parentGroup && parentGroup.children) {
            const newChildren = parentGroup.children.map(c =>
              c.id === element.id ? { ...c, ...updates } : c
            );
            updateElement(parentGroupId, { children: newChildren });
          }
          return;
        }
        if (updates.x !== undefined || updates.y !== undefined) {
          if (onGridSnap && gridSettings?.snapEnabled) {
            const snapped = onGridSnap(
              updates.x !== undefined ? updates.x : element.x,
              updates.y !== undefined ? updates.y : element.y
            );
            updates = { ...updates, x: snapped.x, y: snapped.y };
          }
          const newX = updates.x !== undefined ? updates.x : element.x;
          const newY = updates.y !== undefined ? updates.y : element.y;
          const clamped = clampToCanvas(newX, newY, element.width, element.height);
          updates = { ...updates, ...clamped };
        }
        trackManipulatedProperties(element.id, updates);
        updateElement(element.id, updates);
      };

      return (
        <EnhancedDesignElementComponent
          key={element.id}
          element={element}
          isSelected={selectedElements.includes(element.id)}
          isHovered={hoveredElement === element.id}
          onSelect={(ctrlKey) => {
            if (ctrlKey) {
              if (selectedElements.includes(element.id)) {
                setSelectedElements(selectedElements.filter(id => id !== element.id));
              } else {
                setSelectedElements([...selectedElements, element.id]);
              }
            } else if (selectedElements.includes(element.id) && selectedElements.length > 1) {
              // Preserve multi-selection when clicking an already-selected element without modifier
            } else {
              setSelectedElements([element.id]);
            }
          }}
          onUpdate={handleUpdate}
          onDragProgress={isInsideGroup || isBoxChild ? undefined : handleDragProgress}
          onContextMenu={(e) => handleContextMenu(e, element.id)}
          onHover={(isHovered) => setHoveredElement(isHovered ? element.id : null)}
          parentOffset={parentOffset}
          allElements={elements}
          zoom={zoom}
          snapEnabled={snapEnabled}
          canvasSize={{ width: canvasWidth, height: canvasHeight }}
          onGridSnap={gridCalculations ? gridCalculations.snapToGrid : onGridSnap}
          onGridSnapSize={gridCalculations ? gridCalculations.snapSizeToGrid : undefined}
          onShowSnapGuides={showGuides}
          onHideSnapGuides={hideGuides}
          disabled={isBoxChild}
          onManipulationStart={handleManipulationStart}
          onManipulationEnd={handleManipulationEnd}
          onDoubleClick={(elementId) => {
            if (element.type === 'group' && !isInsideGroup) {
              onEnterGroup?.(elementId);
              setSelectedElements([]);
            } else {
              onDoubleClickElement?.(elementId);
            }
          }}
          isInsideGroup={isInsideGroup}
          activeGroupId={activeGroupId}
          onEnterGroup={onEnterGroup}
          isDropTarget={dropTargetBoxId === element.id}
          onDragPositionUpdate={isInsideGroup || isBoxChild ? undefined : handleDragPositionUpdate}
        />
      );
    });
  };

  return (
    <div
      ref={containerRef}
      id="canvas-container"
      className="w-full h-full relative overflow-hidden bg-gray-900"
      style={{ cursor: activeTool !== 'select' ? 'crosshair' : (selectionBox || isCtrlHeld) ? 'crosshair' : isDragging ? 'grabbing' : 'grab' }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onContextMenu={(e) => handleContextMenu(e)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        ref={canvasRef}
        className=""
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          transformOrigin: '0 0',
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        }}
      >
        {/* Artboard */}
        <div
          id="canvas-artboard"
          ref={artboardRef}
          className="relative border-2 border-black shadow-2xl flex-shrink-0"
          style={{
            width: canvasWidth,
            height: canvasHeight,
            backgroundColor: !background?.enabled ? '#000000' : undefined,
            ...( background?.enabled ? generateBackgroundStyle(background) : {})
          }}
        >
          {/* Video compositor */}
          <VideoRenderer canvasWidth={canvasWidth} canvasHeight={canvasHeight} />

          {/* Grid */}
          {gridSettings && gridCalculations ? (
            <AdvancedGrid
              gridSettings={gridSettings}
              gridCalculations={gridCalculations}
              canvasSize={{ width: canvasWidth, height: canvasHeight }}
            />
          ) : (
            <svg
              className="absolute inset-0 pointer-events-none"
              width={canvasWidth}
              height={canvasHeight}
            >
              {renderLegacyGrid()}
            </svg>
          )}
          )

          {/* Canvas Center Point */}
          {gridSettings?.showCenterPoint && (
            <div
              className="absolute w-2 h-2 bg-yellow-400 rounded-full transform -translate-x-1/2 -translate-y-1/2 pointer-events-none opacity-50"
              style={{
                left: canvasWidth / 2,
                top: canvasHeight / 2
              }}
            />
          )}

          {/* Elements */}
          {renderElements(displayElements, { x: 0, y: 0 }, null)}


          {/* Inside-group interactive overlay */}
          {activeGroupId && (() => {
            const activeGroup = displayElements.find(el => el.id === activeGroupId);
            if (!activeGroup || activeGroup.type !== 'group' || !activeGroup.children) return null;
            return (
              <>
                {/* Dim overlay for elements outside the group */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    backgroundColor: 'rgba(0,0,0,0.45)',
                    pointerEvents: 'none',
                    zIndex: 50,
                  }}
                />
                {/* Group boundary highlight */}
                <div
                  style={{
                    position: 'absolute',
                    left: activeGroup.x,
                    top: activeGroup.y,
                    width: activeGroup.width,
                    height: activeGroup.height,
                    transform: `rotate(${activeGroup.rotation || 0}deg)`,
                    transformOrigin: 'center center',
                    border: '2px dashed rgba(250,204,21,0.7)',
                    borderRadius: 2,
                    pointerEvents: 'none',
                    zIndex: 51,
                    boxShadow: '0 0 0 2px rgba(250,204,21,0.15)',
                  }}
                />
                {/* Interactive child elements positioned above dim overlay */}
                <div
                  style={{
                    position: 'absolute',
                    left: activeGroup.x,
                    top: activeGroup.y,
                    width: activeGroup.width,
                    height: activeGroup.height,
                    transform: `rotate(${activeGroup.rotation || 0}deg)`,
                    transformOrigin: 'center center',
                    overflow: 'visible',
                    zIndex: 52,
                  }}
                  onMouseDown={(e) => {
                    const { x: canvasX, y: canvasY } = getCanvasCoordinates(e.clientX, e.clientY);
                    const inGroup =
                      canvasX >= activeGroup.x &&
                      canvasX <= activeGroup.x + activeGroup.width &&
                      canvasY >= activeGroup.y &&
                      canvasY <= activeGroup.y + activeGroup.height;
                    if (!inGroup) {
                      onExitGroup?.();
                      setSelectedElements([]);
                    }
                  }}
                >
                  {renderElements(activeGroup.children, { x: activeGroup.x, y: activeGroup.y }, activeGroupId)}
                </div>
                {/* Click outside group to exit */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    zIndex: 49,
                    cursor: 'default',
                  }}
                  onMouseDown={(e) => {
                    const { x: canvasX, y: canvasY } = getCanvasCoordinates(e.clientX, e.clientY);
                    const inGroup =
                      canvasX >= activeGroup.x &&
                      canvasX <= activeGroup.x + activeGroup.width &&
                      canvasY >= activeGroup.y &&
                      canvasY <= activeGroup.y + activeGroup.height;
                    if (!inGroup) {
                      onExitGroup?.();
                      setSelectedElements([]);
                    }
                  }}
                />
                {/* "Inside Group" label */}
                <div
                  style={{
                    position: 'absolute',
                    left: activeGroup.x,
                    top: Math.max(0, activeGroup.y - 28),
                    zIndex: 53,
                    pointerEvents: 'none',
                  }}
                >
                  <div className="px-2 py-0.5 bg-yellow-400/90 text-gray-900 text-xs font-semibold rounded shadow-md whitespace-nowrap">
                    Editing: {activeGroup.name || 'Group'} — Press Esc to exit
                  </div>
                </div>
              </>
            );
          })()}

          {/* Snap Guides */}
          <SnapGuides
            guides={activeGuides}
            canvasSize={{ width: canvasWidth, height: canvasHeight }}
            zoom={1}
            pan={{ x: 0, y: 0 }}
          />

          {/* Selection Box */}
          {selectionBox && (
            <div
              className="absolute border-2 border-yellow-400 bg-yellow-400/10 pointer-events-none"
              style={{
                left: Math.min(selectionBox.startX, selectionBox.endX),
                top: Math.min(selectionBox.startY, selectionBox.endY),
                width: Math.abs(selectionBox.endX - selectionBox.startX),
                height: Math.abs(selectionBox.endY - selectionBox.startY)
              }}
            />
          )}

          {/* Drawing tool overlay — intercepts pointer events when in drawing mode */}
          {(activeTool === 'line' || activeTool === 'pen' || activeTool === 'eraser') && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: canvasWidth,
                height: canvasHeight,
                zIndex: 998,
                cursor: activeTool === 'eraser' ? 'cell' : 'crosshair',
                touchAction: 'none',
              }}
              onPointerDown={handleDrawingPointerDown}
              onPointerMove={handleDrawingPointerMove}
              onPointerUp={handleDrawingPointerUp}
            />
          )}

          {/* Shape placement overlay — click to place, drag to set custom size */}
          {isShapePlacementTool(activeTool) && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: canvasWidth,
                height: canvasHeight,
                zIndex: 998,
                cursor: 'crosshair'
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
                const { x: canvasX, y: canvasY } = getCanvasCoordinates(e.clientX, e.clientY);
                shapeDragStartRef.current = {
                  startCanvas: { x: canvasX, y: canvasY },
                  startClient: { x: e.clientX, y: e.clientY },
                };
                setShapeDragPreview(null);
              }}
              onMouseMove={(e) => {
                const container = containerRef.current;
                if (container) {
                  const rect = container.getBoundingClientRect();
                  const cssZoom = rect.width / container.offsetWidth;
                  setShapeCursorContainerPos({
                    x: (e.clientX - rect.left) / cssZoom,
                    y: (e.clientY - rect.top) / cssZoom
                  });
                }
                const dragStart = shapeDragStartRef.current;
                if (!dragStart) return;
                const dx = e.clientX - dragStart.startClient.x;
                const dy = e.clientY - dragStart.startClient.y;
                if (Math.sqrt(dx * dx + dy * dy) > 5) {
                  const { x: canvasX, y: canvasY } = getCanvasCoordinates(e.clientX, e.clientY);
                  setShapeDragPreview({
                    startCanvas: dragStart.startCanvas,
                    currentCanvas: { x: canvasX, y: canvasY },
                  });
                }
              }}
              onMouseUp={(e) => {
                e.stopPropagation();
                const dragStart = shapeDragStartRef.current;
                shapeDragStartRef.current = null;
                setShapeDragPreview(null);
                setShapeCursorContainerPos(null);

                if (!dragStart) return;
                const { x: canvasX, y: canvasY } = getCanvasCoordinates(e.clientX, e.clientY);
                const dragW = Math.abs(canvasX - dragStart.startCanvas.x);
                const dragH = Math.abs(canvasY - dragStart.startCanvas.y);
                const dx = e.clientX - dragStart.startClient.x;
                const dy = e.clientY - dragStart.startClient.y;
                const wasDrag = Math.sqrt(dx * dx + dy * dy) > 5 && dragW > 10 && dragH > 10;

                const canvasSizeArg = { width: canvasWidth, height: canvasHeight };
                if (activeTool === 'adjustment-layer') {
                  const element = createShapeAtPosition(activeTool as DesignElement['type'], 0, 0, undefined, canvasSizeArg);
                  onAddElement?.(element);
                } else if (wasDrag) {
                  const x = Math.min(dragStart.startCanvas.x, canvasX);
                  const y = Math.min(dragStart.startCanvas.y, canvasY);
                  const base = createShapeAtPosition(activeTool as DesignElement['type'], x + dragW / 2, y + dragH / 2);
                  const element = { ...base, x, y, width: dragW, height: dragH };
                  onAddElement?.(element);
                } else {
                  const element = createShapeAtPosition(activeTool as DesignElement['type'], dragStart.startCanvas.x, dragStart.startCanvas.y);
                  onAddElement?.(element);
                }
                onSetActiveTool?.('select');
              }}
              onMouseLeave={() => {
                setShapeCursorContainerPos(null);
                if (!shapeDragPreview) {
                  shapeDragStartRef.current = null;
                }
              }}
            />
          )}

          {/* Image placement overlay — click once to place at that position */}
          {activeTool === 'image-placement' && pendingImageElement && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: canvasWidth,
                height: canvasHeight,
                zIndex: 998,
                cursor: 'crosshair'
              }}
              onClick={(e) => {
                e.stopPropagation();
                const { x: canvasX, y: canvasY } = getCanvasCoordinates(e.clientX, e.clientY);
                const placedElement: DesignElement = {
                  ...pendingImageElement,
                  id: `${Date.now()}`,
                  x: canvasX - pendingImageElement.width / 2,
                  y: canvasY - pendingImageElement.height / 2,
                };
                onAddElement?.(placedElement);
                onClearPendingImageElement?.();
                onSetActiveTool?.('select');
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                onClearPendingImageElement?.();
                onSetActiveTool?.('select');
              }}
            />
          )}

          {/* Video placement overlay — click once to place at that position */}
          {activeTool === 'video-placement' && pendingVideoAsset && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: canvasWidth,
                height: canvasHeight,
                zIndex: 998,
                cursor: 'crosshair'
              }}
              onClick={(e) => {
                e.stopPropagation();
                const { x: canvasX, y: canvasY } = getCanvasCoordinates(e.clientX, e.clientY);
                onPlaceVideoAsset?.(pendingVideoAsset, canvasX, canvasY);
                onClearPendingVideoAsset?.();
                onSetActiveTool?.('select');
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                onClearPendingVideoAsset?.();
                onSetActiveTool?.('select');
              }}
            />
          )}

          {/* Drag-to-create shape preview */}
          {isShapePlacementTool(activeTool) && activeTool !== 'adjustment-layer' && shapeDragPreview && (() => {
            const { startCanvas, currentCanvas } = shapeDragPreview;
            const x = Math.min(startCanvas.x, currentCanvas.x);
            const y = Math.min(startCanvas.y, currentCanvas.y);
            const w = Math.abs(currentCanvas.x - startCanvas.x);
            const h = Math.abs(currentCanvas.y - startCanvas.y);
            const sw = Math.max(1, 2 / zoom);
            const fs = Math.max(10, 13 / zoom);
            const da = `${8 / zoom},${4 / zoom}`;
            return (
              <svg
                style={{ position: 'absolute', top: 0, left: 0, width: canvasWidth, height: canvasHeight, pointerEvents: 'none', overflow: 'visible', zIndex: 999 }}
              >
                {activeTool === 'circle' ? (
                  <ellipse
                    cx={x + w / 2}
                    cy={y + h / 2}
                    rx={w / 2}
                    ry={h / 2}
                    fill="rgba(59,130,246,0.08)"
                    stroke="#3B82F6"
                    strokeWidth={sw}
                    strokeDasharray={da}
                  />
                ) : (
                  <rect
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    fill="rgba(59,130,246,0.08)"
                    stroke="#3B82F6"
                    strokeWidth={sw}
                    strokeDasharray={da}
                  />
                )}
                <rect
                  x={x + w / 2 - (fs * 3.2)}
                  y={y - fs * 1.8}
                  width={fs * 6.4}
                  height={fs * 1.4}
                  rx={fs * 0.25}
                  fill="rgba(15,23,42,0.75)"
                />
                <text
                  x={x + w / 2}
                  y={y - fs * 0.7}
                  fill="#93C5FD"
                  fontSize={fs}
                  fontFamily="Inter, sans-serif"
                  textAnchor="middle"
                  style={{ userSelect: 'none' }}
                >
                  {Math.round(w)} × {Math.round(h)}
                </text>
                <circle cx={x} cy={y} r={sw * 2} fill="#3B82F6" />
                <circle cx={x + w} cy={y} r={sw * 2} fill="#3B82F6" />
                <circle cx={x} cy={y + h} r={sw * 2} fill="#3B82F6" />
                <circle cx={x + w} cy={y + h} r={sw * 2} fill="#3B82F6" />
              </svg>
            );
          })()}

          {/* Line drawing preview */}
          {activeTool === 'line' && lineDrawingPoints.length > 0 && (
            <svg
              style={{ position: 'absolute', top: 0, left: 0, width: canvasWidth, height: canvasHeight, pointerEvents: 'none', overflow: 'visible', zIndex: 999 }}
            >
              {lineDrawingPoints.slice(0, -1).map((p, i) => (
                <line key={i} x1={p.x} y1={p.y} x2={lineDrawingPoints[i + 1].x} y2={lineDrawingPoints[i + 1].y} stroke="#FFD700" strokeWidth={3} strokeDasharray="8,4" />
              ))}
              {mousePreviewPos && (
                <line x1={lineDrawingPoints[lineDrawingPoints.length - 1].x} y1={lineDrawingPoints[lineDrawingPoints.length - 1].y} x2={mousePreviewPos.x} y2={mousePreviewPos.y} stroke="rgba(255,215,0,0.45)" strokeWidth={2} strokeDasharray="8,4" />
              )}
              {lineDrawingPoints.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={6} fill="#FFD700" stroke="#FFA500" strokeWidth={2} />
              ))}
              {lineDrawingPoints.length >= 2 && mousePreviewPos && (
                <text x={mousePreviewPos.x + 14} y={mousePreviewPos.y - 10} fill="#FFD700" fontSize={14} fontFamily="Inter, sans-serif" style={{ userSelect: 'none' }}>
                  Press Enter to finish · ESC to cancel
                </text>
              )}
            </svg>
          )}

          {/* Pen drawing preview */}
          {activeTool === 'pen' && penPoints.length > 1 && (
            <svg
              style={{ position: 'absolute', top: 0, left: 0, width: canvasWidth, height: canvasHeight, pointerEvents: 'none', overflow: 'visible', zIndex: 999 }}
            >
              <polyline
                points={penPoints.map(p => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke={drawingDefaults?.stroke ?? '#FFD700'}
                strokeWidth={drawingDefaults?.strokeWidth ?? 3}
                strokeLinecap={drawingDefaults?.lineCap ?? 'round'}
                strokeLinejoin={drawingDefaults?.lineJoin ?? 'round'}
                opacity={drawingDefaults?.opacity ?? 1}
              />
            </svg>
          )}

          {/* Eraser preview */}
          {activeTool === 'eraser' && eraserActive && eraserPoints.length > 0 && (
            <svg
              style={{ position: 'absolute', top: 0, left: 0, width: canvasWidth, height: canvasHeight, pointerEvents: 'none', overflow: 'visible', zIndex: 999 }}
            >
              <polyline
                points={eraserPoints.map(p => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke="rgba(255,255,255,0.6)"
                strokeWidth={drawingDefaults?.strokeWidth ?? 20}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="4,4"
              />
            </svg>
          )}
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && contextMenu.type === 'element' && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          elementId={contextMenu.elementId}
          onClose={closeContextMenu}
          onDuplicate={onDuplicateElement}
          onDelete={onDeleteElement}
          onMoveUp={onMoveElementUp}
          onMoveDown={onMoveElementDown}
          onBringToFront={onBringElementToFront}
          onSendToBack={onSendElementToBack}
        />
      )}

      {/* Canvas Context Menu */}
      {contextMenu && contextMenu.type === 'canvas' && onCreateShape && (
        <CanvasContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={closeContextMenu}
          onCreateShape={onCreateShape}
          onLoadPreset={onLoadPreset || (() => {})}
          onPaste={onPasteElements || (() => {})}
          onZoomIn={() => setZoom && setZoom(Math.min(3, zoom + 0.05))}
          onZoomOut={() => setZoom && setZoom(Math.max(0.25, zoom - 0.05))}
          onFitToScreen={onFitToScreen || (() => {})}
          onResetZoom={onResetZoom || (() => {})}
          onToggleGrid={() => setShowGrid && setShowGrid()}
          onToggleSnap={() => setSnapEnabled && setSnapEnabled()}
          onSelectAll={() => setSelectedElements(elements.map(el => el.id))}
          onDeselectAll={() => setSelectedElements([])}
          onSelectByType={(type) => {
            const filtered = elements.filter(el => {
              if (type === 'shape') return ['rectangle', 'circle', 'button', 'chat-bubble', 'chat-frame'].includes(el.type);
              if (type === 'text') return el.type === 'text';
              if (type === 'image') return el.type === 'image';
              return false;
            });
            setSelectedElements(filtered.map(el => el.id));
          }}
          onLockCanvas={() => {}}
          onClearCanvas={onClearCanvas || (() => {})}
          onResetTransform={onResetTransform || (() => {})}
          onViewCanvas={onViewCanvas || (() => {})}
          gridEnabled={gridSettings?.enabled ?? showGrid}
          snapEnabled={gridSettings?.snapEnabled ?? snapEnabled}
          hasClipboard={hasClipboard}
          presets={presets}
        />
      )}

      {/* Zoom and position indicator */}
      <div className="absolute bottom-4 right-4 flex items-center gap-3 px-3 py-1.5 bg-gray-800/80 backdrop-blur-sm rounded-lg border border-gray-700/50">
        <span className="text-xs text-gray-400 font-mono">
          <span className="text-gray-500 mr-1">X</span>
          <span className="text-gray-200">{Math.round(pan.x)}</span>
          <span className="text-gray-500 mx-1.5">Y</span>
          <span className="text-gray-200">{Math.round(pan.y)}</span>
          <span className="text-gray-500 ml-1 text-[10px]">px</span>
        </span>
        <div className="w-px h-3 bg-gray-600" />
        <span className="text-sm text-gray-300 font-mono">{Math.round(zoom * 100)}%</span>
      </div>

      {/* Shape placement cursor label */}
      {isShapePlacementTool(activeTool) && shapeCursorContainerPos && (
        <div
          className="absolute pointer-events-none"
          style={{
            left: shapeCursorContainerPos.x + 14,
            top: shapeCursorContainerPos.y - 32,
            zIndex: 10000
          }}
        >
          <div className="px-2 py-1 bg-gray-800/90 backdrop-blur-sm rounded border border-gray-600/50 text-xs text-gray-200 font-medium whitespace-nowrap shadow-lg">
            {SHAPE_TOOL_LABELS[activeTool as ShapePlacementTool]}
          </div>
        </div>
      )}
    </div>
  );
};

export default Canvas;