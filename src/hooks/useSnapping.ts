import { useState, useCallback } from 'react';
import { DesignElement } from '../types/design';

export interface SnapGuide {
  id: string;
  type: 'vertical' | 'horizontal';
  position: number;
  color: string;
  startPos: number;
  endPos: number;
  sourceElement: {
    left: number;
    right: number;
    top: number;
    bottom: number;
    centerX: number;
    centerY: number;
  };
  targetBounds?: {
    left: number;
    right: number;
    top: number;
    bottom: number;
    centerX: number;
    centerY: number;
  };
  snapType: 'canvas-edge' | 'canvas-center' | 'element-edge' | 'element-center';
  markerPositions: { x: number; y: number }[];
}

export interface SnapResult {
  x?: number;
  y?: number;
  guides: SnapGuide[];
}

export interface ResizeSnapResult {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  guides: SnapGuide[];
}

const SNAP_THRESHOLD = 8;

export const useSnapping = (
  elements: DesignElement[],
  canvasCenter: { x: number; y: number },
  zoom: number = 1,
  enabled: boolean = true,
  canvasSize?: { width: number; height: number }
) => {
  const [activeGuides, setActiveGuides] = useState<SnapGuide[]>([]);

  const getElementBounds = useCallback((element: DesignElement) => {
    return {
      left: element.x,
      right: element.x + element.width,
      top: element.y,
      bottom: element.y + element.height,
      centerX: element.x + element.width / 2,
      centerY: element.y + element.height / 2,
      width: element.width,
      height: element.height
    };
  }, []);

  const calculateGuideExtent = useCallback((
    type: 'vertical' | 'horizontal',
    position: number,
    sourceBounds: { left: number; right: number; top: number; bottom: number; centerX: number; centerY: number },
    targetBounds?: { left: number; right: number; top: number; bottom: number; centerX: number; centerY: number }
  ): { startPos: number; endPos: number; markers: { x: number; y: number }[] } => {
    const markers: { x: number; y: number }[] = [];

    if (type === 'vertical') {
      const minY = 0;
      const maxY = canvasSize?.height || 2160;

      markers.push({ x: position, y: sourceBounds.top });
      markers.push({ x: position, y: sourceBounds.bottom });
      if (targetBounds) {
        markers.push({ x: position, y: targetBounds.top });
        markers.push({ x: position, y: targetBounds.bottom });
      }

      return { startPos: minY, endPos: maxY, markers };
    } else {
      const minX = 0;
      const maxX = canvasSize?.width || 3840;

      markers.push({ x: sourceBounds.left, y: position });
      markers.push({ x: sourceBounds.right, y: position });
      if (targetBounds) {
        markers.push({ x: targetBounds.left, y: position });
        markers.push({ x: targetBounds.right, y: position });
      }

      return { startPos: minX, endPos: maxX, markers };
    }
  }, [canvasSize]);

  const detectSnaps = useCallback((
    movingElement: DesignElement,
    newX: number,
    newY: number,
    snapEnabled: boolean = enabled
  ): SnapResult => {
    if (!snapEnabled) {
      return { guides: [] };
    }

    const guides: SnapGuide[] = [];
    let snappedX = newX;
    let snappedY = newY;

    const movingBounds = {
      left: newX,
      right: newX + movingElement.width,
      top: newY,
      bottom: newY + movingElement.height,
      centerX: newX + movingElement.width / 2,
      centerY: newY + movingElement.height / 2,
      width: movingElement.width,
      height: movingElement.height
    };

    const threshold = SNAP_THRESHOLD / zoom;

    const createSourceBounds = (x: number, y: number) => ({
      left: x,
      right: x + movingElement.width,
      top: y,
      bottom: y + movingElement.height,
      centerX: x + movingElement.width / 2,
      centerY: y + movingElement.height / 2
    });

    if (canvasSize) {
      if (Math.abs(movingBounds.left) < threshold) {
        snappedX = 0;
        const sourceBounds = createSourceBounds(0, snappedY);
        const extent = calculateGuideExtent('vertical', 0, sourceBounds);
        guides.push({
          id: 'canvas-left',
          type: 'vertical',
          position: 0,
          color: '#FF8C00',
          startPos: extent.startPos,
          endPos: extent.endPos,
          sourceElement: sourceBounds,
          snapType: 'canvas-edge',
          markerPositions: extent.markers
        });
      } else if (Math.abs(movingBounds.right - canvasSize.width) < threshold) {
        snappedX = canvasSize.width - movingElement.width;
        const sourceBounds = createSourceBounds(snappedX, snappedY);
        const extent = calculateGuideExtent('vertical', canvasSize.width, sourceBounds);
        guides.push({
          id: 'canvas-right',
          type: 'vertical',
          position: canvasSize.width,
          color: '#FF8C00',
          startPos: extent.startPos,
          endPos: extent.endPos,
          sourceElement: sourceBounds,
          snapType: 'canvas-edge',
          markerPositions: extent.markers
        });
      }

      if (Math.abs(movingBounds.top) < threshold) {
        snappedY = 0;
        const sourceBounds = createSourceBounds(snappedX, 0);
        const extent = calculateGuideExtent('horizontal', 0, sourceBounds);
        guides.push({
          id: 'canvas-top',
          type: 'horizontal',
          position: 0,
          color: '#FF8C00',
          startPos: extent.startPos,
          endPos: extent.endPos,
          sourceElement: sourceBounds,
          snapType: 'canvas-edge',
          markerPositions: extent.markers
        });
      } else if (Math.abs(movingBounds.bottom - canvasSize.height) < threshold) {
        snappedY = canvasSize.height - movingElement.height;
        const sourceBounds = createSourceBounds(snappedX, snappedY);
        const extent = calculateGuideExtent('horizontal', canvasSize.height, sourceBounds);
        guides.push({
          id: 'canvas-bottom',
          type: 'horizontal',
          position: canvasSize.height,
          color: '#FF8C00',
          startPos: extent.startPos,
          endPos: extent.endPos,
          sourceElement: sourceBounds,
          snapType: 'canvas-edge',
          markerPositions: extent.markers
        });
      }
    }

    if (Math.abs(movingBounds.centerX - canvasCenter.x) < threshold) {
      snappedX = canvasCenter.x - movingElement.width / 2;
      const sourceBounds = createSourceBounds(snappedX, snappedY);
      const extent = calculateGuideExtent('vertical', canvasCenter.x, sourceBounds);
      guides.push({
        id: 'canvas-center-x',
        type: 'vertical',
        position: canvasCenter.x,
        color: '#FFD700',
        startPos: extent.startPos,
        endPos: extent.endPos,
        sourceElement: sourceBounds,
        snapType: 'canvas-center',
        markerPositions: extent.markers
      });
    }

    if (Math.abs(movingBounds.centerY - canvasCenter.y) < threshold) {
      snappedY = canvasCenter.y - movingElement.height / 2;
      const sourceBounds = createSourceBounds(snappedX, snappedY);
      const extent = calculateGuideExtent('horizontal', canvasCenter.y, sourceBounds);
      guides.push({
        id: 'canvas-center-y',
        type: 'horizontal',
        position: canvasCenter.y,
        color: '#FFD700',
        startPos: extent.startPos,
        endPos: extent.endPos,
        sourceElement: sourceBounds,
        snapType: 'canvas-center',
        markerPositions: extent.markers
      });
    }

    const otherElements = elements.filter(el => el.id !== movingElement.id && el.visible);

    otherElements.forEach((element, index) => {
      const bounds = getElementBounds(element);

      const currentMovingBounds = {
        left: snappedX,
        right: snappedX + movingElement.width,
        top: snappedY,
        bottom: snappedY + movingElement.height,
        centerX: snappedX + movingElement.width / 2,
        centerY: snappedY + movingElement.height / 2
      };

      if (Math.abs(currentMovingBounds.top - bounds.top) < threshold) {
        snappedY = bounds.top;
        const sourceBounds = createSourceBounds(snappedX, snappedY);
        const extent = calculateGuideExtent('horizontal', bounds.top, sourceBounds, bounds);
        guides.push({
          id: `element-${index}-top`,
          type: 'horizontal',
          position: bounds.top,
          color: '#FF8C00',
          startPos: extent.startPos,
          endPos: extent.endPos,
          sourceElement: sourceBounds,
          targetBounds: bounds,
          snapType: 'element-edge',
          markerPositions: extent.markers
        });
      } else if (Math.abs(currentMovingBounds.bottom - bounds.bottom) < threshold) {
        snappedY = bounds.bottom - movingElement.height;
        const sourceBounds = createSourceBounds(snappedX, snappedY);
        const extent = calculateGuideExtent('horizontal', bounds.bottom, sourceBounds, bounds);
        guides.push({
          id: `element-${index}-bottom`,
          type: 'horizontal',
          position: bounds.bottom,
          color: '#FF8C00',
          startPos: extent.startPos,
          endPos: extent.endPos,
          sourceElement: sourceBounds,
          targetBounds: bounds,
          snapType: 'element-edge',
          markerPositions: extent.markers
        });
      } else if (Math.abs(currentMovingBounds.top - bounds.bottom) < threshold) {
        snappedY = bounds.bottom;
        const sourceBounds = createSourceBounds(snappedX, snappedY);
        const extent = calculateGuideExtent('horizontal', bounds.bottom, sourceBounds, bounds);
        guides.push({
          id: `element-${index}-stack-bottom`,
          type: 'horizontal',
          position: bounds.bottom,
          color: '#FF8C00',
          startPos: extent.startPos,
          endPos: extent.endPos,
          sourceElement: sourceBounds,
          targetBounds: bounds,
          snapType: 'element-edge',
          markerPositions: extent.markers
        });
      } else if (Math.abs(currentMovingBounds.bottom - bounds.top) < threshold) {
        snappedY = bounds.top - movingElement.height;
        const sourceBounds = createSourceBounds(snappedX, snappedY);
        const extent = calculateGuideExtent('horizontal', bounds.top, sourceBounds, bounds);
        guides.push({
          id: `element-${index}-stack-top`,
          type: 'horizontal',
          position: bounds.top,
          color: '#FF8C00',
          startPos: extent.startPos,
          endPos: extent.endPos,
          sourceElement: sourceBounds,
          targetBounds: bounds,
          snapType: 'element-edge',
          markerPositions: extent.markers
        });
      } else if (Math.abs(currentMovingBounds.centerY - bounds.centerY) < threshold) {
        snappedY = bounds.centerY - movingElement.height / 2;
        const sourceBounds = createSourceBounds(snappedX, snappedY);
        const extent = calculateGuideExtent('horizontal', bounds.centerY, sourceBounds, bounds);
        guides.push({
          id: `element-${index}-center-y`,
          type: 'horizontal',
          position: bounds.centerY,
          color: '#FFD700',
          startPos: extent.startPos,
          endPos: extent.endPos,
          sourceElement: sourceBounds,
          targetBounds: bounds,
          snapType: 'element-center',
          markerPositions: extent.markers
        });
      }

      if (Math.abs(currentMovingBounds.left - bounds.left) < threshold) {
        snappedX = bounds.left;
        const sourceBounds = createSourceBounds(snappedX, snappedY);
        const extent = calculateGuideExtent('vertical', bounds.left, sourceBounds, bounds);
        guides.push({
          id: `element-${index}-left`,
          type: 'vertical',
          position: bounds.left,
          color: '#FF8C00',
          startPos: extent.startPos,
          endPos: extent.endPos,
          sourceElement: sourceBounds,
          targetBounds: bounds,
          snapType: 'element-edge',
          markerPositions: extent.markers
        });
      } else if (Math.abs(currentMovingBounds.right - bounds.right) < threshold) {
        snappedX = bounds.right - movingElement.width;
        const sourceBounds = createSourceBounds(snappedX, snappedY);
        const extent = calculateGuideExtent('vertical', bounds.right, sourceBounds, bounds);
        guides.push({
          id: `element-${index}-right`,
          type: 'vertical',
          position: bounds.right,
          color: '#FF8C00',
          startPos: extent.startPos,
          endPos: extent.endPos,
          sourceElement: sourceBounds,
          targetBounds: bounds,
          snapType: 'element-edge',
          markerPositions: extent.markers
        });
      } else if (Math.abs(currentMovingBounds.left - bounds.right) < threshold) {
        snappedX = bounds.right;
        const sourceBounds = createSourceBounds(snappedX, snappedY);
        const extent = calculateGuideExtent('vertical', bounds.right, sourceBounds, bounds);
        guides.push({
          id: `element-${index}-side-right`,
          type: 'vertical',
          position: bounds.right,
          color: '#FF8C00',
          startPos: extent.startPos,
          endPos: extent.endPos,
          sourceElement: sourceBounds,
          targetBounds: bounds,
          snapType: 'element-edge',
          markerPositions: extent.markers
        });
      } else if (Math.abs(currentMovingBounds.right - bounds.left) < threshold) {
        snappedX = bounds.left - movingElement.width;
        const sourceBounds = createSourceBounds(snappedX, snappedY);
        const extent = calculateGuideExtent('vertical', bounds.left, sourceBounds, bounds);
        guides.push({
          id: `element-${index}-side-left`,
          type: 'vertical',
          position: bounds.left,
          color: '#FF8C00',
          startPos: extent.startPos,
          endPos: extent.endPos,
          sourceElement: sourceBounds,
          targetBounds: bounds,
          snapType: 'element-edge',
          markerPositions: extent.markers
        });
      } else if (Math.abs(currentMovingBounds.centerX - bounds.centerX) < threshold) {
        snappedX = bounds.centerX - movingElement.width / 2;
        const sourceBounds = createSourceBounds(snappedX, snappedY);
        const extent = calculateGuideExtent('vertical', bounds.centerX, sourceBounds, bounds);
        guides.push({
          id: `element-${index}-center-x`,
          type: 'vertical',
          position: bounds.centerX,
          color: '#FFD700',
          startPos: extent.startPos,
          endPos: extent.endPos,
          sourceElement: sourceBounds,
          targetBounds: bounds,
          snapType: 'element-center',
          markerPositions: extent.markers
        });
      }
    });

    return {
      x: snappedX !== newX ? snappedX : undefined,
      y: snappedY !== newY ? snappedY : undefined,
      guides
    };
  }, [elements, canvasCenter, zoom, getElementBounds, enabled, calculateGuideExtent]);

  const detectResizeSnaps = useCallback((
    element: DesignElement,
    handle: string,
    newX: number,
    newY: number,
    newWidth: number,
    newHeight: number,
    snapEnabled: boolean = enabled
  ): ResizeSnapResult => {
    if (!snapEnabled) {
      return { guides: [] };
    }

    const threshold = SNAP_THRESHOLD / zoom;
    const guides: SnapGuide[] = [];

    let rx = newX;
    let ry = newY;
    let rw = newWidth;
    let rh = newHeight;

    const movesLeft = handle === 'nw' || handle === 'sw' || handle === 'w';
    const movesRight = handle === 'ne' || handle === 'se' || handle === 'e';
    const movesTop = handle === 'nw' || handle === 'ne' || handle === 'n';
    const movesBottom = handle === 'sw' || handle === 'se' || handle === 's';

    const snapTargets: Array<{ value: number; type: 'vertical' | 'horizontal'; id: string; snapType: SnapGuide['snapType']; color: string; targetBounds?: SnapGuide['targetBounds'] }> = [];

    if (canvasSize) {
      if (movesLeft) {
        snapTargets.push({ value: 0, type: 'vertical', id: 'canvas-left', snapType: 'canvas-edge', color: '#FF8C00' });
        snapTargets.push({ value: canvasSize.width / 2, type: 'vertical', id: 'canvas-center-x-left', snapType: 'canvas-center', color: '#FFD700' });
      }
      if (movesRight) {
        snapTargets.push({ value: canvasSize.width, type: 'vertical', id: 'canvas-right', snapType: 'canvas-edge', color: '#FF8C00' });
        snapTargets.push({ value: canvasSize.width / 2, type: 'vertical', id: 'canvas-center-x-right', snapType: 'canvas-center', color: '#FFD700' });
      }
      if (movesTop) {
        snapTargets.push({ value: 0, type: 'horizontal', id: 'canvas-top', snapType: 'canvas-edge', color: '#FF8C00' });
        snapTargets.push({ value: canvasSize.height / 2, type: 'horizontal', id: 'canvas-center-y-top', snapType: 'canvas-center', color: '#FFD700' });
      }
      if (movesBottom) {
        snapTargets.push({ value: canvasSize.height, type: 'horizontal', id: 'canvas-bottom', snapType: 'canvas-edge', color: '#FF8C00' });
        snapTargets.push({ value: canvasSize.height / 2, type: 'horizontal', id: 'canvas-center-y-bottom', snapType: 'canvas-center', color: '#FFD700' });
      }
    }

    const otherElements = elements.filter(el => el.id !== element.id && el.visible);
    otherElements.forEach((other, idx) => {
      const b = getElementBounds(other);
      if (movesLeft) {
        snapTargets.push({ value: b.left, type: 'vertical', id: `el-${idx}-left-L`, snapType: 'element-edge', color: '#FF8C00', targetBounds: b });
        snapTargets.push({ value: b.right, type: 'vertical', id: `el-${idx}-right-L`, snapType: 'element-edge', color: '#FF8C00', targetBounds: b });
        snapTargets.push({ value: b.centerX, type: 'vertical', id: `el-${idx}-cx-L`, snapType: 'element-center', color: '#FFD700', targetBounds: b });
      }
      if (movesRight) {
        snapTargets.push({ value: b.left, type: 'vertical', id: `el-${idx}-left-R`, snapType: 'element-edge', color: '#FF8C00', targetBounds: b });
        snapTargets.push({ value: b.right, type: 'vertical', id: `el-${idx}-right-R`, snapType: 'element-edge', color: '#FF8C00', targetBounds: b });
        snapTargets.push({ value: b.centerX, type: 'vertical', id: `el-${idx}-cx-R`, snapType: 'element-center', color: '#FFD700', targetBounds: b });
      }
      if (movesTop) {
        snapTargets.push({ value: b.top, type: 'horizontal', id: `el-${idx}-top-T`, snapType: 'element-edge', color: '#FF8C00', targetBounds: b });
        snapTargets.push({ value: b.bottom, type: 'horizontal', id: `el-${idx}-bottom-T`, snapType: 'element-edge', color: '#FF8C00', targetBounds: b });
        snapTargets.push({ value: b.centerY, type: 'horizontal', id: `el-${idx}-cy-T`, snapType: 'element-center', color: '#FFD700', targetBounds: b });
      }
      if (movesBottom) {
        snapTargets.push({ value: b.top, type: 'horizontal', id: `el-${idx}-top-B`, snapType: 'element-edge', color: '#FF8C00', targetBounds: b });
        snapTargets.push({ value: b.bottom, type: 'horizontal', id: `el-${idx}-bottom-B`, snapType: 'element-edge', color: '#FF8C00', targetBounds: b });
        snapTargets.push({ value: b.centerY, type: 'horizontal', id: `el-${idx}-cy-B`, snapType: 'element-center', color: '#FFD700', targetBounds: b });
      }
    });

    let snappedLeft: number | null = null;
    let snappedRight: number | null = null;
    let snappedTop: number | null = null;
    let snappedBottom: number | null = null;

    const currentRight = rx + rw;
    const currentBottom = ry + rh;

    for (const t of snapTargets) {
      if (t.type === 'vertical') {
        if (movesLeft && snappedLeft === null && Math.abs(rx - t.value) < threshold) {
          snappedLeft = t.value;
          const snappedBounds = { left: snappedLeft, right: currentRight, top: ry, bottom: currentBottom, centerX: (snappedLeft + currentRight) / 2, centerY: ry + rh / 2 };
          const extent = calculateGuideExtent('vertical', t.value, snappedBounds, t.targetBounds);
          guides.push({ id: t.id, type: 'vertical', position: t.value, color: t.color, startPos: extent.startPos, endPos: extent.endPos, sourceElement: snappedBounds, targetBounds: t.targetBounds, snapType: t.snapType, markerPositions: extent.markers });
        }
        if (movesRight && snappedRight === null && Math.abs(currentRight - t.value) < threshold) {
          snappedRight = t.value;
          const snappedBounds = { left: rx, right: snappedRight, top: ry, bottom: currentBottom, centerX: (rx + snappedRight) / 2, centerY: ry + rh / 2 };
          const extent = calculateGuideExtent('vertical', t.value, snappedBounds, t.targetBounds);
          guides.push({ id: t.id, type: 'vertical', position: t.value, color: t.color, startPos: extent.startPos, endPos: extent.endPos, sourceElement: snappedBounds, targetBounds: t.targetBounds, snapType: t.snapType, markerPositions: extent.markers });
        }
      } else {
        if (movesTop && snappedTop === null && Math.abs(ry - t.value) < threshold) {
          snappedTop = t.value;
          const snappedBounds = { left: rx, right: currentRight, top: snappedTop, bottom: currentBottom, centerX: rx + rw / 2, centerY: (snappedTop + currentBottom) / 2 };
          const extent = calculateGuideExtent('horizontal', t.value, snappedBounds, t.targetBounds);
          guides.push({ id: t.id, type: 'horizontal', position: t.value, color: t.color, startPos: extent.startPos, endPos: extent.endPos, sourceElement: snappedBounds, targetBounds: t.targetBounds, snapType: t.snapType, markerPositions: extent.markers });
        }
        if (movesBottom && snappedBottom === null && Math.abs(currentBottom - t.value) < threshold) {
          snappedBottom = t.value;
          const snappedBounds = { left: rx, right: currentRight, top: ry, bottom: snappedBottom, centerX: rx + rw / 2, centerY: (ry + snappedBottom) / 2 };
          const extent = calculateGuideExtent('horizontal', t.value, snappedBounds, t.targetBounds);
          guides.push({ id: t.id, type: 'horizontal', position: t.value, color: t.color, startPos: extent.startPos, endPos: extent.endPos, sourceElement: snappedBounds, targetBounds: t.targetBounds, snapType: t.snapType, markerPositions: extent.markers });
        }
      }
    }

    const result: ResizeSnapResult = { guides };

    if (snappedLeft !== null) {
      result.x = snappedLeft;
      result.width = currentRight - snappedLeft;
    }
    if (snappedRight !== null) {
      result.width = snappedRight - (result.x ?? rx);
    }
    if (snappedTop !== null) {
      result.y = snappedTop;
      result.height = currentBottom - snappedTop;
    }
    if (snappedBottom !== null) {
      result.height = snappedBottom - (result.y ?? ry);
    }

    return result;
  }, [elements, zoom, enabled, canvasSize, getElementBounds, calculateGuideExtent]);

  const showGuides = useCallback((guides: SnapGuide[]) => {
    setActiveGuides(guides);
  }, []);

  const hideGuides = useCallback(() => {
    setActiveGuides([]);
  }, []);

  return {
    detectSnaps,
    detectResizeSnaps,
    showGuides,
    hideGuides,
    activeGuides
  };
};