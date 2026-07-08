import type { Layer, ShapeLayer, TextLayer, VideoLayer, ImageLayer, Vec2 } from './types';
import { evaluateVec2, evaluateNumber } from './interpolation';
import { measureText } from '../engine/textAtlas';

export function getChildren(parentId: string, layers: Layer[]): Layer[] {
  return layers.filter((l) => l.parentId === parentId);
}

export function getDescendants(groupId: string, layers: Layer[]): Layer[] {
  const result: Layer[] = [];
  const stack = [groupId];
  while (stack.length > 0) {
    const pid = stack.pop()!;
    for (const layer of layers) {
      if (layer.parentId === pid) {
        result.push(layer);
        if (layer.type === 'group') stack.push(layer.id);
      }
    }
  }
  return result;
}

export function getAncestors(layerId: string, layers: Layer[]): string[] {
  const map = new Map(layers.map((l) => [l.id, l]));
  const result: string[] = [];
  let current = map.get(layerId);
  while (current?.parentId) {
    result.push(current.parentId);
    current = map.get(current.parentId);
  }
  return result;
}

export function getDepth(layerId: string, layers: Layer[]): number {
  return getAncestors(layerId, layers).length;
}

export function isDescendantOf(layerId: string, potentialAncestorId: string, layers: Layer[]): boolean {
  return getAncestors(layerId, layers).includes(potentialAncestorId);
}

export function getDisplayOrder(layers: Layer[]): Layer[] {
  const childrenOf = new Map<string | null, Layer[]>();

  for (const layer of layers) {
    const pid = layer.parentId;
    if (!childrenOf.has(pid)) childrenOf.set(pid, []);
    childrenOf.get(pid)!.push(layer);
  }

  const result: Layer[] = [];
  function walk(parentId: string | null) {
    const children = childrenOf.get(parentId) || [];
    for (const child of children) {
      result.push(child);
      if (child.type === 'group') walk(child.id);
    }
  }
  walk(null);
  return result;
}

function getWorldPosition(layer: Layer, layers: Layer[], frame: number): Vec2 {
  const localPos = evaluateVec2(layer.transform.position, frame);
  if (!layer.parentId) return localPos;

  const parent = layers.find((l) => l.id === layer.parentId);
  if (!parent) return localPos;

  const parentWorld = getWorldPosition(parent, layers, frame);
  const parentScale = getWorldScale(parent, layers, frame);
  const parentRot = getWorldRotation(parent, layers, frame);

  const cosR = Math.cos(parentRot * Math.PI / 180);
  const sinR = Math.sin(parentRot * Math.PI / 180);
  const sx = localPos[0] * parentScale[0];
  const sy = localPos[1] * parentScale[1];

  return [
    parentWorld[0] + sx * cosR - sy * sinR,
    parentWorld[1] + sx * sinR + sy * cosR,
  ];
}

function getWorldScale(layer: Layer, layers: Layer[], frame: number): Vec2 {
  const localScale = evaluateVec2(layer.transform.scale, frame);
  if (!layer.parentId) return localScale;
  const parent = layers.find((l) => l.id === layer.parentId);
  if (!parent) return localScale;
  const parentScale = getWorldScale(parent, layers, frame);
  return [localScale[0] * parentScale[0], localScale[1] * parentScale[1]];
}

function getWorldRotation(layer: Layer, layers: Layer[], frame: number): number {
  const localRot = evaluateNumber(layer.transform.rotation, frame);
  if (!layer.parentId) return localRot;
  const parent = layers.find((l) => l.id === layer.parentId);
  if (!parent) return localRot;
  return localRot + getWorldRotation(parent, layers, frame);
}

function getLeafWorldSize(layer: Layer, layers: Layer[], frame: number): { w: number; h: number } | null {
  if (layer.type === 'group') return null;
  const scale = getWorldScale(layer, layers, frame);
  let w: number, h: number;

  if (layer.type === 'video') {
    const vl = layer as VideoLayer;
    w = vl.video.sourceWidth;
    h = vl.video.sourceHeight;
  } else if (layer.type === 'image') {
    const il = layer as ImageLayer;
    w = il.image.sourceWidth;
    h = il.image.sourceHeight;
  } else if (layer.type === 'shape') {
    const shape = (layer as ShapeLayer).shape;
    switch (shape.type) {
      case 'rectangle':
        w = evaluateNumber(shape.width, frame);
        h = evaluateNumber(shape.height, frame);
        break;
      case 'circle': {
        const r = evaluateNumber(shape.radius, frame);
        w = r * 2; h = r * 2;
        break;
      }
      case 'star': {
        const outer = evaluateNumber(shape.outerRadius, frame);
        w = outer * 2; h = outer * 2;
        break;
      }
      case 'polygon': {
        if (shape.vertices.length === 0) { w = 0; h = 0; }
        else {
          let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
          for (const v of shape.vertices) {
            if (v.position[0] < minX) minX = v.position[0];
            if (v.position[0] > maxX) maxX = v.position[0];
            if (v.position[1] < minY) minY = v.position[1];
            if (v.position[1] > maxY) maxY = v.position[1];
          }
          w = maxX - minX; h = maxY - minY;
        }
        break;
      }
    }
  } else {
    const tl = layer as TextLayer;
    const span = tl.content.spans[0]?.style;
    const bb = tl.layoutConfig.boundingBox;
    const measured = measureText({
      content: tl.content.spans.map(s => s.text).join(''),
      mode: bb.type === 'auto' ? 'point' : 'box',
      boxWidth: bb.type === 'fixed' ? bb.width : bb.type === 'fixedWidth' ? bb.width : 300,
      boxHeight: bb.type === 'fixed' ? bb.height : 200,
      fontFamily: span?.fontFamily ?? 'Inter',
      fontWeight: span?.fontWeight ?? 400,
      fontStyle: span?.fontStyle ?? 'normal',
      fontSize: evaluateNumber(tl.animOverrides.fontSize, frame),
      lineHeight: evaluateNumber(tl.animOverrides.lineHeight, frame),
      letterSpacing: evaluateNumber(tl.animOverrides.letterSpacing, frame),
      fillColor: span?.color ?? [1, 1, 1, 1],
      strokeColor: span?.strokeColor ?? [0, 0, 0, 0],
      strokeWidth: evaluateNumber(tl.animOverrides.strokeWidth, frame),
      textAlign: tl.layoutConfig.horizontalAlign,
      underline: span?.underline ?? false,
      strikethrough: span?.strikethrough ?? false,
      measuredWidth: 0,
      measuredHeight: 0,
    });
    w = measured.width;
    h = measured.height;
  }

  return { w: w * Math.abs(scale[0]), h: h * Math.abs(scale[1]) };
}

export function computeGroupBounds(
  groupId: string,
  layers: Layer[],
  frame: number
): { minX: number; minY: number; maxX: number; maxY: number; centerX: number; centerY: number } {
  const descendants = getDescendants(groupId, layers).filter(
    (l) => l.type !== 'group' && l.visible
  );

  if (descendants.length === 0) {
    const groupPos = getWorldPosition(
      layers.find((l) => l.id === groupId)!,
      layers,
      frame
    );
    return { minX: groupPos[0], minY: groupPos[1], maxX: groupPos[0], maxY: groupPos[1], centerX: groupPos[0], centerY: groupPos[1] };
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const layer of descendants) {
    const pos = getWorldPosition(layer, layers, frame);
    const size = getLeafWorldSize(layer, layers, frame);
    if (!size) continue;
    minX = Math.min(minX, pos[0] - size.w / 2);
    minY = Math.min(minY, pos[1] - size.h / 2);
    maxX = Math.max(maxX, pos[0] + size.w / 2);
    maxY = Math.max(maxY, pos[1] + size.h / 2);
  }

  if (!isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, centerX: 0, centerY: 0 };
  }

  return {
    minX, minY, maxX, maxY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

