import type { Layer, Vec2 } from './types';
import { evaluateProperty } from './interpolation';

export interface LayerBounds {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type AlignAxis = 'left' | 'centerH' | 'right' | 'top' | 'centerV' | 'bottom';

function getLayerSize(layer: Layer, frame: number): { w: number; h: number } | null {
  if (layer.type === 'group' || layer.type === 'audio') return null;
  if (layer.type === 'video') {
    const vl = layer as any;
    return { w: vl.video.sourceWidth, h: vl.video.sourceHeight };
  }
  if (layer.type === 'image') {
    const il = layer as any;
    return { w: il.image.sourceWidth, h: il.image.sourceHeight };
  }
  if (layer.type === 'shape') {
    const sl = layer as any;
    if (!sl.shape) return null;
    const shape = sl.shape;
    switch (shape.type) {
      case 'rectangle': {
        const wVal = typeof shape.width === 'object' && shape.width.defaultValue != null
          ? evaluateProperty(shape.width, frame) as number : 100;
        const hVal = typeof shape.height === 'object' && shape.height.defaultValue != null
          ? evaluateProperty(shape.height, frame) as number : 100;
        return { w: wVal, h: hVal };
      }
      case 'circle': {
        const r = typeof shape.radius === 'object' && shape.radius.defaultValue != null
          ? evaluateProperty(shape.radius, frame) as number : 50;
        return { w: r * 2, h: r * 2 };
      }
      case 'star': {
        const or = typeof shape.outerRadius === 'object' && shape.outerRadius.defaultValue != null
          ? evaluateProperty(shape.outerRadius, frame) as number : 50;
        return { w: or * 2, h: or * 2 };
      }
      case 'polygon': {
        const pr = typeof shape.radius === 'object' && shape.radius.defaultValue != null
          ? evaluateProperty(shape.radius, frame) as number : 50;
        return { w: pr * 2, h: pr * 2 };
      }
      default:
        return { w: 100, h: 100 };
    }
  }
  if (layer.type === 'text') {
    return { w: 200, h: 40 };
  }
  if (layer.type === 'hbox' || layer.type === 'vbox' || layer.type === 'grid') {
    const ll = layer as any;
    const lp = ll.layoutParams;
    return {
      w: lp.width?.type === 'fixed' ? lp.width.value : 200,
      h: lp.height?.type === 'fixed' ? lp.height.value : 200,
    };
  }
  if (layer.type === 'layoutContainer') {
    const lc = layer as any;
    return { w: lc.containerShape?.width || 200, h: lc.containerShape?.height || 200 };
  }
  return { w: 100, h: 100 };
}

export function getLayerBounds(layer: Layer, frame: number): LayerBounds | null {
  const size = getLayerSize(layer, frame);
  if (!size) return null;
  const pos = evaluateProperty(layer.transform.position, frame) as Vec2;
  return { id: layer.id, x: pos[0], y: pos[1], w: size.w, h: size.h };
}

export function getSelectionBounds(bounds: LayerBounds[]): { minX: number; maxX: number; minY: number; maxY: number; centerX: number; centerY: number } {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const b of bounds) {
    const left = b.x - b.w / 2;
    const right = b.x + b.w / 2;
    const top = b.y - b.h / 2;
    const bottom = b.y + b.h / 2;
    if (left < minX) minX = left;
    if (right > maxX) maxX = right;
    if (top < minY) minY = top;
    if (bottom > maxY) maxY = bottom;
  }
  return { minX, maxX, minY, maxY, centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2 };
}

export interface AlignResult {
  layerId: string;
  newPosition: Vec2;
}

export function computeAlignment(axis: AlignAxis, layers: Layer[], frame: number): AlignResult[] {
  const allBounds: LayerBounds[] = [];
  for (const layer of layers) {
    const b = getLayerBounds(layer, frame);
    if (b) allBounds.push(b);
  }
  if (allBounds.length < 2) return [];

  const sel = getSelectionBounds(allBounds);
  const results: AlignResult[] = [];

  for (const b of allBounds) {
    let newX = b.x;
    let newY = b.y;

    switch (axis) {
      case 'left':
        newX = sel.minX + b.w / 2;
        break;
      case 'centerH':
        newX = sel.centerX;
        break;
      case 'right':
        newX = sel.maxX - b.w / 2;
        break;
      case 'top':
        newY = sel.minY + b.h / 2;
        break;
      case 'centerV':
        newY = sel.centerY;
        break;
      case 'bottom':
        newY = sel.maxY - b.h / 2;
        break;
    }

    if (newX !== b.x || newY !== b.y) {
      results.push({ layerId: b.id, newPosition: [newX, newY] });
    }
  }

  return results;
}

export type DistributeMode = 'horizontalBounds' | 'verticalBounds' | 'horizontalCenters' | 'verticalCenters';

export function computeDistribution(mode: DistributeMode, layers: Layer[], frame: number): AlignResult[] {
  const allBounds: LayerBounds[] = [];
  for (const layer of layers) {
    const b = getLayerBounds(layer, frame);
    if (b) allBounds.push(b);
  }
  if (allBounds.length < 3) return [];

  const isHorizontal = mode === 'horizontalBounds' || mode === 'horizontalCenters';
  const useCenters = mode === 'horizontalCenters' || mode === 'verticalCenters';

  const sorted = [...allBounds].sort((a, b) =>
    isHorizontal ? a.x - b.x : a.y - b.y
  );

  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  const results: AlignResult[] = [];

  if (useCenters) {
    const startPos = isHorizontal ? first.x : first.y;
    const endPos = isHorizontal ? last.x : last.y;
    const step = (endPos - startPos) / (sorted.length - 1);

    for (let i = 1; i < sorted.length - 1; i++) {
      const b = sorted[i];
      const targetPos = startPos + step * i;
      const newX = isHorizontal ? targetPos : b.x;
      const newY = isHorizontal ? b.y : targetPos;
      if (newX !== b.x || newY !== b.y) {
        results.push({ layerId: b.id, newPosition: [newX, newY] });
      }
    }
  } else {
    const totalSize = sorted.reduce((sum, b) => sum + (isHorizontal ? b.w : b.h), 0);
    const firstEdge = isHorizontal ? first.x - first.w / 2 : first.y - first.h / 2;
    const lastEdge = isHorizontal ? last.x + last.w / 2 : last.y + last.h / 2;
    const totalSpan = lastEdge - firstEdge;
    const totalGap = totalSpan - totalSize;
    const gapSize = totalGap / (sorted.length - 1);

    let cursor = firstEdge + (isHorizontal ? first.w : first.h) + gapSize;

    for (let i = 1; i < sorted.length - 1; i++) {
      const b = sorted[i];
      const size = isHorizontal ? b.w : b.h;
      const targetCenter = cursor + size / 2;
      const newX = isHorizontal ? targetCenter : b.x;
      const newY = isHorizontal ? b.y : targetCenter;
      if (newX !== b.x || newY !== b.y) {
        results.push({ layerId: b.id, newPosition: [newX, newY] });
      }
      cursor += size + gapSize;
    }
  }

  return results;
}

// --- Size utilities ---

export type SizeMode = 'equalWidth' | 'equalHeight' | 'equalSize';

export interface SizeResult {
  layerId: string;
  changes: Partial<{ width: number; height: number; radius: number; outerRadius: number }>;
}

export function computeEqualSize(mode: SizeMode, layers: Layer[], frame: number): SizeResult[] {
  const sizes: { id: string; w: number; h: number }[] = [];
  for (const layer of layers) {
    const s = getLayerSize(layer, frame);
    if (s) sizes.push({ id: layer.id, w: s.w, h: s.h });
  }
  if (sizes.length < 2) return [];

  const maxW = Math.max(...sizes.map((s) => s.w));
  const maxH = Math.max(...sizes.map((s) => s.h));

  const results: SizeResult[] = [];

  for (const layer of layers) {
    if (layer.type === 'group' || layer.type === 'audio') continue;
    const current = sizes.find((s) => s.id === layer.id);
    if (!current) continue;

    const targetW = (mode === 'equalWidth' || mode === 'equalSize') ? maxW : current.w;
    const targetH = (mode === 'equalHeight' || mode === 'equalSize') ? maxH : current.h;

    if (targetW === current.w && targetH === current.h) continue;

    if (layer.type === 'shape') {
      const sl = layer as any;
      const shape = sl.shape;
      if (!shape) continue;
      switch (shape.type) {
        case 'rectangle':
          results.push({ layerId: layer.id, changes: { width: targetW, height: targetH } });
          break;
        case 'circle':
          results.push({ layerId: layer.id, changes: { radius: Math.max(targetW, targetH) / 2 } });
          break;
        case 'star':
          results.push({ layerId: layer.id, changes: { outerRadius: Math.max(targetW, targetH) / 2 } });
          break;
        case 'polygon':
          results.push({ layerId: layer.id, changes: { radius: Math.max(targetW, targetH) / 2 } });
          break;
      }
    } else if (layer.type === 'layoutContainer') {
      results.push({ layerId: layer.id, changes: { width: targetW, height: targetH } });
    } else if (layer.type === 'hbox' || layer.type === 'vbox' || layer.type === 'grid') {
      results.push({ layerId: layer.id, changes: { width: targetW, height: targetH } });
    }
  }

  return results;
}

// --- Transform utilities ---

export type TransformMode = 'equalScale' | 'equalRotation' | 'normalizeScale' | 'normalizeRotation' | 'normalizeTransform';

export interface TransformResult {
  layerId: string;
  newScale?: Vec2;
  newRotation?: number;
  sizeChanges?: Partial<{ width: number; height: number; radius: number; outerRadius: number }>;
}

export function computeTransformOp(mode: TransformMode, layers: Layer[], frame: number): TransformResult[] {
  if (layers.length < 2 && mode !== 'normalizeScale' && mode !== 'normalizeRotation' && mode !== 'normalizeTransform') return [];

  const results: TransformResult[] = [];

  if (mode === 'equalScale') {
    let maxSx = -Infinity, maxSy = -Infinity;
    for (const layer of layers) {
      if (layer.type === 'group' || layer.type === 'audio') continue;
      const s = evaluateProperty(layer.transform.scale, frame) as Vec2;
      if (s[0] > maxSx) maxSx = s[0];
      if (s[1] > maxSy) maxSy = s[1];
    }
    for (const layer of layers) {
      if (layer.type === 'group' || layer.type === 'audio') continue;
      const s = evaluateProperty(layer.transform.scale, frame) as Vec2;
      if (s[0] !== maxSx || s[1] !== maxSy) {
        results.push({ layerId: layer.id, newScale: [maxSx, maxSy] });
      }
    }
  } else if (mode === 'equalRotation') {
    let maxRot = -Infinity;
    for (const layer of layers) {
      if (layer.type === 'group' || layer.type === 'audio') continue;
      const r = evaluateProperty(layer.transform.rotation, frame) as number;
      if (r > maxRot) maxRot = r;
    }
    for (const layer of layers) {
      if (layer.type === 'group' || layer.type === 'audio') continue;
      const r = evaluateProperty(layer.transform.rotation, frame) as number;
      if (r !== maxRot) {
        results.push({ layerId: layer.id, newRotation: maxRot });
      }
    }
  } else if (mode === 'normalizeScale') {
    for (const layer of layers) {
      if (layer.type === 'group' || layer.type === 'audio') continue;
      const s = evaluateProperty(layer.transform.scale, frame) as Vec2;
      if (s[0] === 1 && s[1] === 1) continue;
      const size = getLayerSize(layer, frame);
      if (!size) continue;
      const newW = size.w * s[0];
      const newH = size.h * s[1];
      const sizeChanges = computeSizeChangesForLayer(layer, newW, newH);
      if (sizeChanges) {
        results.push({ layerId: layer.id, newScale: [1, 1], sizeChanges });
      }
    }
  } else if (mode === 'normalizeRotation') {
    for (const layer of layers) {
      if (layer.type === 'group' || layer.type === 'audio') continue;
      const r = evaluateProperty(layer.transform.rotation, frame) as number;
      if (r === 0) continue;
      results.push({ layerId: layer.id, newRotation: 0 });
    }
  } else if (mode === 'normalizeTransform') {
    for (const layer of layers) {
      if (layer.type === 'group' || layer.type === 'audio') continue;
      const s = evaluateProperty(layer.transform.scale, frame) as Vec2;
      const r = evaluateProperty(layer.transform.rotation, frame) as number;
      if (s[0] === 1 && s[1] === 1 && r === 0) continue;
      const size = getLayerSize(layer, frame);
      const sizeChanges = (s[0] !== 1 || s[1] !== 1) && size
        ? computeSizeChangesForLayer(layer, size.w * s[0], size.h * s[1])
        : undefined;
      results.push({
        layerId: layer.id,
        newScale: (s[0] !== 1 || s[1] !== 1) ? [1, 1] : undefined,
        newRotation: r !== 0 ? 0 : undefined,
        sizeChanges: sizeChanges || undefined,
      });
    }
  }

  return results;
}

function computeSizeChangesForLayer(layer: Layer, newW: number, newH: number): Partial<{ width: number; height: number; radius: number; outerRadius: number }> | null {
  if (layer.type === 'shape') {
    const sl = layer as any;
    const shape = sl.shape;
    if (!shape) return null;
    switch (shape.type) {
      case 'rectangle':
        return { width: newW, height: newH };
      case 'circle':
        return { radius: Math.max(newW, newH) / 2 };
      case 'star':
        return { outerRadius: Math.max(newW, newH) / 2 };
      case 'polygon':
        return { radius: Math.max(newW, newH) / 2 };
    }
  }
  if (layer.type === 'layoutContainer') return { width: newW, height: newH };
  if (layer.type === 'hbox' || layer.type === 'vbox' || layer.type === 'grid') return { width: newW, height: newH };
  return null;
}

// --- Spacing utilities ---

export function computeSpacing(axis: 'horizontal' | 'vertical', spacing: number, layers: Layer[], frame: number): AlignResult[] {
  const allBounds: LayerBounds[] = [];
  for (const layer of layers) {
    const b = getLayerBounds(layer, frame);
    if (b) allBounds.push(b);
  }
  if (allBounds.length < 2) return [];

  const isH = axis === 'horizontal';
  const sorted = [...allBounds].sort((a, b) => isH ? a.x - b.x : a.y - b.y);

  const results: AlignResult[] = [];
  let cursor = isH
    ? sorted[0].x + sorted[0].w / 2
    : sorted[0].y + sorted[0].h / 2;

  for (let i = 1; i < sorted.length; i++) {
    const b = sorted[i];
    const size = isH ? b.w : b.h;
    cursor += spacing + size / 2;
    const newX = isH ? cursor : b.x;
    const newY = isH ? b.y : cursor;
    if (newX !== b.x || newY !== b.y) {
      results.push({ layerId: b.id, newPosition: [newX, newY] });
    }
    cursor += size / 2;
  }

  return results;
}

// --- Arrange utilities ---

export function computeStackHorizontal(spacing: number, layers: Layer[], frame: number): AlignResult[] {
  const allBounds: LayerBounds[] = [];
  for (const layer of layers) {
    const b = getLayerBounds(layer, frame);
    if (b) allBounds.push(b);
  }
  if (allBounds.length < 2) return [];

  const sorted = [...allBounds].sort((a, b) => a.x - b.x);
  const sel = getSelectionBounds(sorted);

  let totalWidth = 0;
  for (const b of sorted) totalWidth += b.w;
  totalWidth += spacing * (sorted.length - 1);

  let cursor = sel.centerX - totalWidth / 2;
  const results: AlignResult[] = [];

  for (const b of sorted) {
    const newX = cursor + b.w / 2;
    if (newX !== b.x || sel.centerY !== b.y) {
      results.push({ layerId: b.id, newPosition: [newX, sel.centerY] });
    }
    cursor += b.w + spacing;
  }

  return results;
}

export function computeStackVertical(spacing: number, layers: Layer[], frame: number): AlignResult[] {
  const allBounds: LayerBounds[] = [];
  for (const layer of layers) {
    const b = getLayerBounds(layer, frame);
    if (b) allBounds.push(b);
  }
  if (allBounds.length < 2) return [];

  const sorted = [...allBounds].sort((a, b) => a.y - b.y);
  const sel = getSelectionBounds(sorted);

  let totalHeight = 0;
  for (const b of sorted) totalHeight += b.h;
  totalHeight += spacing * (sorted.length - 1);

  let cursor = sel.centerY - totalHeight / 2;
  const results: AlignResult[] = [];

  for (const b of sorted) {
    const newY = cursor + b.h / 2;
    if (sel.centerX !== b.x || newY !== b.y) {
      results.push({ layerId: b.id, newPosition: [sel.centerX, newY] });
    }
    cursor += b.h + spacing;
  }

  return results;
}

export function computeCircularArrange(layers: Layer[], frame: number): AlignResult[] {
  const allBounds: LayerBounds[] = [];
  for (const layer of layers) {
    const b = getLayerBounds(layer, frame);
    if (b) allBounds.push(b);
  }
  if (allBounds.length < 2) return [];

  const sel = getSelectionBounds(allBounds);
  const cx = sel.centerX;
  const cy = sel.centerY;
  const radius = Math.max((sel.maxX - sel.minX) / 2, (sel.maxY - sel.minY) / 2, 50);

  const sorted = [...allBounds].sort((a, b) => {
    const angA = Math.atan2(a.y - cy, a.x - cx);
    const angB = Math.atan2(b.y - cy, b.x - cx);
    return angA - angB;
  });

  const results: AlignResult[] = [];
  const step = (Math.PI * 2) / sorted.length;

  for (let i = 0; i < sorted.length; i++) {
    const angle = -Math.PI / 2 + step * i;
    const newX = cx + Math.cos(angle) * radius;
    const newY = cy + Math.sin(angle) * radius;
    const b = sorted[i];
    if (Math.abs(newX - b.x) > 0.01 || Math.abs(newY - b.y) > 0.01) {
      results.push({ layerId: b.id, newPosition: [newX, newY] });
    }
  }

  return results;
}

export interface RandomizeOptions {
  positionRange: number;
  rotationRange: number;
  scaleRange: number;
  seed: number;
}

export interface RandomizeResult {
  layerId: string;
  newPosition?: Vec2;
  newScale?: Vec2;
  newRotation?: number;
}

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xFFFFFFFF;
    return (s >>> 0) / 4294967296;
  };
}

export function computeRandomize(options: RandomizeOptions, layers: Layer[], frame: number): RandomizeResult[] {
  const rand = seededRandom(options.seed);
  const results: RandomizeResult[] = [];

  for (const layer of layers) {
    if (layer.type === 'group' || layer.type === 'audio') continue;
    const pos = evaluateProperty(layer.transform.position, frame) as Vec2;
    const scale = evaluateProperty(layer.transform.scale, frame) as Vec2;
    const rot = evaluateProperty(layer.transform.rotation, frame) as number;

    const result: RandomizeResult = { layerId: layer.id };
    let changed = false;

    if (options.positionRange > 0) {
      const dx = (rand() - 0.5) * 2 * options.positionRange;
      const dy = (rand() - 0.5) * 2 * options.positionRange;
      result.newPosition = [pos[0] + dx, pos[1] + dy];
      changed = true;
    }

    if (options.rotationRange > 0) {
      const dr = (rand() - 0.5) * 2 * options.rotationRange;
      result.newRotation = rot + dr;
      changed = true;
    }

    if (options.scaleRange > 0) {
      const ds = 1 + (rand() - 0.5) * 2 * options.scaleRange;
      result.newScale = [scale[0] * ds, scale[1] * ds];
      changed = true;
    }

    if (changed) results.push(result);
  }

  return results;
}

// --- Canvas utilities ---

export function computeCenterToCanvas(layers: Layer[], frame: number, canvasW: number, canvasH: number): AlignResult[] {
  const allBounds: LayerBounds[] = [];
  for (const layer of layers) {
    const b = getLayerBounds(layer, frame);
    if (b) allBounds.push(b);
  }
  if (allBounds.length === 0) return [];

  const sel = getSelectionBounds(allBounds);
  const canvasCx = canvasW / 2;
  const canvasCy = canvasH / 2;
  const dx = canvasCx - sel.centerX;
  const dy = canvasCy - sel.centerY;

  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return [];

  const results: AlignResult[] = [];
  for (const b of allBounds) {
    results.push({ layerId: b.id, newPosition: [b.x + dx, b.y + dy] });
  }
  return results;
}

export interface FitCanvasResult {
  layerId: string;
  newPosition: Vec2;
  newScale: Vec2;
}

export function computeFitToCanvas(layers: Layer[], frame: number, canvasW: number, canvasH: number): FitCanvasResult[] {
  const allBounds: LayerBounds[] = [];
  for (const layer of layers) {
    const b = getLayerBounds(layer, frame);
    if (b) allBounds.push(b);
  }
  if (allBounds.length === 0) return [];

  const sel = getSelectionBounds(allBounds);
  const selW = sel.maxX - sel.minX;
  const selH = sel.maxY - sel.minY;
  if (selW === 0 || selH === 0) return [];

  const scaleX = canvasW / selW;
  const scaleY = canvasH / selH;
  const scaleFactor = Math.min(scaleX, scaleY);

  if (Math.abs(scaleFactor - 1) < 0.001) return [];

  const canvasCx = canvasW / 2;
  const canvasCy = canvasH / 2;

  const results: FitCanvasResult[] = [];
  for (const b of allBounds) {
    const relX = b.x - sel.centerX;
    const relY = b.y - sel.centerY;
    const newX = canvasCx + relX * scaleFactor;
    const newY = canvasCy + relY * scaleFactor;
    const currentScale = layers.find((l) => l.id === b.id);
    if (!currentScale) continue;
    const s = evaluateProperty(currentScale.transform.scale, frame) as Vec2;
    results.push({
      layerId: b.id,
      newPosition: [newX, newY],
      newScale: [s[0] * scaleFactor, s[1] * scaleFactor],
    });
  }

  return results;
}

export function computePixelSnap(layers: Layer[], frame: number): AlignResult[] {
  const results: AlignResult[] = [];
  for (const layer of layers) {
    if (layer.type === 'group' || layer.type === 'audio') continue;
    const pos = evaluateProperty(layer.transform.position, frame) as Vec2;
    const snappedX = Math.round(pos[0]);
    const snappedY = Math.round(pos[1]);
    if (snappedX !== pos[0] || snappedY !== pos[1]) {
      results.push({ layerId: layer.id, newPosition: [snappedX, snappedY] });
    }
  }
  return results;
}

export function computeAlignToSafeArea(layers: Layer[], frame: number, canvasW: number, canvasH: number): AlignResult[] {
  const safeMarginX = canvasW * 0.1;
  const safeMarginY = canvasH * 0.1;
  const safeLeft = safeMarginX;
  const safeRight = canvasW - safeMarginX;
  const safeTop = safeMarginY;
  const safeBottom = canvasH - safeMarginY;
  const safeCx = canvasW / 2;
  const safeCy = canvasH / 2;
  const safeW = safeRight - safeLeft;
  const safeH = safeBottom - safeTop;

  const allBounds: LayerBounds[] = [];
  for (const layer of layers) {
    const b = getLayerBounds(layer, frame);
    if (b) allBounds.push(b);
  }
  if (allBounds.length === 0) return [];

  const sel = getSelectionBounds(allBounds);
  const selW = sel.maxX - sel.minX;
  const selH = sel.maxY - sel.minY;

  let dx = safeCx - sel.centerX;
  let dy = safeCy - sel.centerY;

  if (selW <= safeW && selH <= safeH) {
    const newMinX = sel.minX + dx;
    const newMaxX = sel.maxX + dx;
    const newMinY = sel.minY + dy;
    const newMaxY = sel.maxY + dy;
    if (newMinX < safeLeft) dx += safeLeft - newMinX;
    if (newMaxX > safeRight) dx -= newMaxX - safeRight;
    if (newMinY < safeTop) dy += safeTop - newMinY;
    if (newMaxY > safeBottom) dy -= newMaxY - safeBottom;
  }

  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return [];

  const results: AlignResult[] = [];
  for (const b of allBounds) {
    results.push({ layerId: b.id, newPosition: [b.x + dx, b.y + dy] });
  }
  return results;
}

export function computeAlignToArtboard(layers: Layer[], frame: number, canvasW: number, canvasH: number): AlignResult[] {
  return computeCenterToCanvas(layers, frame, canvasW, canvasH);
}

export function computeFitWidth(layers: Layer[], frame: number, canvasW: number, canvasH: number): FitCanvasResult[] {
  const allBounds: LayerBounds[] = [];
  for (const layer of layers) {
    const b = getLayerBounds(layer, frame);
    if (b) allBounds.push(b);
  }
  if (allBounds.length === 0) return [];

  const sel = getSelectionBounds(allBounds);
  const selW = sel.maxX - sel.minX;
  if (selW === 0) return [];

  const scaleFactor = canvasW / selW;
  if (Math.abs(scaleFactor - 1) < 0.001) return [];

  const canvasCx = canvasW / 2;
  const canvasCy = canvasH / 2;

  const results: FitCanvasResult[] = [];
  for (const b of allBounds) {
    const relX = b.x - sel.centerX;
    const relY = b.y - sel.centerY;
    const newX = canvasCx + relX * scaleFactor;
    const newY = canvasCy + relY * scaleFactor;
    const currentLayer = layers.find((l) => l.id === b.id);
    if (!currentLayer) continue;
    const s = evaluateProperty(currentLayer.transform.scale, frame) as Vec2;
    results.push({ layerId: b.id, newPosition: [newX, newY], newScale: [s[0] * scaleFactor, s[1] * scaleFactor] });
  }
  return results;
}

export function computeFitHeight(layers: Layer[], frame: number, canvasW: number, canvasH: number): FitCanvasResult[] {
  const allBounds: LayerBounds[] = [];
  for (const layer of layers) {
    const b = getLayerBounds(layer, frame);
    if (b) allBounds.push(b);
  }
  if (allBounds.length === 0) return [];

  const sel = getSelectionBounds(allBounds);
  const selH = sel.maxY - sel.minY;
  if (selH === 0) return [];

  const scaleFactor = canvasH / selH;
  if (Math.abs(scaleFactor - 1) < 0.001) return [];

  const canvasCx = canvasW / 2;
  const canvasCy = canvasH / 2;

  const results: FitCanvasResult[] = [];
  for (const b of allBounds) {
    const relX = b.x - sel.centerX;
    const relY = b.y - sel.centerY;
    const newX = canvasCx + relX * scaleFactor;
    const newY = canvasCy + relY * scaleFactor;
    const currentLayer = layers.find((l) => l.id === b.id);
    if (!currentLayer) continue;
    const s = evaluateProperty(currentLayer.transform.scale, frame) as Vec2;
    results.push({ layerId: b.id, newPosition: [newX, newY], newScale: [s[0] * scaleFactor, s[1] * scaleFactor] });
  }
  return results;
}

export function computeMatchCanvasAspect(layers: Layer[], frame: number, canvasW: number, canvasH: number): FitCanvasResult[] {
  const allBounds: LayerBounds[] = [];
  for (const layer of layers) {
    const b = getLayerBounds(layer, frame);
    if (b) allBounds.push(b);
  }
  if (allBounds.length === 0) return [];

  const sel = getSelectionBounds(allBounds);
  const selW = sel.maxX - sel.minX;
  const selH = sel.maxY - sel.minY;
  if (selW === 0 || selH === 0) return [];

  const canvasAspect = canvasW / canvasH;
  const selAspect = selW / selH;

  let scaleX = 1;
  let scaleY = 1;
  if (selAspect > canvasAspect) {
    scaleY = (selW / canvasAspect) / selH;
  } else {
    scaleX = (selH * canvasAspect) / selW;
  }

  if (Math.abs(scaleX - 1) < 0.001 && Math.abs(scaleY - 1) < 0.001) return [];

  const results: FitCanvasResult[] = [];
  for (const b of allBounds) {
    const relX = b.x - sel.centerX;
    const relY = b.y - sel.centerY;
    const newX = sel.centerX + relX * scaleX;
    const newY = sel.centerY + relY * scaleY;
    const currentLayer = layers.find((l) => l.id === b.id);
    if (!currentLayer) continue;
    const s = evaluateProperty(currentLayer.transform.scale, frame) as Vec2;
    results.push({ layerId: b.id, newPosition: [newX, newY], newScale: [s[0] * scaleX, s[1] * scaleY] });
  }
  return results;
}
