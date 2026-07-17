import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { DesignElement } from '../../types/design';
import { useSnapping, SnapGuide } from '../../hooks/useSnapping';
import EnhancedLineComponent from './EnhancedLineComponent';
import ImageWithFilters from '../image/ImageWithFilters';
import { materialStyleGenerator } from '../../services/MaterialStyleGenerator';
import { useAnimation } from '../../animation-engine';
import { generateShapeMaterialStyle } from '../../types/material';
import { generatePatternSvgUrl, generatePatternDataUri } from '../layout/ShapePatternFillPanel';
import { generateClipMaskStyle } from '../../utils/clipMaskUtils';
import GroupChildRenderer from './GroupChildRenderer';
import {
  buildTextSegments,
  computeTextAnimatorContributions,
  identityContribution,
  TextSegmentContribution,
} from '../../utils/textSplitUtils';
import { canvasEngine } from '../../engine/CanvasEngine';

function _segTransform(c: TextSegmentContribution): string | undefined {
  const p: string[] = [];
  if (c.translateX !== 0 || c.translateY !== 0) p.push(`translate(${c.translateX}px,${c.translateY}px)`);
  if (c.scaleX !== 1 || c.scaleY !== 1) p.push(`scale(${c.scaleX},${c.scaleY})`);
  if (c.rotation !== 0) p.push(`rotate(${c.rotation}deg)`);
  if (c.skewX !== 0 || c.skewY !== 0) p.push(`skew(${c.skewX}deg,${c.skewY}deg)`);
  return p.length > 0 ? p.join(' ') : undefined;
}

function _segClip(c: TextSegmentContribution): string | undefined {
  if (c.maskWidth >= 1 && c.maskHeight >= 1) return undefined;
  const top = c.maskHeight < 1 ? `${(1 - c.maskHeight) * 100}%` : '0%';
  const right = c.maskWidth < 1 ? `${(1 - c.maskWidth) * 100}%` : '0%';
  return `inset(${top} ${right} 0% 0%)`;
}

interface EnhancedDesignElementComponentProps {
  element: DesignElement;
  isSelected: boolean;
  isHovered: boolean;
  onSelect: (ctrlKey: boolean) => void;
  onUpdate: (updates: Partial<DesignElement>) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onHover: (isHovered: boolean) => void;
  parentOffset?: { x: number; y: number };
  allElements?: DesignElement[];
  zoom?: number;
  snapEnabled?: boolean;
  canvasSize?: { width: number; height: number };
  onGridSnap?: (x: number, y: number) => { x: number; y: number };
  onGridSnapSize?: (width: number, height: number) => { width: number; height: number };
  onShowSnapGuides?: (guides: SnapGuide[]) => void;
  onHideSnapGuides?: () => void;
  disabled?: boolean;
  onManipulationStart?: (elementId: string) => void;
  onManipulationEnd?: (elementId: string, pendingUpdates?: Partial<DesignElement>) => void;
  onDoubleClick?: (elementId: string) => void;
  /** Called each frame during drag with the element id and canvas-space delta */
  onDragProgress?: (id: string, dx: number, dy: number, altKey: boolean) => void;
  /** Called each frame during drag with the current canvas bounding box of this element */
  onDragPositionUpdate?: (id: string, x: number, y: number, width: number, height: number) => void;
  /** Whether this element is being rendered inside a group editing context */
  isInsideGroup?: boolean;
  /** The currently active group being edited (for determining if this group is active) */
  activeGroupId?: string | null;
  /** Callback to enter a group for editing */
  onEnterGroup?: (groupId: string) => void;
  /** True when this element is the active drop target for a layout container drag-over */
  isDropTarget?: boolean;
}

interface ResizeHandle {
  position: 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';
  cursor: string;
  x: number;
  y: number;
}

const EnhancedDesignElementComponent: React.FC<EnhancedDesignElementComponentProps> = ({
  element,
  isSelected,
  isHovered,
  onSelect,
  onUpdate,
  onContextMenu,
  onHover,
  parentOffset = { x: 0, y: 0 },
  allElements = [],
  zoom = 1,
  snapEnabled = true,
  canvasSize = { width: 3840, height: 2160 },
  onGridSnap,
  onGridSnapSize,
  onShowSnapGuides,
  onHideSnapGuides,
  disabled = false,
  onManipulationStart,
  onManipulationEnd,
  onDoubleClick: onDoubleClickProp,
  onDragProgress,
  onDragPositionUpdate,
  isInsideGroup = false,
  activeGroupId = null,
  onEnterGroup,
  isDropTarget = false,
}) => {
  if (!element.visible) return null;

  // -------------------------------------------------------------------------
  // Drag / resize / rotate state — ALL stored as refs to avoid React re-renders
  // during interaction. None of these values need to drive JSX rendering.
  // -------------------------------------------------------------------------
  const isDraggingRef = useRef(false);
  const isResizingRef = useRef<string | null>(null);
  const isRotatingRef = useRef(false);
  const isDuplicatingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, elementX: 0, elementY: 0 });
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0, elementX: 0, elementY: 0 });
  const rotateStartRef = useRef({ angle: 0, rotation: 0 });

  /** Tracks the last computed final position during drag — committed to React on mouseup */
  const finalDragPositionRef = useRef<{ x: number; y: number; altKey: boolean } | null>(null);

  /** Mask editing state still needs to be useState since it drives UI rendering */
  const [maskDragState, setMaskDragState] = useState<{
    maskId: string;
    type: 'move' | 'resize';
    handle?: string;
    startMouseX: number;
    startMouseY: number;
    startMaskX: number;
    startMaskY: number;
    startMaskW: number;
    startMaskH: number;
  } | null>(null);

  const [shadowMaskDragState, setShadowMaskDragState] = useState<{
    maskId: string;
    type: 'move' | 'resize';
    handle?: string;
    startMouseX: number;
    startMouseY: number;
    startMaskX: number;
    startMaskY: number;
    startMaskW: number;
    startMaskH: number;
  } | null>(null);

  /** The outer wrapper receives CSS translate during drag — zero React re-renders */
  const outerWrapperRef = useRef<HTMLDivElement>(null);
  const elementRef = useRef<HTMLDivElement>(null);

  // -------------------------------------------------------------------------
  // Prop refs — always current, used inside the persistent event handler
  // These assignments happen synchronously during render, before effects run.
  // -------------------------------------------------------------------------
  const elementDataRef = useRef(element);
  const zoomRef = useRef(zoom);
  const canvasSizeRef = useRef(canvasSize);
  const onUpdateRef = useRef(onUpdate);
  const onManipulationEndRef = useRef(onManipulationEnd);
  const onShowSnapGuidesRef = useRef(onShowSnapGuides);
  const onHideSnapGuidesRef = useRef(onHideSnapGuides);
  const snapEnabledRef = useRef(snapEnabled);
  const onGridSnapRef = useRef(onGridSnap);
  const onGridSnapSizeRef = useRef(onGridSnapSize);
  const onDragProgressRef = useRef(onDragProgress);
  const onDragPositionUpdateRef = useRef(onDragPositionUpdate);

  elementDataRef.current = element;
  zoomRef.current = zoom;
  canvasSizeRef.current = canvasSize;
  onUpdateRef.current = onUpdate;
  onManipulationEndRef.current = onManipulationEnd;
  onShowSnapGuidesRef.current = onShowSnapGuides;
  onHideSnapGuidesRef.current = onHideSnapGuides;
  snapEnabledRef.current = snapEnabled;
  onGridSnapRef.current = onGridSnap;
  onGridSnapSizeRef.current = onGridSnapSize;
  onDragProgressRef.current = onDragProgress;
  onDragPositionUpdateRef.current = onDragPositionUpdate;

  const canvasCenter = { x: canvasSize.width / 2, y: canvasSize.height / 2 };
  const { detectSnaps, detectResizeSnaps } = useSnapping(allElements, canvasCenter, zoom, snapEnabled, canvasSize);
  const detectSnapsRef = useRef(detectSnaps);
  detectSnapsRef.current = detectSnaps;
  const detectResizeSnapsRef = useRef(detectResizeSnaps);
  detectResizeSnapsRef.current = detectResizeSnaps;

  const absoluteX = parentOffset.x + element.x;
  const absoluteY = parentOffset.y + element.y;

  // -------------------------------------------------------------------------
  // Register this element's wrapper node with the CanvasEngine on mount
  // -------------------------------------------------------------------------
  useEffect(() => {
    const node = outerWrapperRef.current;
    if (!node) return;
    canvasEngine.registerWrapper(element.id, node);
    return () => canvasEngine.unregisterWrapper(element.id);
  }, [element.id]);

  const clampToCanvas = useCallback((x: number, y: number, width: number, height: number) => {
    const cs = canvasSizeRef.current;
    const clampedX = Math.max(0, Math.min(cs.width - width, x));
    const clampedY = Math.max(0, Math.min(cs.height - height, y));
    return { x: clampedX, y: clampedY };
  }, []);

  const getResizeHandles = useCallback((): ResizeHandle[] => {
    // Base handle size at 100% zoom — divide by zoom so handles stay the same
    // apparent screen size at any zoom level. Clamped between 4px and 16px screen pixels.
    const baseHandleSize = 10;
    const handleSize = Math.max(4, Math.min(16, baseHandleSize / zoom));
    const halfHandle = handleSize / 2;

    return [
      { position: 'nw', cursor: 'nw-resize', x: -halfHandle, y: -halfHandle },
      { position: 'ne', cursor: 'ne-resize', x: element.width - halfHandle, y: -halfHandle },
      { position: 'sw', cursor: 'sw-resize', x: -halfHandle, y: element.height - halfHandle },
      { position: 'se', cursor: 'se-resize', x: element.width - halfHandle, y: element.height - halfHandle },
      { position: 'n', cursor: 'n-resize', x: element.width / 2 - halfHandle, y: -halfHandle },
      { position: 's', cursor: 's-resize', x: element.width / 2 - halfHandle, y: element.height - halfHandle },
      { position: 'e', cursor: 'e-resize', x: element.width - halfHandle, y: element.height / 2 - halfHandle },
      { position: 'w', cursor: 'w-resize', x: -halfHandle, y: element.height / 2 - halfHandle }
    ];
  }, [element.width, element.height, zoom]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (element.locked || disabled) return;

    e.stopPropagation();
    onSelect(e.ctrlKey || e.metaKey || e.shiftKey);

    isDuplicatingRef.current = !!e.altKey;
    isDraggingRef.current = true;
    finalDragPositionRef.current = null;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      elementX: element.x,
      elementY: element.y,
    };

    if (onManipulationStart) {
      onManipulationStart(element.id);
    }
  }, [element.locked, element.x, element.y, element.id, onSelect, onManipulationStart, disabled]);

  const handleResizeStart = useCallback((e: React.MouseEvent, handle: ResizeHandle) => {
    if (element.locked || disabled) return;

    e.stopPropagation();
    isResizingRef.current = handle.position;
    resizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      width: element.width,
      height: element.height,
      elementX: element.x,
      elementY: element.y,
    };

    if (onManipulationStart) {
      onManipulationStart(element.id);
    }
  }, [element.locked, element.width, element.height, element.x, element.y, element.id, onManipulationStart, disabled]);

  const handleRotateStart = useCallback((e: React.MouseEvent) => {
    if (element.locked || disabled) return;

    e.stopPropagation();
    isRotatingRef.current = true;
    rotateStartRef.current = {
      angle: e.clientY,
      rotation: element.rotation,
    };

    if (onManipulationStart) {
      onManipulationStart(element.id);
    }
  }, [element.locked, element.rotation, element.id, onManipulationStart, disabled]);

  const handleTouchStartForDrag = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1 || element.locked || disabled) return;
    e.stopPropagation();
    onSelect(false);
    const touch = e.touches[0];
    isDraggingRef.current = true;
    finalDragPositionRef.current = null;
    dragStartRef.current = { x: touch.clientX, y: touch.clientY, elementX: element.x, elementY: element.y };
    if (onManipulationStart) onManipulationStart(element.id);
  }, [element.locked, element.x, element.y, element.id, onSelect, onManipulationStart, disabled]);

  // -------------------------------------------------------------------------
  // Persistent interaction event handlers — registered ONCE on mount.
  // All values are read from refs so this effect never needs to re-run.
  // This eliminates the repeated addEventListener/removeEventListener cycle
  // that previously happened on every state change during interaction.
  // -------------------------------------------------------------------------
  useEffect(() => {
    const processMove = (clientX: number, clientY: number, shiftKey: boolean, altKey = false) => {
      const el = elementDataRef.current;
      const z = zoomRef.current;
      const onUpdate = onUpdateRef.current;
      const onShowGuides = onShowSnapGuidesRef.current;
      const snapEn = snapEnabledRef.current;
      const gridSnap = onGridSnapRef.current;
      const gridSnapSize = onGridSnapSizeRef.current;

      if (isDraggingRef.current) {
        const ds = dragStartRef.current;
        const deltaX = (clientX - ds.x) / z;
        const deltaY = (clientY - ds.y) / z;
        const rawX = ds.elementX + deltaX;
        const rawY = ds.elementY + deltaY;

        const cs = canvasSizeRef.current;
        // Alt+drag bypasses boundary clamping, allowing out-of-bounds placement
        // while preserving canvas-relative coordinates (negative X/Y or > canvas size).
        const clampedX = altKey ? rawX : Math.max(0, Math.min(cs.width - el.width, rawX));
        const clampedY = altKey ? rawY : Math.max(0, Math.min(cs.height - el.height, rawY));

        let finalX = clampedX;
        let finalY = clampedY;

        if (gridSnap) {
          const gridSnapped = gridSnap(clampedX, clampedY);
          finalX = gridSnapped.x;
          finalY = gridSnapped.y;
        }

        const snapResult = detectSnapsRef.current(el, finalX, finalY, snapEn);
        if (snapResult.x !== undefined) finalX = snapResult.x;
        if (snapResult.y !== undefined) finalY = snapResult.y;
        if (onShowGuides) onShowGuides(snapResult.guides);

        const dx = finalX - ds.elementX;
        const dy = finalY - ds.elementY;

        // Apply CSS translate directly to the DOM node — zero React involvement
        canvasEngine.applyTranslate(el.id, dx, dy);

        // Notify Canvas.tsx for multi-drag secondary element visual updates
        if (onDragProgressRef.current) {
          onDragProgressRef.current(el.id, dx, dy, altKey);
        }

        // Notify Canvas.tsx for drop-target hit testing (layout containers)
        if (onDragPositionUpdateRef.current) {
          onDragPositionUpdateRef.current(el.id, finalX, finalY, el.width, el.height);
        }

        // Queue throttled property update for the properties panel
        canvasEngine.queueElementUpdate({ id: el.id, x: finalX, y: finalY });

        // Store the final position to commit to React state on mouseup
        finalDragPositionRef.current = { x: finalX, y: finalY, altKey };
        return;
      }

      if (isResizingRef.current) {
        const rs = resizeStartRef.current;
        const deltaX = (clientX - rs.x) / z;
        const deltaY = (clientY - rs.y) / z;

        let newWidth = rs.width;
        let newHeight = rs.height;
        let newX = rs.elementX;
        let newY = rs.elementY;

        const lockedRatio = rs.width / rs.height;
        const maintainRatio = shiftKey || (el.aspectRatioLocked === true);
        const handle = isResizingRef.current;

        switch (handle) {
          case 'se':
            newWidth = Math.max(10, rs.width + deltaX);
            newHeight = Math.max(10, rs.height + deltaY);
            if (maintainRatio) {
              const r = Math.max(newWidth / rs.width, newHeight / rs.height);
              newWidth = rs.width * r; newHeight = rs.height * r;
            }
            break;
          case 'sw':
            newWidth = Math.max(10, rs.width - deltaX);
            newHeight = Math.max(10, rs.height + deltaY);
            newX = rs.elementX + (rs.width - newWidth);
            if (maintainRatio) {
              const r = Math.max(newWidth / rs.width, newHeight / rs.height);
              newWidth = rs.width * r; newHeight = rs.height * r;
              newX = rs.elementX + (rs.width - newWidth);
            }
            break;
          case 'ne':
            newWidth = Math.max(10, rs.width + deltaX);
            newHeight = Math.max(10, rs.height - deltaY);
            newY = rs.elementY + (rs.height - newHeight);
            if (maintainRatio) {
              const r = Math.max(newWidth / rs.width, newHeight / rs.height);
              newWidth = rs.width * r; newHeight = rs.height * r;
              newY = rs.elementY + (rs.height - newHeight);
            }
            break;
          case 'nw':
            newWidth = Math.max(10, rs.width - deltaX);
            newHeight = Math.max(10, rs.height - deltaY);
            newX = rs.elementX + (rs.width - newWidth);
            newY = rs.elementY + (rs.height - newHeight);
            if (maintainRatio) {
              const r = Math.max(newWidth / rs.width, newHeight / rs.height);
              newWidth = rs.width * r; newHeight = rs.height * r;
              newX = rs.elementX + (rs.width - newWidth);
              newY = rs.elementY + (rs.height - newHeight);
            }
            break;
          case 'n':
            newHeight = Math.max(10, rs.height - deltaY);
            newY = rs.elementY + (rs.height - newHeight);
            if (maintainRatio) { newWidth = newHeight * lockedRatio; newX = rs.elementX + (rs.width - newWidth) / 2; }
            break;
          case 's':
            newHeight = Math.max(10, rs.height + deltaY);
            if (maintainRatio) { newWidth = newHeight * lockedRatio; newX = rs.elementX + (rs.width - newWidth) / 2; }
            break;
          case 'e':
            newWidth = Math.max(10, rs.width + deltaX);
            if (maintainRatio) { newHeight = newWidth / lockedRatio; newY = rs.elementY + (rs.height - newHeight) / 2; }
            break;
          case 'w':
            newWidth = Math.max(10, rs.width - deltaX);
            newX = rs.elementX + (rs.width - newWidth);
            if (maintainRatio) { newHeight = newWidth / lockedRatio; newY = rs.elementY + (rs.height - newHeight) / 2; }
            break;
        }

        let finalWidth = newWidth;
        let finalHeight = newHeight;
        if (gridSnapSize) {
          const sizeSnapped = gridSnapSize(newWidth, newHeight);
          finalWidth = sizeSnapped.width;
          finalHeight = sizeSnapped.height;
        }

        if (!altKey && snapEn) {
          const resizeSnap = detectResizeSnapsRef.current(el, handle, newX, newY, finalWidth, finalHeight, true);
          if (resizeSnap.x !== undefined) {
            newX = resizeSnap.x;
            finalWidth = resizeSnap.width ?? finalWidth;
          }
          if (resizeSnap.y !== undefined) {
            newY = resizeSnap.y;
            finalHeight = resizeSnap.height ?? finalHeight;
          }
          if (resizeSnap.width !== undefined && resizeSnap.x === undefined) {
            finalWidth = resizeSnap.width;
          }
          if (resizeSnap.height !== undefined && resizeSnap.y === undefined) {
            finalHeight = resizeSnap.height;
          }
          if (onShowGuides && resizeSnap.guides.length > 0) {
            onShowGuides(resizeSnap.guides);
          } else if (onShowGuides && resizeSnap.guides.length === 0) {
            onHideSnapGuidesRef.current?.();
          }
        }

        finalWidth = Math.max(10, finalWidth);
        finalHeight = Math.max(10, finalHeight);

        const cs = canvasSizeRef.current;
        const maxWidth = cs.width - newX;
        const maxHeight = cs.height - newY;
        onUpdate?.({ width: Math.min(finalWidth, maxWidth), height: Math.min(finalHeight, maxHeight), x: newX, y: newY });
        return;
      }

      if (isRotatingRef.current) {
        const rs = rotateStartRef.current;
        const deltaY = (clientY - rs.angle) / z;
        let newRotation = rs.rotation + deltaY;
        if (shiftKey) newRotation = Math.round(newRotation / 15) * 15;
        newRotation = ((newRotation % 360) + 360) % 360;
        onUpdate?.({ rotation: newRotation });
      }
    };

    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current && !isResizingRef.current && !isRotatingRef.current) return;
      processMove(e.clientX, e.clientY, e.shiftKey, e.altKey);
    };

    const handleGlobalTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      if (!isDraggingRef.current && !isResizingRef.current && !isRotatingRef.current) return;
      e.preventDefault();
      processMove(e.touches[0].clientX, e.touches[0].clientY, false);
    };

    const handleEnd = () => {
      const wasDragging = isDraggingRef.current;
      const wasResizing = isResizingRef.current;
      const wasRotating = isRotatingRef.current;

      if (!wasDragging && !wasResizing && !wasRotating) return;

      const el = elementDataRef.current;

      let pendingPositionUpdates: Partial<DesignElement> | undefined;

      if (wasDragging) {
        // Reset the CSS translate and commit the final position to React state in ONE call
        canvasEngine.resetTranslate(el.id);
        const finalPos = finalDragPositionRef.current;
        if (finalPos) {
          // Alt+drag bypasses boundary clamping — signal to onUpdate via marker so Canvas skips re-clamping
          const updates: Record<string, unknown> = { x: finalPos.x, y: finalPos.y };
          if (finalPos.altKey) updates._altDrag = true;
          onUpdateRef.current?.(updates as Partial<DesignElement>);
          // Capture the final position so onManipulationEnd can create keyframes with
          // the correct value before the React state update has propagated to elementsRef.
          pendingPositionUpdates = { x: finalPos.x, y: finalPos.y };
        }
        finalDragPositionRef.current = null;
      }

      isDraggingRef.current = false;
      isResizingRef.current = null;
      isRotatingRef.current = false;
      isDuplicatingRef.current = false;

      if (onHideSnapGuidesRef.current) onHideSnapGuidesRef.current();
      if (onManipulationEndRef.current) onManipulationEndRef.current(el.id, pendingPositionUpdates);
    };

    document.addEventListener('mousemove', handleGlobalMouseMove);
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchmove', handleGlobalTouchMove, { passive: false });
    document.addEventListener('touchend', handleEnd);

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('touchmove', handleGlobalTouchMove);
      document.removeEventListener('touchend', handleEnd);
    };
  }, []); // Empty deps — registered once on mount, never re-registered

  // -------------------------------------------------------------------------
  // Mask drag handling (still uses React state since it drives handle rendering)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!maskDragState) return;

    const handleMouseMove = (e: MouseEvent) => {
      const el = elementDataRef.current;
      const z = zoomRef.current;
      const dx = (e.clientX - maskDragState.startMouseX) / z;
      const dy = (e.clientY - maskDragState.startMouseY) / z;
      const masks = el.masks || [];
      const mask = masks.find(m => m.id === maskDragState.maskId);
      if (!mask) return;

      let updates: Partial<typeof mask> = {};

      if (maskDragState.type === 'move') {
        updates = { x: maskDragState.startMaskX + dx, y: maskDragState.startMaskY + dy };
      } else if (maskDragState.type === 'resize' && maskDragState.handle) {
        const h = maskDragState.handle;
        let newX = maskDragState.startMaskX;
        let newY = maskDragState.startMaskY;
        let newW = maskDragState.startMaskW;
        let newH = maskDragState.startMaskH;

        if (h === 'se') { newW = Math.max(10, maskDragState.startMaskW + dx); newH = Math.max(10, maskDragState.startMaskH + dy); }
        else if (h === 'sw') { newW = Math.max(10, maskDragState.startMaskW - dx); newX = maskDragState.startMaskX + maskDragState.startMaskW - newW; newH = Math.max(10, maskDragState.startMaskH + dy); }
        else if (h === 'ne') { newW = Math.max(10, maskDragState.startMaskW + dx); newH = Math.max(10, maskDragState.startMaskH - dy); newY = maskDragState.startMaskY + maskDragState.startMaskH - newH; }
        else if (h === 'nw') { newW = Math.max(10, maskDragState.startMaskW - dx); newX = maskDragState.startMaskX + maskDragState.startMaskW - newW; newH = Math.max(10, maskDragState.startMaskH - dy); newY = maskDragState.startMaskY + maskDragState.startMaskH - newH; }
        else if (h === 'n') { newH = Math.max(10, maskDragState.startMaskH - dy); newY = maskDragState.startMaskY + maskDragState.startMaskH - newH; }
        else if (h === 's') { newH = Math.max(10, maskDragState.startMaskH + dy); }
        else if (h === 'e') { newW = Math.max(10, maskDragState.startMaskW + dx); }
        else if (h === 'w') { newW = Math.max(10, maskDragState.startMaskW - dx); newX = maskDragState.startMaskX + maskDragState.startMaskW - newW; }

        updates = { x: newX, y: newY, width: newW, height: newH };
      }

      const updatedMasks = masks.map(m => m.id === maskDragState.maskId ? { ...m, ...updates } : m);
      onUpdateRef.current?.({ masks: updatedMasks });
    };

    const handleMouseUp = () => setMaskDragState(null);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [maskDragState]);

  useEffect(() => {
    if (!shadowMaskDragState) return;

    const handleMouseMove = (e: MouseEvent) => {
      const el = elementDataRef.current;
      const z = zoomRef.current;
      const dx = (e.clientX - shadowMaskDragState.startMouseX) / z;
      const dy = (e.clientY - shadowMaskDragState.startMouseY) / z;
      const masks = el.shadowMasks || [];
      const mask = masks.find(m => m.id === shadowMaskDragState.maskId);
      if (!mask) return;

      let updates: Partial<typeof mask> = {};

      if (shadowMaskDragState.type === 'move') {
        updates = { x: shadowMaskDragState.startMaskX + dx, y: shadowMaskDragState.startMaskY + dy };
      } else if (shadowMaskDragState.type === 'resize' && shadowMaskDragState.handle) {
        const h = shadowMaskDragState.handle;
        let newX = shadowMaskDragState.startMaskX;
        let newY = shadowMaskDragState.startMaskY;
        let newW = shadowMaskDragState.startMaskW;
        let newH = shadowMaskDragState.startMaskH;

        if (h === 'se') { newW = Math.max(10, shadowMaskDragState.startMaskW + dx); newH = Math.max(10, shadowMaskDragState.startMaskH + dy); }
        else if (h === 'sw') { newW = Math.max(10, shadowMaskDragState.startMaskW - dx); newX = shadowMaskDragState.startMaskX + shadowMaskDragState.startMaskW - newW; newH = Math.max(10, shadowMaskDragState.startMaskH + dy); }
        else if (h === 'ne') { newW = Math.max(10, shadowMaskDragState.startMaskW + dx); newH = Math.max(10, shadowMaskDragState.startMaskH - dy); newY = shadowMaskDragState.startMaskY + shadowMaskDragState.startMaskH - newH; }
        else if (h === 'nw') { newW = Math.max(10, shadowMaskDragState.startMaskW - dx); newX = shadowMaskDragState.startMaskX + shadowMaskDragState.startMaskW - newW; newH = Math.max(10, shadowMaskDragState.startMaskH - dy); newY = shadowMaskDragState.startMaskY + shadowMaskDragState.startMaskH - newH; }
        else if (h === 'n') { newH = Math.max(10, shadowMaskDragState.startMaskH - dy); newY = shadowMaskDragState.startMaskY + shadowMaskDragState.startMaskH - newH; }
        else if (h === 's') { newH = Math.max(10, shadowMaskDragState.startMaskH + dy); }
        else if (h === 'e') { newW = Math.max(10, shadowMaskDragState.startMaskW + dx); }
        else if (h === 'w') { newW = Math.max(10, shadowMaskDragState.startMaskW - dx); newX = shadowMaskDragState.startMaskX + shadowMaskDragState.startMaskW - newW; }

        updates = { x: newX, y: newY, width: newW, height: newH };
      }

      const updatedMasks = masks.map(m => m.id === shadowMaskDragState.maskId ? { ...m, ...updates } : m);
      onUpdateRef.current?.({ shadowMasks: updatedMasks });
    };

    const handleMouseUp = () => setShadowMaskDragState(null);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [shadowMaskDragState]);

  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    left: absoluteX,
    top: absoluteY,
    width: element.width,
    height: element.height,
    opacity: element.opacity,
    transform: `rotate(${element.rotation}deg)`,
    cursor: element.locked ? 'default' : 'pointer',
    pointerEvents: element.locked ? 'none' : 'auto'
  };

  const { state: animationState } = useAnimation();

  const materialStyles = useMemo(() => {
    if (element.materialConfig && element.materialConfig.enabled && element.materialConfig.layers.length > 0) {
      return generateShapeMaterialStyle(element.materialConfig);
    }
    if (element.material) {
      materialStyleGenerator.setAnimationTime(animationState.timeline.currentTime);
      return materialStyleGenerator.generateMaterialStyles(element.material);
    }
    if (element.fill) {
      return { backgroundColor: element.fill };
    }
    return { backgroundColor: '#3B82F6' };
  }, [element.materialConfig, element.material, element.fill, animationState.timeline.currentTime]);

  const strokeMaterialStyles = useMemo(() => {
    if (element.strokeMaterialConfig && element.strokeMaterialConfig.enabled && element.strokeMaterialConfig.layers.length > 0) {
      return generateShapeMaterialStyle(element.strokeMaterialConfig);
    }
    return null;
  }, [element.strokeMaterialConfig]);

  const computeInnerShadowCSSParts = (is: typeof element.innerShadow): string[] => {
    if (!is?.enabled || is.blur <= 0) return [];
    const B = is.blur;
    const ox = is.x || 0;
    const oy = is.y || 0;
    const c = is.color || '#000000';
    const borders = is.borders || { top: true, right: true, bottom: true, left: true };
    const allActive = borders.top && borders.right && borders.bottom && borders.left;
    const parts: string[] = [];
    if (allActive) {
      parts.push(`inset ${ox}px ${oy}px ${B}px 0px ${c}`);
    } else {
      if (borders.top)    parts.push(`inset ${ox}px ${B + oy}px ${B}px ${-B + 1}px ${c}`);
      if (borders.bottom) parts.push(`inset ${ox}px ${-(B) + oy}px ${B}px ${-B + 1}px ${c}`);
      if (borders.left)   parts.push(`inset ${B + ox}px ${oy}px ${B}px ${-B + 1}px ${c}`);
      if (borders.right)  parts.push(`inset ${-(B) + ox}px ${oy}px ${B}px ${-B + 1}px ${c}`);
    }
    return parts;
  };

  const resolvedShadowMaskTarget = element.shadowMaskTarget || 'both';
  const outerShadowMasked = !!(element.shadowMaskEnabled &&
    (resolvedShadowMaskTarget === 'outer' || resolvedShadowMaskTarget === 'both'));
  const innerShadowMasked = !!(element.shadowMaskEnabled &&
    (resolvedShadowMaskTarget === 'inner' || resolvedShadowMaskTarget === 'both'));

  const shadowStyle = (() => {
    const parts: string[] = [];
    if (!outerShadowMasked && element.shadow?.blur > 0) {
      parts.push(`${element.shadow.x}px ${element.shadow.y}px ${element.shadow.blur}px ${element.shadow.color}`);
    }
    if (!innerShadowMasked) {
      parts.push(...computeInnerShadowCSSParts(element.innerShadow));
    }
    return parts.length > 0 ? { boxShadow: parts.join(', ') } : {};
  })();

  const getBorderStyle = () => {
    if (strokeMaterialStyles) {
      if (strokeMaterialStyles.backgroundColor) {
        return element.strokeWidth > 0 ? `${element.strokeWidth}px solid ${strokeMaterialStyles.backgroundColor}` : 'none';
      }
      return 'none';
    }
    return element.strokeWidth > 0 ? `${element.strokeWidth}px solid ${element.stroke}` : 'none';
  };

  const getGradientStyle = (_el: DesignElement) => {
    return materialStyles;
  };

  const shapePatternOverlay = element.shapePatternFillEnabled && element.shapePatternType
    ? (() => {
        const patternType = element.shapePatternType!;
        const patternColor = element.shapePatternColor || '#FFFFFF';
        const patternBgColor = element.shapePatternBackgroundColor || 'transparent';
        const patternSize = element.shapePatternSize ?? 10;
        const patternSpacing = element.shapePatternSpacing ?? 5;
        const patternAngle = element.shapePatternAngle ?? 0;
        const patternOpacity = (element.shapePatternOpacity ?? 100) / 100;

        let backgroundValue: string;
        if (patternType === 'custom' && element.shapePatternCustomSvg) {
          backgroundValue = `url("data:image/svg+xml,${encodeURIComponent(element.shapePatternCustomSvg)}")`;
        } else {
          backgroundValue = generatePatternSvgUrl(patternType, patternColor, patternBgColor, patternSize, patternSpacing, patternAngle);
        }

        return {
          position: 'absolute' as const,
          inset: 0,
          background: backgroundValue,
          backgroundRepeat: 'repeat',
          opacity: patternOpacity,
          pointerEvents: 'none' as const,
          borderRadius: 'inherit',
        };
      })()
    : null;

  const clipMaskStyle = useMemo(() => {
    if (!element.masks || element.masks.length === 0) return null;
    return generateClipMaskStyle(element.masks, element.width, element.height);
  }, [element.masks, element.width, element.height]);

  const shadowMaskCSSStyle = useMemo(() => {
    if (!element.shadowMaskEnabled || !element.shadowMasks || element.shadowMasks.length === 0) return null;
    return generateClipMaskStyle(element.shadowMasks, element.width, element.height);
  }, [element.shadowMaskEnabled, element.shadowMasks, element.width, element.height]);

  const maskedBaseStyle: React.CSSProperties = clipMaskStyle
    ? { ...baseStyle, ...clipMaskStyle }
    : baseStyle;

  const renderElement = () => {
    if (element.type === 'group') {
      const isActiveGroup = activeGroupId === element.id;
      return (
        <div
          style={{
            ...baseStyle,
            backgroundColor: 'transparent',
            overflow: 'visible',
            ...(clipMaskStyle || {}),
          }}
          onMouseDown={handleMouseDown}
          onContextMenu={onContextMenu}
          onMouseEnter={() => onHover(true)}
          onMouseLeave={() => onHover(false)}
        >
          {!isActiveGroup && element.children?.map(child => (
            <GroupChildRenderer key={child.id} child={child} />
          ))}
        </div>
      );
    }

    if (element.type === 'hbox' || element.type === 'vbox') {
      const boxFill = element.fill && element.fill !== 'transparent' ? element.fill : undefined;
      const boxStroke = element.stroke && element.stroke !== 'transparent' && (element.strokeWidth ?? 0) > 0
        ? `${element.strokeWidth}px solid ${element.stroke}`
        : undefined;
      const padding = element.padding ?? 0;
      return (
        <div
          style={{
            ...baseStyle,
            backgroundColor: isDropTarget
              ? 'rgba(99,179,237,0.15)'
              : (boxFill ?? 'transparent'),
            border: isDropTarget
              ? '2px dashed #63B3ED'
              : (boxStroke ?? (isSelected ? undefined : '1px dashed rgba(255,255,255,0.15)')),
            boxSizing: 'border-box',
            overflow: 'hidden',
          }}
          onMouseDown={handleMouseDown}
          onContextMenu={onContextMenu}
          onMouseEnter={() => onHover(true)}
          onMouseLeave={() => onHover(false)}
        >
          {isSelected && padding > 0 && (
            <div
              style={{
                position: 'absolute',
                inset: padding,
                border: '1px dashed rgba(250,204,21,0.4)',
                pointerEvents: 'none',
                boxSizing: 'border-box',
              }}
            />
          )}
        </div>
      );
    }

    switch (element.type) {
      case 'rectangle':
        return (
          <div
            data-element-id={element.id}
            style={{
              ...maskedBaseStyle,
              ...getGradientStyle(element),
              border: getBorderStyle(),
              borderRadius: element.borderRadius,
              overflow: 'hidden',
              ...shadowStyle
            }}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStartForDrag}
            onContextMenu={onContextMenu}
            onMouseEnter={() => onHover(true)}
            onMouseLeave={() => onHover(false)}
          >
            {shapePatternOverlay && <div style={shapePatternOverlay} />}
          </div>
        );

      case 'circle':
        return (
          <div
            data-element-id={element.id}
            style={{
              ...maskedBaseStyle,
              ...getGradientStyle(element),
              border: getBorderStyle(),
              borderRadius: '50%',
              overflow: 'hidden',
              ...shadowStyle
            }}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStartForDrag}
            onContextMenu={onContextMenu}
            onMouseEnter={() => onHover(true)}
            onMouseLeave={() => onHover(false)}
          >
            {shapePatternOverlay && <div style={shapePatternOverlay} />}
          </div>
        );

      case 'text': {
        const generatePatternSvg = (type: string, color: string, bgColor: string, size: number, spacing: number, angle: number) => {
          const totalSize = Math.max(1, size + spacing);
          let patternContent = '';

          switch (type) {
            case 'dots':
              patternContent = `<circle cx="${totalSize/2}" cy="${totalSize/2}" r="${size/2}" fill="${color}"/>`;
              break;
            case 'lines':
              patternContent = `<line x1="0" y1="${totalSize/2}" x2="${totalSize}" y2="${totalSize/2}" stroke="${color}" stroke-width="${size}"/>`;
              break;
            case 'grid':
              patternContent = `
                <line x1="0" y1="${totalSize/2}" x2="${totalSize}" y2="${totalSize/2}" stroke="${color}" stroke-width="${size/2}"/>
                <line x1="${totalSize/2}" y1="0" x2="${totalSize/2}" y2="${totalSize}" stroke="${color}" stroke-width="${size/2}"/>
              `;
              break;
            case 'diagonal':
              patternContent = `<line x1="0" y1="${totalSize}" x2="${totalSize}" y2="0" stroke="${color}" stroke-width="${size}"/>`;
              break;
            case 'chevron':
              patternContent = `
                <polyline points="0,${totalSize/2} ${totalSize/2},0 ${totalSize},${totalSize/2}" fill="none" stroke="${color}" stroke-width="${size}"/>
              `;
              break;
            default:
              patternContent = `<rect width="${totalSize}" height="${totalSize}" fill="${color}"/>`;
          }

          const svg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="${totalSize}" height="${totalSize}">
              <rect width="100%" height="100%" fill="${bgColor}"/>
              <g transform="rotate(${angle} ${totalSize/2} ${totalSize/2})">
                ${patternContent}
              </g>
            </svg>
          `;
          return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
        };

        const textStyles: React.CSSProperties = {
          ...maskedBaseStyle,
          fontSize: element.fontSize,
          fontWeight: element.fontWeight,
          fontFamily: element.fontFamily || 'Inter',
          fontStyle: element.fontStyle || 'normal',
          textTransform: element.textTransform === 'small-caps' ? 'lowercase' : (element.textTransform || 'none') as any,
          fontVariant: element.textTransform === 'small-caps' ? 'small-caps' : 'normal',
          textDecoration: element.textDecoration || 'none',
          letterSpacing: element.letterSpacing ? `${element.letterSpacing}px` : 'normal',
          lineHeight: element.lineHeight || 1.2,
          wordSpacing: element.wordSpacing ? `${element.wordSpacing}px` : 'normal',
          textAlign: element.textAlign || 'left',
          display: 'flex',
          alignItems: element.verticalAlign === 'top' ? 'flex-start' :
                    element.verticalAlign === 'bottom' ? 'flex-end' : 'center',
          justifyContent: element.textAlign === 'center' ? 'center' :
                       element.textAlign === 'right' ? 'flex-end' :
                       element.textAlign === 'justify' ? 'stretch' : 'flex-start',
          padding: `${element.textPaddingTop || 4}px ${element.textPaddingRight || 4}px ${element.textPaddingBottom || 4}px ${element.textPaddingLeft || 4}px`,
          whiteSpace: element.textWrap === 'nowrap' ? 'nowrap' :
                     element.textWrap === 'balance' ? 'balance' as any :
                     element.textAlign === 'justify' ? 'normal' : 'pre-wrap',
          textOverflow: element.textOverflow || 'clip',
          overflow: element.textOverflow === 'ellipsis' ? 'hidden' : 'visible',
          textIndent: element.textIndent ? `${element.textIndent}px` : '0',
          ...shadowStyle
        };

        const spanFillStyle: React.CSSProperties = {
          display: 'block',
          width: '100%',
          textOverflow: element.textOverflow || 'clip',
          overflow: element.textOverflow === 'ellipsis' ? 'hidden' : 'visible',
        };

        let fillApplied = false;

        if (element.textTextureFillEnabled && element.textTextureFillImage) {
          const scale = element.textTextureFillScale || 100;
          const offsetX = element.textTextureFillOffsetX || 0;
          const offsetY = element.textTextureFillOffsetY || 0;
          spanFillStyle.color = element.textColor || '#FFFFFF';
          spanFillStyle.background = `url(${element.textTextureFillImage})`;
          spanFillStyle.backgroundSize = `${scale}%`;
          spanFillStyle.backgroundPosition = `${offsetX}px ${offsetY}px`;
          spanFillStyle.backgroundRepeat = 'repeat';
          spanFillStyle.WebkitBackgroundClip = 'text';
          spanFillStyle.WebkitTextFillColor = 'transparent';
          spanFillStyle.backgroundClip = 'text';
          fillApplied = true;
        } else if (element.textPatternFillEnabled && element.textPatternType) {
          const patternType = element.textPatternType;
          const patternColor = element.textPatternColor || '#FFFFFF';
          const patternBgColor = element.textPatternBackgroundColor || 'transparent';
          const patternSize = element.textPatternSize ?? 10;
          const patternSpacing = element.textPatternSpacing ?? 5;
          const patternAngle = element.textPatternAngle ?? 0;

          let patternBackground: string;
          if (patternType === 'custom' && element.textPatternCustomSvg) {
            patternBackground = `url("data:image/svg+xml,${encodeURIComponent(element.textPatternCustomSvg)}")`;
          } else {
            patternBackground = generatePatternSvg(patternType, patternColor, patternBgColor, patternSize, patternSpacing, patternAngle);
          }
          spanFillStyle.color = patternColor;
          spanFillStyle.background = patternBackground;
          spanFillStyle.backgroundRepeat = 'repeat';
          spanFillStyle.WebkitBackgroundClip = 'text';
          spanFillStyle.WebkitTextFillColor = 'transparent';
          spanFillStyle.backgroundClip = 'text';
          fillApplied = true;
        } else if (element.textGradientEnabled && element.textGradientColors && element.textGradientColors.length >= 2) {
          const sortedColors = [...element.textGradientColors].sort((a, b) => a.position - b.position);
          const gradientColors = sortedColors.map(c => `${c.color} ${c.position}%`).join(', ');
          const firstColor = sortedColors[0]?.color || (element.textColor || '#FFFFFF');
          if (element.textGradientType === 'radial') {
            spanFillStyle.background = `radial-gradient(circle, ${gradientColors})`;
          } else {
            const angle = element.textGradientAngle || 90;
            spanFillStyle.background = `linear-gradient(${angle}deg, ${gradientColors})`;
          }
          spanFillStyle.color = firstColor;
          spanFillStyle.WebkitBackgroundClip = 'text';
          spanFillStyle.WebkitTextFillColor = 'transparent';
          spanFillStyle.backgroundClip = 'text';
          fillApplied = true;
        }

        if (!fillApplied) {
          spanFillStyle.color = element.textColor || '#FFFFFF';
        }

        if (element.textStrokeWidth && element.textStrokeWidth > 0) {
          textStyles.WebkitTextStroke = `${element.textStrokeWidth}px ${element.textStrokeColor || '#000000'}`;
        }

        const textShadows: string[] = [];
        if (element.textShadowBlur || element.textShadowOffsetX || element.textShadowOffsetY) {
          textShadows.push(
            `${element.textShadowOffsetX || 0}px ${element.textShadowOffsetY || 0}px ${element.textShadowBlur || 0}px ${element.textShadowColor || '#000000'}`
          );
        }

        if (element.textGlowSize && element.textGlowSize > 0 && element.textGlowIntensity && element.textGlowIntensity > 0) {
          const glowColor = element.textGlowColor || '#FFFFFF';
          const opacity = element.textGlowIntensity;
          for (let i = 1; i <= 3; i++) {
            const size = element.textGlowSize * (i / 3);
            const currentOpacity = opacity * (1 - i / 4);
            textShadows.push(`0 0 ${size}px ${glowColor}${Math.round(currentOpacity * 255).toString(16).padStart(2, '0')}`);
          }
        }

        if (textShadows.length > 0) {
          textStyles.textShadow = textShadows.join(', ');
        }

        if (element.baselineShift && element.baselineShift !== 0) {
          textStyles.transform = `translateY(${-element.baselineShift}px)`;
        }

        if (element.maxLines && element.maxLines > 0) {
          spanFillStyle.display = '-webkit-box';
          spanFillStyle.WebkitLineClamp = element.maxLines;
          spanFillStyle.WebkitBoxOrient = 'vertical';
          spanFillStyle.overflow = 'hidden';
        }

        if (element.richTextEnabled && element.richTextSegments && element.richTextSegments.length > 0) {
          return (
            <div
              data-element-id={element.id}
              style={{
                ...textStyles,
                WebkitBackgroundClip: undefined,
                WebkitTextFillColor: undefined,
                backgroundClip: undefined,
                background: undefined,
                color: undefined
              }}
              onMouseDown={handleMouseDown}
              onContextMenu={onContextMenu}
              onMouseEnter={() => onHover(true)}
              onMouseLeave={() => onHover(false)}
            >
              {element.richTextSegments.map((segment) => (
                <span
                  key={segment.id}
                  style={{
                    fontFamily: segment.fontFamily || element.fontFamily || 'Inter',
                    fontSize: segment.fontSize ? `${segment.fontSize}px` : undefined,
                    fontWeight: segment.fontWeight || undefined,
                    fontStyle: segment.fontStyle || undefined,
                    color: segment.color || element.textColor || '#FFFFFF',
                    textDecoration: segment.textDecoration || 'none',
                    letterSpacing: segment.letterSpacing ? `${segment.letterSpacing}px` : undefined
                  }}
                >
                  {segment.text}
                </span>
              ))}
            </div>
          );
        }

        const fillTypeKey = element.textPatternFillEnabled ? `pattern-${element.textPatternType}`
          : element.textGradientEnabled ? 'gradient'
          : element.textTextureFillEnabled ? 'texture'
          : 'solid';

        const animLayers = element.animatorLayers;
        if (animLayers && animLayers.length > 0) {
          const currentTime = animationState.timeline.currentTime;
          const segs = buildTextSegments(element);
          const contribs = computeTextAnimatorContributions(
            segs, animLayers, currentTime, element.id, element.text || ''
          );
          const hasChar = animLayers.some(l => l.targetType === 'characters');
          const hasWord = animLayers.some(l => l.targetType === 'words');
          const renderLevel = hasChar ? 'char' : hasWord ? 'word' : 'line';

          const lines = (element.text || '').split('\n');
          const segSpans: React.ReactNode[] = [];

          lines.forEach((lineText, li) => {
            if (renderLevel === 'line') {
              const c = contribs.get(`line-${li}`) ?? identityContribution();
              const tf = _segTransform(c);
              const cp = _segClip(c);
              segSpans.push(
                <span key={`l${li}`} style={{
                  display: 'block',
                  opacity: c.opacity,
                  transform: tf,
                  filter: c.blur > 0 ? `blur(${c.blur}px)` : undefined,
                  clipPath: cp,
                  ...spanFillStyle,
                }}>{lineText}</span>
              );
            } else {
              const wordParts = lineText.split(/(\s+)/);
              let wordIdx = 0;
              const lineNodes: React.ReactNode[] = [];
              wordParts.forEach((part, pi) => {
                if (part.length === 0) return;
                if (/^\s+$/.test(part)) {
                  lineNodes.push(<span key={`sp${li}-${pi}`}>{part}</span>);
                  return;
                }
                if (renderLevel === 'word') {
                  const c = contribs.get(`word-${li}-${wordIdx}`) ?? identityContribution();
                  const tf = _segTransform(c);
                  const cp = _segClip(c);
                  lineNodes.push(
                    <span key={`w${li}-${wordIdx}`} style={{
                      display: 'inline-block',
                      opacity: c.opacity,
                      transform: tf,
                      filter: c.blur > 0 ? `blur(${c.blur}px)` : undefined,
                      clipPath: cp,
                      ...spanFillStyle,
                    }}>{part}</span>
                  );
                } else {
                  [...part].forEach((char, ci) => {
                    const c = contribs.get(`char-${li}-${wordIdx}-${ci}`) ?? identityContribution();
                    const tf = _segTransform(c);
                    const cp = _segClip(c);
                    lineNodes.push(
                      <span key={`c${li}-${wordIdx}-${ci}`} style={{
                        display: 'inline-block',
                        opacity: c.opacity,
                        transform: tf,
                        filter: c.blur > 0 ? `blur(${c.blur}px)` : undefined,
                        clipPath: cp,
                        ...spanFillStyle,
                      }}>{char === ' ' ? '\u00A0' : char}</span>
                    );
                  });
                }
                wordIdx++;
              });
              segSpans.push(<React.Fragment key={`ln${li}`}>{lineNodes}</React.Fragment>);
            }
            if (li < lines.length - 1) segSpans.push(<br key={`br${li}`} />);
          });

          return (
            <div
              data-element-id={element.id}
              style={{ ...textStyles, overflow: 'visible' }}
              onMouseDown={handleMouseDown}
              onTouchStart={handleTouchStartForDrag}
              onContextMenu={onContextMenu}
              onMouseEnter={() => onHover(true)}
              onMouseLeave={() => onHover(false)}
            >
              <span style={{ display: 'block', width: '100%', whiteSpace: 'pre-wrap' }}>
                {segSpans}
              </span>
            </div>
          );
        }

        return (
          <div
            data-element-id={element.id}
            style={textStyles}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStartForDrag}
            onContextMenu={onContextMenu}
            onMouseEnter={() => onHover(true)}
            onMouseLeave={() => onHover(false)}
          >
            <span key={fillTypeKey} style={spanFillStyle}>{element.text}</span>
          </div>
        );
      }

      case 'button':
        return (
          <div
            data-element-id={element.id}
            style={{
              ...maskedBaseStyle,
              ...getGradientStyle(element),
              border: getBorderStyle(),
              borderRadius: element.borderRadius,
              overflow: 'hidden',
              color: element.textColor,
              fontSize: element.fontSize,
              fontWeight: element.fontWeight,
              fontFamily: element.fontFamily || 'Inter',
              fontStyle: element.fontStyle || 'normal',
              textTransform: element.textTransform || 'none',
              textDecoration: element.textDecoration || 'none',
              letterSpacing: element.letterSpacing ? `${element.letterSpacing}px` : 'normal',
              lineHeight: element.lineHeight || 1.2,
              wordSpacing: element.wordSpacing ? `${element.wordSpacing}px` : 'normal',
              textAlign: element.textAlign || 'center',
              display: 'flex',
              alignItems: element.verticalAlign === 'top' ? 'flex-start' :
                        element.verticalAlign === 'bottom' ? 'flex-end' : 'center',
              justifyContent: element.textAlign === 'center' ? 'center' :
                           element.textAlign === 'right' ? 'flex-end' :
                           element.textAlign === 'justify' ? 'stretch' : 'flex-start',
              whiteSpace: element.textAlign === 'justify' ? 'normal' : 'pre-wrap',
              ...shadowStyle
            }}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStartForDrag}
            onContextMenu={onContextMenu}
            onMouseEnter={() => onHover(true)}
            onMouseLeave={() => onHover(false)}
          >
            {shapePatternOverlay && <div style={shapePatternOverlay} />}
            {element.text}
          </div>
        );

      case 'chat-bubble':
        return (
          <div
            data-element-id={element.id}
            style={{
              ...maskedBaseStyle,
              ...getGradientStyle(element),
              border: getBorderStyle(),
              borderRadius: element.borderRadius,
              overflow: 'hidden',
              color: element.textColor,
              fontSize: element.fontSize,
              fontWeight: element.fontWeight,
              fontFamily: element.fontFamily || 'Inter',
              fontStyle: element.fontStyle || 'normal',
              textTransform: element.textTransform || 'none',
              letterSpacing: element.letterSpacing ? `${element.letterSpacing}px` : 'normal',
              lineHeight: element.lineHeight || 1.2,
              wordSpacing: element.wordSpacing ? `${element.wordSpacing}px` : 'normal',
              textDecoration: element.textDecoration || 'none',
              display: 'flex',
              alignItems: element.verticalAlign === 'top' ? 'flex-start' :
                        element.verticalAlign === 'bottom' ? 'flex-end' : 'center',
              justifyContent: element.textAlign === 'center' ? 'center' :
                           element.textAlign === 'right' ? 'flex-end' :
                           element.textAlign === 'justify' ? 'stretch' : 'flex-start',
              textAlign: element.textAlign || 'left',
              padding: '12px 16px',
              whiteSpace: element.textAlign === 'justify' ? 'normal' : 'pre-wrap',
              ...shadowStyle
            }}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStartForDrag}
            onContextMenu={onContextMenu}
            onMouseEnter={() => onHover(true)}
            onMouseLeave={() => onHover(false)}
          >
            {shapePatternOverlay && <div style={shapePatternOverlay} />}
            {element.text}
          </div>
        );

      case 'chat-frame':
        return (
          <div
            data-element-id={element.id}
            style={{
              ...maskedBaseStyle,
              ...getGradientStyle(element),
              border: getBorderStyle(),
              borderRadius: element.borderRadius,
              ...shadowStyle
            }}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStartForDrag}
            onContextMenu={onContextMenu}
            onMouseEnter={() => onHover(true)}
            onMouseLeave={() => onHover(false)}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: '50%',
                transform: 'translateX(-50%)',
                width: '40%',
                height: '20px',
                ...(element.gradientEnabled ? getGradientStyle(element) : { backgroundColor: element.fill }),
                borderRadius: '0 0 12px 12px'
              }}
            />
          </div>
        );

      case 'line':
        return (
          <EnhancedLineComponent
            element={element}
            isSelected={isSelected}
            isHovered={isHovered}
            onUpdate={onUpdate}
            onMouseDown={handleMouseDown}
            onContextMenu={onContextMenu}
            absoluteX={absoluteX}
            absoluteY={absoluteY}
            zoom={zoom}
          />
        );

      case 'image':
        return (
          <div
            data-element-id={element.id}
            style={{
              ...maskedBaseStyle,
              overflow: 'hidden',
              borderRadius: element.borderRadius || 0,
              ...shadowStyle
            }}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStartForDrag}
            onContextMenu={onContextMenu}
            onMouseEnter={() => onHover(true)}
            onMouseLeave={() => onHover(false)}
          >
            {element.imageData && (
              <ImageWithFilters
                src={element.imageData}
                alt={element.name}
                filters={element.filters}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'fill',
                  display: 'block',
                  pointerEvents: 'none',
                  userSelect: 'none',
                  transform: [
                    element.mirrorH ? 'scaleX(-1)' : '',
                    element.mirrorV ? 'scaleY(-1)' : ''
                  ].filter(Boolean).join(' ') || undefined
                }}
              />
            )}
          </div>
        );

      case 'star': {
        const points = element.starPoints || 5;
        const innerRadius = (element.starInnerRadius || 50) / 100;
        const centerX = element.width / 2;
        const centerY = element.height / 2;
        const outerRadius = Math.min(element.width, element.height) / 2;
        const innerRadiusCalc = outerRadius * innerRadius;

        const starPath: string[] = [];
        for (let i = 0; i < points * 2; i++) {
          const angle = (i * Math.PI) / points - Math.PI / 2;
          const radius = i % 2 === 0 ? outerRadius : innerRadiusCalc;
          const x = centerX + radius * Math.cos(angle);
          const y = centerY + radius * Math.sin(angle);
          starPath.push(i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`);
        }
        starPath.push('Z');

        const starPathStr = starPath.join(' ');
        const starPatternId = `star-pattern-${element.id}`;

        return (
          <div
            data-element-id={element.id}
            style={maskedBaseStyle}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStartForDrag}
            onContextMenu={onContextMenu}
            onMouseEnter={() => onHover(true)}
            onMouseLeave={() => onHover(false)}
          >
            <svg width="100%" height="100%" style={{ display: 'block' }}>
              <defs>
                {element.shadow?.blur > 0 && (
                  <filter id={`star-shadow-${element.id}`}>
                    <feDropShadow
                      dx={element.shadow.x}
                      dy={element.shadow.y}
                      stdDeviation={element.shadow.blur / 2}
                      floodColor={element.shadow.color}
                    />
                  </filter>
                )}
                {shapePatternOverlay && (() => {
                  const tileSize = Math.max(1, (element.shapePatternSize ?? 10) + (element.shapePatternSpacing ?? 5));
                  const dataUri = element.shapePatternType === 'custom' && element.shapePatternCustomSvg
                    ? `data:image/svg+xml,${encodeURIComponent(element.shapePatternCustomSvg)}`
                    : generatePatternDataUri(
                        element.shapePatternType || 'dots',
                        element.shapePatternColor || '#FFFFFF',
                        element.shapePatternBackgroundColor || 'transparent',
                        element.shapePatternSize ?? 10,
                        element.shapePatternSpacing ?? 5,
                        element.shapePatternAngle ?? 0
                      );
                  return (
                    <pattern
                      id={starPatternId}
                      patternUnits="userSpaceOnUse"
                      width={tileSize}
                      height={tileSize}
                    >
                      <image
                        href={dataUri}
                        width={tileSize}
                        height={tileSize}
                      />
                    </pattern>
                  );
                })()}
              </defs>
              <path
                d={starPathStr}
                fill={materialStyles.backgroundColor || '#FBBF24'}
                stroke={element.stroke}
                strokeWidth={element.strokeWidth}
                filter={element.shadow?.blur > 0 ? `url(#star-shadow-${element.id})` : undefined}
              />
              {shapePatternOverlay && (
                <path
                  d={starPathStr}
                  fill={`url(#${starPatternId})`}
                  opacity={shapePatternOverlay.opacity as number}
                  pointerEvents="none"
                />
              )}
            </svg>
          </div>
        );
      }

      case 'gradient': {
        const gradientColors = element.gradientColors || [
          { color: '#3B82F6', position: 0, id: 'gradient-1' },
          { color: '#06B6D4', position: 100, id: 'gradient-2' }
        ];
        const gradientType = element.gradientType || 'linear';
        const gradientAngle = element.gradientAngle || 45;
        const centerX = element.gradientCenterX || 50;
        const centerY = element.gradientCenterY || 50;

        let gradientStyle: React.CSSProperties = {};
        if (gradientType === 'linear') {
          const colorStops = gradientColors.map(c => `${c.color} ${c.position}%`).join(', ');
          gradientStyle.background = `linear-gradient(${gradientAngle}deg, ${colorStops})`;
        } else if (gradientType === 'radial') {
          const colorStops = gradientColors.map(c => `${c.color} ${c.position}%`).join(', ');
          gradientStyle.background = `radial-gradient(circle at ${centerX}% ${centerY}%, ${colorStops})`;
        } else if (gradientType === 'conic') {
          const colorStops = gradientColors.map(c => `${c.color} ${c.position}%`).join(', ');
          gradientStyle.background = `conic-gradient(from ${gradientAngle}deg at ${centerX}% ${centerY}%, ${colorStops})`;
        }

        return (
          <div
            data-element-id={element.id}
            style={{
              ...maskedBaseStyle,
              ...gradientStyle,
              border: getBorderStyle(),
              borderRadius: element.borderRadius,
              overflow: 'hidden',
              ...shadowStyle
            }}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStartForDrag}
            onContextMenu={onContextMenu}
            onMouseEnter={() => onHover(true)}
            onMouseLeave={() => onHover(false)}
          >
            {shapePatternOverlay && <div style={shapePatternOverlay} />}
          </div>
        );
      }

      case 'adjustment-layer': {
        const adjustmentType = element.adjustmentType || 'brightness-contrast';
        const intensity = (element.adjustmentIntensity || 50) / 100;

        let filterStyle = '';
        switch (adjustmentType) {
          case 'brightness-contrast':
            filterStyle = `brightness(${0.5 + intensity}) contrast(${0.5 + intensity})`;
            break;
          case 'hue-saturation':
            filterStyle = `hue-rotate(${intensity * 360}deg) saturate(${intensity * 2})`;
            break;
          case 'color':
            filterStyle = `saturate(${intensity * 2})`;
            break;
          case 'levels':
            filterStyle = `brightness(${intensity}) contrast(${intensity})`;
            break;
          default:
            filterStyle = '';
        }

        return (
          <div
            data-element-id={element.id}
            style={{
              ...maskedBaseStyle,
              backgroundColor: 'rgba(99, 102, 241, 0.1)',
              border: element.strokeWidth > 0 ? `${element.strokeWidth}px dashed ${element.stroke}` : '2px dashed rgba(99, 102, 241, 0.5)',
              borderRadius: element.borderRadius,
              backdropFilter: filterStyle,
              WebkitBackdropFilter: filterStyle,
              mixBlendMode: element.blendMode || 'normal',
              ...shadowStyle
            }}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStartForDrag}
            onContextMenu={onContextMenu}
            onMouseEnter={() => onHover(true)}
            onMouseLeave={() => onHover(false)}
          >
          </div>
        );
      }

      case 'svg': {
        const svgData = element.svgData || '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>';
        const fillColor = element.svgFillColor || '#3B82F6';
        const strokeColor = element.svgStrokeColor || '#1E40AF';

        const processedSvg = svgData
          .replace(/fill="[^"]*"/g, `fill="${fillColor}"`)
          .replace(/stroke="[^"]*"/g, `stroke="${strokeColor}"`)
          .replace(/<svg/, `<svg style="width: 100%; height: 100%; display: block;"`);

        return (
          <div
            data-element-id={element.id}
            style={{
              ...maskedBaseStyle,
              border: getBorderStyle(),
              borderRadius: element.borderRadius,
              ...shadowStyle
            }}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStartForDrag}
            onContextMenu={onContextMenu}
            onMouseEnter={() => onHover(true)}
            onMouseLeave={() => onHover(false)}
            dangerouslySetInnerHTML={{ __html: processedSvg }}
          />
        );
      }

      case 'video':
        return (
          <div
            data-element-id={element.id}
            style={{
              position: 'absolute',
              left: absoluteX,
              top: absoluteY,
              width: element.width,
              height: element.height,
              transform: `rotate(${element.rotation}deg)`,
              opacity: element.opacity,
              borderRadius: element.borderRadius,
              overflow: 'hidden',
              cursor: element.locked ? 'default' : 'move',
              pointerEvents: element.locked ? 'none' : 'auto',
              background: 'transparent',
            }}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStartForDrag}
            onContextMenu={onContextMenu}
            onMouseEnter={() => onHover(true)}
            onMouseLeave={() => onHover(false)}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div
      ref={outerWrapperRef}
      onDoubleClick={(e) => {
        if (element.type === 'group' && !isInsideGroup) {
          e.stopPropagation();
          onDoubleClickProp?.(element.id);
          return;
        }
      }}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: 0,
        height: 0,
        overflow: 'visible',
      }}
    >
      {outerShadowMasked && element.shadow?.blur > 0 && (
        <div style={{
          position: 'absolute',
          left: absoluteX,
          top: absoluteY,
          width: element.width,
          height: element.height,
          opacity: element.opacity,
          transform: `rotate(${element.rotation}deg)`,
          transformOrigin: 'center center',
          pointerEvents: 'none',
          borderRadius: element.borderRadius,
          background: 'transparent',
          overflow: 'visible',
          boxShadow: `${element.shadow.x}px ${element.shadow.y}px ${element.shadow.blur}px ${element.shadow.color}`,
          ...(shadowMaskCSSStyle || {}),
        }} />
      )}

      {renderElement()}

      {innerShadowMasked && element.innerShadow?.enabled && element.innerShadow.blur > 0 && (() => {
        const innerCSS = computeInnerShadowCSSParts(element.innerShadow).join(', ');
        if (!innerCSS) return null;
        return (
          <div style={{
            position: 'absolute',
            left: absoluteX,
            top: absoluteY,
            width: element.width,
            height: element.height,
            opacity: element.opacity,
            transform: `rotate(${element.rotation}deg)`,
            transformOrigin: 'center center',
            pointerEvents: 'none',
            borderRadius: element.borderRadius,
            background: 'transparent',
            overflow: 'hidden',
            boxShadow: innerCSS,
            ...(shadowMaskCSSStyle || {}),
          }} />
        );
      })()}

      {(isSelected || isHovered) && !element.locked && element.type !== 'line' && (
        <div
          style={{
            position: 'absolute',
            left: absoluteX - 2,
            top: absoluteY - 2,
            width: element.width + 4,
            height: element.height + 4,
            border: isSelected
              ? (element.type === 'group' ? '2px dashed #FFD700' : '2px solid #FFD700')
              : (element.type === 'group' ? '2px dashed rgba(255, 215, 0, 0.5)' : '2px solid rgba(255, 215, 0, 0.5)'),
            borderRadius: element.type === 'group' ? 4 : element.borderRadius + 2,
            pointerEvents: 'none',
            transform: `rotate(${element.rotation}deg)`,
            transformOrigin: 'center center'
          }}
        >
          {isSelected && (() => {
            // Compute zoom-scaled handle sizes.
            // baseHandleSize / zoom keeps apparent screen size constant at any zoom level.
            // Clamped to [4, 16] screen pixels to stay usable at extreme zoom levels.
            const baseHandleSize = 10;
            const cornerSize = Math.max(4, Math.min(16, baseHandleSize / zoom));
            // Side handles are 80% of corner handle size per design spec
            const sideSize = cornerSize * 0.8;
            // Shadow offset: 1.5px in screen space, divided by zoom for canvas space
            const shadowOffset = 1.5 / zoom;
            const cornerPositions = new Set(['nw', 'ne', 'sw', 'se']);

            return getResizeHandles().map((handle) => {
              const isCorner = cornerPositions.has(handle.position);
              const sz = isCorner ? cornerSize : sideSize;
              const half = sz / 2;
              // Center of handle in canvas coords
              const cx = handle.x + half;
              const cy = handle.y + half;

              return (
                <div
                  key={handle.position}
                  style={{
                    position: 'absolute',
                    // Expand hit area while keeping visual centered on the handle coord
                    left: handle.x - half,
                    top: handle.y - half,
                    width: sz + half * 2,
                    height: sz + half * 2,
                    cursor: handle.cursor,
                    pointerEvents: 'auto',
                  }}
                  onMouseDown={(e) => handleResizeStart(e, handle)}
                >
                  {/*
                    Flat offset shadow: a plain black square offset 1.5px right+down in screen
                    space (shadowOffset in canvas px). No blur, no CSS box-shadow — this is the
                    After Effects handle aesthetic: two solid squares, shadow behind, white on top.
                  */}
                  <div
                    style={{
                      position: 'absolute',
                      left: half + shadowOffset,
                      top: half + shadowOffset,
                      width: sz,
                      height: sz,
                      backgroundColor: 'rgba(0,0,0,0.6)',
                      pointerEvents: 'none',
                    }}
                  />
                  {/* Main white handle square — no border, no radius, flat solid white */}
                  <div
                    style={{
                      position: 'absolute',
                      left: half,
                      top: half,
                      width: sz,
                      height: sz,
                      backgroundColor: '#FFFFFF',
                      pointerEvents: 'none',
                    }}
                  />
                </div>
              );
            });
          })()}

          {isSelected && (() => {
            // Rotation handle: zoom-scaled circle above the element
            const rotHandleSize = Math.max(6, Math.min(20, 14 / zoom));
            const rotHandleHalf = rotHandleSize / 2;
            const rotShadowOffset = 1.5 / zoom;
            return (
              <div
                style={{
                  position: 'absolute',
                  left: element.width / 2 - rotHandleHalf - rotHandleSize,
                  top: Math.max(-100 / zoom, -rotHandleHalf) - 40 / zoom,
                  width: rotHandleSize * 3,
                  height: rotHandleSize * 3,
                  cursor: 'pointer',
                  pointerEvents: 'auto',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onMouseDown={handleRotateStart}
              >
                {/* Flat offset shadow */}
                <div
                  style={{
                    position: 'absolute',
                    left: rotHandleSize + rotShadowOffset,
                    top: rotHandleSize + rotShadowOffset,
                    width: rotHandleSize,
                    height: rotHandleSize,
                    borderRadius: '50%',
                    backgroundColor: 'rgba(0,0,0,0.6)',
                    pointerEvents: 'none',
                  }}
                />
                {/* Main white circle handle */}
                <div
                  style={{
                    position: 'absolute',
                    left: rotHandleSize,
                    top: rotHandleSize,
                    width: rotHandleSize,
                    height: rotHandleSize,
                    borderRadius: '50%',
                    backgroundColor: '#FFFFFF',
                    pointerEvents: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg
                    width={rotHandleSize * 0.65}
                    height={rotHandleSize * 0.65}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#222"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  >
                    <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
                  </svg>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {isSelected && !element.locked && element.shadowMaskEnabled && element.shadowMasks && element.shadowMasks.length > 0 && (
        element.shadowMasks.filter(m => m.enabled).map(mask => {
          const handleSize = Math.max(4, Math.min(14, 8 / zoom));
          const half = handleSize / 2;
          const centerSize = Math.max(16, Math.min(40, 28 / zoom));
          const centerHalf = centerSize / 2;
          const shadowOffset = 1.5 / zoom;
          const mx = absoluteX + mask.x;
          const my = absoluteY + mask.y;
          const mw = mask.width;
          const mh = mask.height;

          const maskHandles = [
            { id: 'nw', cursor: 'nw-resize', x: -half, y: -half },
            { id: 'ne', cursor: 'ne-resize', x: mw - half, y: -half },
            { id: 'sw', cursor: 'sw-resize', x: -half, y: mh - half },
            { id: 'se', cursor: 'se-resize', x: mw - half, y: mh - half },
            { id: 'n', cursor: 'n-resize', x: mw / 2 - half, y: -half },
            { id: 's', cursor: 's-resize', x: mw / 2 - half, y: mh - half },
            { id: 'e', cursor: 'e-resize', x: mw - half, y: mh / 2 - half },
            { id: 'w', cursor: 'w-resize', x: -half, y: mh / 2 - half },
          ];

          return (
            <div
              key={`shadow-mask-overlay-${mask.id}`}
              style={{
                position: 'absolute',
                left: mx,
                top: my,
                width: mw,
                height: mh,
                border: '2px dashed #22D3EE',
                borderRadius: mask.type === 'circle' ? '50%' : (mask.borderRadius || 0),
                pointerEvents: 'none',
                boxSizing: 'border-box',
                transform: mask.rotation ? `rotate(${mask.rotation}deg)` : undefined,
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: mw / 2 - centerHalf - centerSize,
                  top: mh / 2 - centerHalf - centerSize,
                  width: centerSize * 3,
                  height: centerSize * 3,
                  cursor: 'move',
                  pointerEvents: 'auto',
                  zIndex: 10,
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setShadowMaskDragState({
                    maskId: mask.id,
                    type: 'move',
                    startMouseX: e.clientX,
                    startMouseY: e.clientY,
                    startMaskX: mask.x,
                    startMaskY: mask.y,
                    startMaskW: mask.width,
                    startMaskH: mask.height,
                  });
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: centerSize + shadowOffset,
                    top: centerSize + shadowOffset,
                    width: centerSize,
                    height: centerSize,
                    borderRadius: '50%',
                    backgroundColor: 'rgba(0,0,0,0.6)',
                    pointerEvents: 'none',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    left: centerSize,
                    top: centerSize,
                    width: centerSize,
                    height: centerSize,
                    borderRadius: '50%',
                    backgroundColor: '#FFFFFF',
                    border: `${Math.max(1, 2 / zoom)}px solid #22D3EE`,
                    pointerEvents: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg width={centerSize * 0.55} height={centerSize * 0.55} viewBox="0 0 24 24" fill="none" stroke="#0891B2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>
                  </svg>
                </div>
              </div>

              {maskHandles.map(h => {
                const isCornerMask = ['nw', 'ne', 'sw', 'se'].includes(h.id);
                const maskSz = isCornerMask ? handleSize : handleSize * 0.8;
                const maskHalf = maskSz / 2;
                return (
                  <div
                    key={h.id}
                    style={{
                      position: 'absolute',
                      left: h.x - maskHalf,
                      top: h.y - maskHalf,
                      width: maskSz + maskHalf * 2,
                      height: maskSz + maskHalf * 2,
                      cursor: h.cursor,
                      pointerEvents: 'auto',
                      zIndex: 10,
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setShadowMaskDragState({
                        maskId: mask.id,
                        type: 'resize',
                        handle: h.id,
                        startMouseX: e.clientX,
                        startMouseY: e.clientY,
                        startMaskX: mask.x,
                        startMaskY: mask.y,
                        startMaskW: mask.width,
                        startMaskH: mask.height,
                      });
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        left: maskHalf + shadowOffset,
                        top: maskHalf + shadowOffset,
                        width: maskSz,
                        height: maskSz,
                        borderRadius: '50%',
                        backgroundColor: 'rgba(0,0,0,0.6)',
                        pointerEvents: 'none',
                      }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        left: maskHalf,
                        top: maskHalf,
                        width: maskSz,
                        height: maskSz,
                        borderRadius: '50%',
                        backgroundColor: '#FFFFFF',
                        border: `${Math.max(1, 1.5 / zoom)}px solid #22D3EE`,
                        pointerEvents: 'none',
                      }}
                    />
                  </div>
                );
              })}
            </div>
          );
        })
      )}

      {isSelected && !element.locked && element.masks && element.masks.length > 0 && (
        element.masks.filter(m => m.enabled).map(mask => {
          // Zoom-scaled mask handles: same formula as resize handles
          const handleSize = Math.max(4, Math.min(14, 8 / zoom));
          const half = handleSize / 2;
          const centerSize = Math.max(16, Math.min(40, 28 / zoom));
          const centerHalf = centerSize / 2;
          const shadowOffset = 1.5 / zoom;
          const mx = absoluteX + mask.x;
          const my = absoluteY + mask.y;
          const mw = mask.width;
          const mh = mask.height;

          const maskHandles = [
            { id: 'nw', cursor: 'nw-resize', x: -half, y: -half },
            { id: 'ne', cursor: 'ne-resize', x: mw - half, y: -half },
            { id: 'sw', cursor: 'sw-resize', x: -half, y: mh - half },
            { id: 'se', cursor: 'se-resize', x: mw - half, y: mh - half },
            { id: 'n', cursor: 'n-resize', x: mw / 2 - half, y: -half },
            { id: 's', cursor: 's-resize', x: mw / 2 - half, y: mh - half },
            { id: 'e', cursor: 'e-resize', x: mw - half, y: mh / 2 - half },
            { id: 'w', cursor: 'w-resize', x: -half, y: mh / 2 - half },
          ];

          return (
            <div
              key={`mask-overlay-${mask.id}`}
              style={{
                position: 'absolute',
                left: mx,
                top: my,
                width: mw,
                height: mh,
                border: '2px dashed #22D3EE',
                borderRadius: mask.type === 'circle' ? '50%' : (mask.borderRadius || 0),
                pointerEvents: 'none',
                boxSizing: 'border-box',
                transform: mask.rotation ? `rotate(${mask.rotation}deg)` : undefined,
              }}
            >
              {/* Mask move handle — white circle with flat shadow, cyan tint border ring */}
              <div
                style={{
                  position: 'absolute',
                  left: mw / 2 - centerHalf - centerSize,
                  top: mh / 2 - centerHalf - centerSize,
                  width: centerSize * 3,
                  height: centerSize * 3,
                  cursor: 'move',
                  pointerEvents: 'auto',
                  zIndex: 10,
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setMaskDragState({
                    maskId: mask.id,
                    type: 'move',
                    startMouseX: e.clientX,
                    startMouseY: e.clientY,
                    startMaskX: mask.x,
                    startMaskY: mask.y,
                    startMaskW: mask.width,
                    startMaskH: mask.height,
                  });
                }}
              >
                {/* Flat offset shadow */}
                <div
                  style={{
                    position: 'absolute',
                    left: centerSize + shadowOffset,
                    top: centerSize + shadowOffset,
                    width: centerSize,
                    height: centerSize,
                    borderRadius: '50%',
                    backgroundColor: 'rgba(0,0,0,0.6)',
                    pointerEvents: 'none',
                  }}
                />
                {/* Main handle */}
                <div
                  style={{
                    position: 'absolute',
                    left: centerSize,
                    top: centerSize,
                    width: centerSize,
                    height: centerSize,
                    borderRadius: '50%',
                    backgroundColor: '#FFFFFF',
                    border: `${Math.max(1, 2 / zoom)}px solid #22D3EE`,
                    pointerEvents: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg width={centerSize * 0.55} height={centerSize * 0.55} viewBox="0 0 24 24" fill="none" stroke="#0891B2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>
                  </svg>
                </div>
              </div>

              {maskHandles.map(h => {
                const isCornerMask = ['nw', 'ne', 'sw', 'se'].includes(h.id);
                const maskSz = isCornerMask ? handleSize : handleSize * 0.8;
                const maskHalf = maskSz / 2;
                return (
                  <div
                    key={h.id}
                    style={{
                      position: 'absolute',
                      left: h.x - maskHalf,
                      top: h.y - maskHalf,
                      width: maskSz + maskHalf * 2,
                      height: maskSz + maskHalf * 2,
                      cursor: h.cursor,
                      pointerEvents: 'auto',
                      zIndex: 10,
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setMaskDragState({
                        maskId: mask.id,
                        type: 'resize',
                        handle: h.id,
                        startMouseX: e.clientX,
                        startMouseY: e.clientY,
                        startMaskX: mask.x,
                        startMaskY: mask.y,
                        startMaskW: mask.width,
                        startMaskH: mask.height,
                      });
                    }}
                  >
                    {/* Flat offset shadow */}
                    <div
                      style={{
                        position: 'absolute',
                        left: maskHalf + shadowOffset,
                        top: maskHalf + shadowOffset,
                        width: maskSz,
                        height: maskSz,
                        borderRadius: '50%',
                        backgroundColor: 'rgba(0,0,0,0.6)',
                        pointerEvents: 'none',
                      }}
                    />
                    {/* Main white handle */}
                    <div
                      style={{
                        position: 'absolute',
                        left: maskHalf,
                        top: maskHalf,
                        width: maskSz,
                        height: maskSz,
                        borderRadius: '50%',
                        backgroundColor: '#FFFFFF',
                        border: `${Math.max(1, 1.5 / zoom)}px solid #22D3EE`,
                        pointerEvents: 'none',
                      }}
                    />
                  </div>
                );
              })}
            </div>
          );
        })
      )}
    </div>
  );
};

export default React.memo(EnhancedDesignElementComponent, (prev, next) => {
  return (
    prev.element === next.element &&
    prev.isSelected === next.isSelected &&
    prev.isHovered === next.isHovered &&
    prev.zoom === next.zoom &&
    prev.snapEnabled === next.snapEnabled &&
    prev.disabled === next.disabled
  );
});
