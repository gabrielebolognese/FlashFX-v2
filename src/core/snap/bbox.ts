import type { Layer, TextLayer, ShapeLayer, VideoLayer, ImageLayer, Vec2 } from '../types';
import { evaluateVec2, evaluateNumber } from '../interpolation';
import { getDescendants } from '../sceneGraph';
import { measureText } from '../../engine/textAtlas';
import type { Rect } from './types';

export function getWorldPosition(layer: Layer, layers: Layer[], frame: number): Vec2 {
  const localPos = evaluateVec2(layer.transform.position, frame);
  if (!layer.parentId) return localPos;
  const parent = layers.find((l) => l.id === layer.parentId);
  if (!parent) return localPos;
  const pw = getWorldPosition(parent, layers, frame);
  const ps = getWorldScale(parent, layers, frame);
  const pr = getWorldRotation(parent, layers, frame) * Math.PI / 180;
  const sx = localPos[0] * ps[0];
  const sy = localPos[1] * ps[1];
  return [
    pw[0] + sx * Math.cos(pr) - sy * Math.sin(pr),
    pw[1] + sx * Math.sin(pr) + sy * Math.cos(pr),
  ];
}

function getWorldScale(layer: Layer, layers: Layer[], frame: number): Vec2 {
  const s = evaluateVec2(layer.transform.scale, frame);
  if (!layer.parentId) return s;
  const parent = layers.find((l) => l.id === layer.parentId);
  if (!parent) return s;
  const ps = getWorldScale(parent, layers, frame);
  return [s[0] * ps[0], s[1] * ps[1]];
}

function getWorldRotation(layer: Layer, layers: Layer[], frame: number): number {
  const r = evaluateNumber(layer.transform.rotation, frame);
  if (!layer.parentId) return r;
  const parent = layers.find((l) => l.id === layer.parentId);
  if (!parent) return r;
  return r + getWorldRotation(parent, layers, frame);
}

function getLayerSize(layer: Layer, layers: Layer[], frame: number): { w: number; h: number } {
  const scale = getWorldScale(layer, layers, frame);

  if (layer.type === 'video') {
    const v = layer as VideoLayer;
    return { w: v.video.sourceWidth * Math.abs(scale[0]), h: v.video.sourceHeight * Math.abs(scale[1]) };
  }
  if (layer.type === 'image') {
    const im = layer as ImageLayer;
    return { w: im.image.sourceWidth * Math.abs(scale[0]), h: im.image.sourceHeight * Math.abs(scale[1]) };
  }
  if (layer.type === 'shape') {
    const shape = (layer as ShapeLayer).shape;
    let rawW = 0, rawH = 0;
    switch (shape.type) {
      case 'rectangle':
        rawW = evaluateNumber(shape.width, frame);
        rawH = evaluateNumber(shape.height, frame);
        break;
      case 'circle': {
        const r = evaluateNumber(shape.radius, frame);
        rawW = r * 2; rawH = r * 2;
        break;
      }
      case 'star': {
        const outer = evaluateNumber(shape.outerRadius, frame);
        rawW = outer * 2; rawH = outer * 2;
        break;
      }
      case 'polygon': {
        if (shape.vertices.length > 0) {
          let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
          for (const v of shape.vertices) {
            minX = Math.min(minX, v.position[0]);
            maxX = Math.max(maxX, v.position[0]);
            minY = Math.min(minY, v.position[1]);
            maxY = Math.max(maxY, v.position[1]);
          }
          rawW = maxX - minX; rawH = maxY - minY;
        }
        break;
      }
    }
    return { w: rawW * Math.abs(scale[0]), h: rawH * Math.abs(scale[1]) };
  }
  if (layer.type === 'text') {
    const tl = layer as TextLayer;
    const span = tl.content.spans[0]?.style;
    const bb = tl.layoutConfig.boundingBox;
    const measured = measureText({
      content: tl.content.spans.map(s => s.text).join(''), mode: bb.type === 'auto' ? 'point' : 'box',
      boxWidth: bb.type === 'fixed' ? bb.width : bb.type === 'fixedWidth' ? bb.width : 300, boxHeight: bb.type === 'fixed' ? bb.height : 200,
      fontFamily: span?.fontFamily ?? 'Inter', fontWeight: span?.fontWeight ?? 400, fontStyle: span?.fontStyle ?? 'normal',
      fontSize: evaluateNumber(tl.animOverrides.fontSize, frame),
      lineHeight: evaluateNumber(tl.animOverrides.lineHeight, frame),
      letterSpacing: evaluateNumber(tl.animOverrides.letterSpacing, frame),
      fillColor: span?.color ?? [1, 1, 1, 1], strokeColor: span?.strokeColor ?? [0, 0, 0, 0],
      strokeWidth: evaluateNumber(tl.animOverrides.strokeWidth, frame),
      textAlign: tl.layoutConfig.horizontalAlign, underline: span?.underline ?? false, strikethrough: span?.strikethrough ?? false,
      measuredWidth: 0, measuredHeight: 0,
    });
    return { w: measured.width * Math.abs(scale[0]), h: measured.height * Math.abs(scale[1]) };
  }
  return { w: 0, h: 0 };
}

export function getLayerRect(layer: Layer, layers: Layer[], frame: number): Rect | null {
  if (!layer.visible) return null;
  if (layer.type === 'audio') return null;
  if (layer.type === 'group') {
    const children = getDescendants(layer.id, layers).filter(l => l.visible && l.type !== 'group' && l.type !== 'audio');
    if (children.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const c of children) {
      const r = getLayerRect(c, layers, frame);
      if (!r) continue;
      minX = Math.min(minX, r.x);
      minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.w);
      maxY = Math.max(maxY, r.y + r.h);
    }
    if (!isFinite(minX)) return null;
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  const pos = getWorldPosition(layer, layers, frame);
  const size = getLayerSize(layer, layers, frame);
  return { x: pos[0] - size.w / 2, y: pos[1] - size.h / 2, w: size.w, h: size.h };
}

export function getSelectionRect(ids: string[], layers: Layer[], frame: number): Rect | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const id of ids) {
    const layer = layers.find(l => l.id === id);
    if (!layer) continue;
    const r = getLayerRect(layer, layers, frame);
    if (!r) continue;
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  if (!isFinite(minX)) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function getOtherRects(excludeIds: Set<string>, layers: Layer[], frame: number): Rect[] {
  const rects: Rect[] = [];
  for (const layer of layers) {
    if (excludeIds.has(layer.id)) continue;
    if (!layer.visible || layer.type === 'group' || layer.type === 'audio') continue;
    const r = getLayerRect(layer, layers, frame);
    if (r) rects.push(r);
  }
  return rects;
}
