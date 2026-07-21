import { useCallback, useRef, useEffect, useState } from 'react';
import { useEditorStore } from '../../store/editor';
import { useTimelineStore } from '../../store/timeline';
import { useHistoryStore } from '../../store/history';
import { useGridStore, generateGridLines } from '../../store/grid';
import { useViewportNavStore } from '../../store/viewportNav';
import type { ShapeLayer, TextLayer, GroupLayer, VideoLayer, ImageLayer, Layer, Vec2, ShapeGeometry, LayoutObjectLayer, LayoutContainerLayer } from '../../core/types';
import { evaluateProperty, evaluateNumber, evaluateVec2 } from '../../core/interpolation';
import { measureText } from '../../engine/textAtlas';
import { computeGroupBounds } from '../../core/sceneGraph';
import { snap, buildTargets, getSelectionRect, getOtherRects, type Rect, type SnapLine, type SnapTarget } from '../../core/snap';
import { CanvasSnapGuides } from './SnapGuides';
import { sampleBakedFrame } from '../../physics/bake';
import { getSettingValue } from '../../settings/store';

/** Current snap toggles (read imperatively when a drag begins). */
function readSnapFlags() {
  const enabled = getSettingValue<boolean>('editor.snapEnabled') ?? true;
  return {
    enabled,
    grid: enabled && (getSettingValue<boolean>('editor.snapToGrid') ?? true),
    guides: enabled && (getSettingValue<boolean>('editor.snapToGuides') ?? true),
    layers: enabled && (getSettingValue<boolean>('editor.snapToLayers') ?? true),
  };
}

function getShapeDimensions(shape: ShapeGeometry, frame: number): { w: number; h: number } {
  switch (shape.type) {
    case 'rectangle':
      return { w: evaluateNumber(shape.width, frame), h: evaluateNumber(shape.height, frame) };
    case 'circle': {
      const r = evaluateNumber(shape.radius, frame);
      return { w: r * 2, h: r * 2 };
    }
    case 'star': {
      const outer = evaluateNumber(shape.outerRadius, frame);
      return { w: outer * 2, h: outer * 2 };
    }
    case 'polygon': {
      if (shape.vertices.length === 0) return { w: 0, h: 0 };
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const v of shape.vertices) {
        if (v.position[0] < minX) minX = v.position[0];
        if (v.position[0] > maxX) maxX = v.position[0];
        if (v.position[1] < minY) minY = v.position[1];
        if (v.position[1] > maxY) maxY = v.position[1];
      }
      return { w: maxX - minX, h: maxY - minY };
    }
  }
}

type HandleType =
  | 'move'
  | 'tl' | 'tr' | 'bl' | 'br'
  | 'top' | 'bottom' | 'left' | 'right'
  | 'rotate';

interface TransformState {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  anchorX: number;
  anchorY: number;
}

const HANDLE_SIZE = 8;
const ROTATION_OFFSET = 24;

interface TransformOverlayProps {
  style?: React.CSSProperties;
}

function useElementSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setSize({ width: r.width, height: r.height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}

function getLayerWorldBounds(layer: Layer, currentFrame: number, compW?: number, compH?: number): { x: number; y: number; w: number; h: number } | null {
  if (layer.type === 'group' || layer.type === 'audio') return null;
  if (currentFrame < layer.inPoint || currentFrame >= layer.outPoint) return null;
  let pos = evaluateProperty(layer.transform.position, currentFrame) as Vec2;
  const baked = sampleBakedFrame(layer.id, currentFrame);
  if (baked) {
    pos = [baked.x, baked.y] as Vec2;
  }
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
    const sl = layer as ShapeLayer;
    if (!sl.shape) return null;
    const dims = getShapeDimensions(sl.shape, currentFrame);
    w = dims.w;
    h = dims.h;
  } else if (layer.type === 'text') {
    const tl = layer as TextLayer;
    if (!tl.content?.spans[0]?.style) return null;
    const span = tl.content.spans[0].style;
    const bb = tl.layoutConfig.boundingBox;
    const measured = measureText({
      content: tl.content.spans.map(s => s.text).join(''),
      mode: bb.type === 'auto' ? 'point' : 'box',
      boxWidth: bb.type === 'fixed' ? bb.width : bb.type === 'fixedWidth' ? bb.width : 300,
      boxHeight: bb.type === 'fixed' ? bb.height : 200,
      fontFamily: span.fontFamily,
      fontWeight: span.fontWeight,
      fontStyle: span.fontStyle,
      fontSize: evaluateNumber(tl.animOverrides.fontSize, currentFrame),
      lineHeight: evaluateNumber(tl.animOverrides.lineHeight, currentFrame),
      letterSpacing: evaluateNumber(tl.animOverrides.letterSpacing, currentFrame),
      fillColor: span.color,
      strokeColor: span.strokeColor,
      strokeWidth: evaluateNumber(tl.animOverrides.strokeWidth, currentFrame),
      textAlign: tl.layoutConfig.horizontalAlign,
      underline: span.underline,
      strikethrough: span.strikethrough,
      measuredWidth: 0,
      measuredHeight: 0,
    });
    w = measured.width;
    h = measured.height;
  } else if (layer.type === 'fieldSampled' || layer.type === 'particle' || layer.type === 'animationItem') {
    w = compW || 400;
    h = compH || 400;
  } else if (layer.type === 'hbox' || layer.type === 'vbox' || layer.type === 'grid') {
    const layoutLayer = layer as LayoutObjectLayer;
    const lp = layoutLayer.layoutParams;
    w = lp.width.type === 'fixed' ? lp.width.value : 200;
    h = lp.height.type === 'fixed' ? lp.height.value : 200;
  } else if (layer.type === 'layoutContainer') {
    const container = layer as LayoutContainerLayer;
    w = container.containerShape.width || 200;
    h = container.containerShape.height || 200;
  } else {
    return null;
  }
  return { x: pos[0], y: pos[1], w, h };
}

export function TransformOverlay({ style }: TransformOverlayProps) {
  const composition = useEditorStore((s) => s.composition);
  const selection = useEditorStore((s) => s.selection);
  const hoveredLayerId = useEditorStore((s) => s.hoveredLayerId);
  const currentFrame = useTimelineStore((s) => s.currentFrame);
  const updateLayerProperty = useEditorStore((s) => s.updateLayerProperty);
  const addKeyframe = useEditorStore((s) => s.addKeyframe);
  const selectLayer = useEditorStore((s) => s.selectLayer);
  const setHoveredLayer = useEditorStore((s) => s.setHoveredLayer);

  const gridSettings = useGridStore((s) => s.grid);
  const guideSettings = useGridStore((s) => s.guides);
  const showLayerControls = useViewportNavStore((s) => s.showLayerControls);

  const overlayRef = useRef<HTMLDivElement>(null);
  const overlaySize = useElementSize(overlayRef);
  const [dragging, setDragging] = useState<HandleType | null>(null);
  const [hoverHandle, setHoverHandle] = useState<HandleType | null>(null);
  const [snapLines, setSnapLines] = useState<SnapLine[]>([]);
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const marqueeRef = useRef<{ startCX: number; startCY: number; active: boolean; lastIds: string } | null>(null);
  const dragStart = useRef({ mx: 0, my: 0, state: null as TransformState | null, groupPos: null as Vec2 | null, initFontSize: 0, initScale: [1, 1] as Vec2, multiPositions: [] as { id: string; pos: Vec2 }[] });
  const snapDataRef = useRef<{ initialRect: Rect; targets: SnapTarget[] } | null>(null);

  const activeLayer = composition.layers.find((l) => l.id === selection.activeId) || null;
  const isGroupActive = activeLayer?.type === 'group';

  const compW = composition.settings.width;
  const compH = composition.settings.height;

  const scaleX = overlaySize.width > 0 ? overlaySize.width / compW : 0;
  const scaleY = overlaySize.height > 0 ? overlaySize.height / compH : 0;
  const screenScale = Math.min(scaleX, scaleY);
  const sX = scaleX;
  const sY = scaleY;


  const getTransformState = useCallback((): TransformState | null => {
    if (!activeLayer) return null;
    if (currentFrame < activeLayer.inPoint || currentFrame >= activeLayer.outPoint) return null;

    if (activeLayer.type === 'group') {
      const bounds = computeGroupBounds(activeLayer.id, composition.layers, currentFrame);
      const rot = evaluateNumber(activeLayer.transform.rotation, currentFrame);
      return {
        x: bounds.centerX,
        y: bounds.centerY,
        w: bounds.maxX - bounds.minX,
        h: bounds.maxY - bounds.minY,
        rotation: rot,
        anchorX: 0,
        anchorY: 0,
      };
    }

    if (activeLayer.type === 'audio') return null;

    let pos = evaluateProperty(activeLayer.transform.position, currentFrame) as Vec2;

    // Check for physics baked position
    const baked = sampleBakedFrame(activeLayer.id, currentFrame);
    const physicsBindings = composition.physicsBindings || [];
    const hasPhysics = baked && physicsBindings.some((b) => b.layerId === activeLayer.id && b.role === 'dynamic' && b.enabled);
    if (hasPhysics && baked) {
      pos = [baked.x, baked.y] as Vec2;
    }

    let w: number, h: number;
    if (activeLayer.type === 'video') {
      w = (activeLayer as VideoLayer).video.sourceWidth;
      h = (activeLayer as VideoLayer).video.sourceHeight;
    } else if (activeLayer.type === 'image') {
      w = (activeLayer as ImageLayer).image.sourceWidth;
      h = (activeLayer as ImageLayer).image.sourceHeight;
    } else if (activeLayer.type === 'shape') {
      if (!(activeLayer as ShapeLayer).shape) return null;
      const dims = getShapeDimensions((activeLayer as ShapeLayer).shape, currentFrame);
      w = dims.w;
      h = dims.h;
    } else if (activeLayer.type === 'text') {
      if (!(activeLayer as TextLayer).content?.spans[0]?.style) return null;
      const tl = activeLayer as TextLayer;
      const span = tl.content.spans[0].style;
      const bb = tl.layoutConfig.boundingBox;
      const measured = measureText({
        content: tl.content.spans.map(s => s.text).join(''),
        mode: bb.type === 'auto' ? 'point' : 'box',
        boxWidth: bb.type === 'fixed' ? bb.width : bb.type === 'fixedWidth' ? bb.width : 300,
        boxHeight: bb.type === 'fixed' ? bb.height : 200,
        fontFamily: span.fontFamily,
        fontWeight: span.fontWeight,
        fontStyle: span.fontStyle,
        fontSize: evaluateNumber(tl.animOverrides.fontSize, currentFrame),
        lineHeight: evaluateNumber(tl.animOverrides.lineHeight, currentFrame),
        letterSpacing: evaluateNumber(tl.animOverrides.letterSpacing, currentFrame),
        fillColor: span.color,
        strokeColor: span.strokeColor,
        strokeWidth: evaluateNumber(tl.animOverrides.strokeWidth, currentFrame),
        textAlign: tl.layoutConfig.horizontalAlign,
        underline: span.underline,
        strikethrough: span.strikethrough,
        measuredWidth: 0,
        measuredHeight: 0,
      });
      w = measured.width;
      h = measured.height;
    } else if (activeLayer.type === 'fieldSampled' || activeLayer.type === 'particle' || activeLayer.type === 'animationItem') {
      w = compW;
      h = compH;
    } else {
      return null;
    }
    const rot = hasPhysics && baked ? baked.rotation * (180 / Math.PI) : evaluateProperty(activeLayer.transform.rotation, currentFrame) as number;
    const anchor = evaluateProperty(activeLayer.transform.anchorPoint, currentFrame) as Vec2;
    return { x: pos[0], y: pos[1], w, h, rotation: rot, anchorX: anchor[0], anchorY: anchor[1] };
  }, [activeLayer, composition.layers, composition.physicsBindings, currentFrame, compW, compH]);

  const transformState = getTransformState();

  const toScreen = useCallback((cx: number, cy: number): [number, number] => {
    return [cx * sX, cy * sY];
  }, [sX, sY]);

  const toComp = useCallback((clientX: number, clientY: number): [number, number] => {
    const el = overlayRef.current;
    if (!el || sX === 0 || sY === 0) return [0, 0];
    const rect = el.getBoundingClientRect();
    return [(clientX - rect.left) / sX, (clientY - rect.top) / sY];
  }, [sX, sY]);

  const updateAnimatable = useCallback((path: string, value: number | Vec2) => {
    if (!activeLayer) return;
    const prop = getNestedProp(activeLayer, path);
    if (prop && prop.keyframes && prop.keyframes.length > 0) {
      addKeyframe(activeLayer.id, path, currentFrame, value as number | [number, number]);
    } else {
      updateLayerProperty(activeLayer.id, `${path}.defaultValue`, value);
    }
  }, [activeLayer, currentFrame, addKeyframe, updateLayerProperty]);

  const hitTestLayers = useCallback((cx: number, cy: number): Layer | null => {
    const layers = [...composition.layers].reverse();
    for (const l of layers) {
      if (!l.visible) continue;
      if (l.type === 'group') continue;
      const bounds = getLayerWorldBounds(l, currentFrame, compW, compH);
      if (!bounds) continue;
      const left = bounds.x - bounds.w / 2;
      const top = bounds.y - bounds.h / 2;
      if (cx >= left && cx <= left + bounds.w && cy >= top && cy <= top + bounds.h) {
        return l;
      }
    }
    return null;
  }, [composition.layers, currentFrame, compW, compH]);

  const hitTestGroup = useCallback((cx: number, cy: number): GroupLayer | null => {
    const groups = composition.layers.filter((l) => l.type === 'group' && l.visible) as GroupLayer[];
    for (const g of groups) {
      const bounds = computeGroupBounds(g.id, composition.layers, currentFrame);
      if (cx >= bounds.minX && cx <= bounds.maxX && cy >= bounds.minY && cy <= bounds.maxY) {
        return g;
      }
    }
    return null;
  }, [composition.layers, currentFrame]);

  const handleBackgroundClick = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (e.target !== overlayRef.current) return;
    const [cx, cy] = toComp(e.clientX, e.clientY);
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;

    const hit = hitTestLayers(cx, cy);
    if (hit) {
      // If the hit layer is already part of a multi-selection, start a multi-drag
      if (selection.selectedIds.length > 1 && selection.selectedIds.includes(hit.id) && !additive) {
        // Compute transform state for the hit layer directly
        const hitBounds = getLayerWorldBounds(hit, currentFrame, compW, compH);
        if (!hitBounds) return;
        const hitPos = evaluateProperty(hit.transform.position, currentFrame) as Vec2;
        const hitRot = evaluateProperty(hit.transform.rotation, currentFrame) as number;
        const hitAnchor = evaluateProperty(hit.transform.anchorPoint, currentFrame) as Vec2;
        const hitScale = evaluateProperty(hit.transform.scale, currentFrame) as Vec2;
        const state: TransformState = { x: hitPos[0], y: hitPos[1], w: hitBounds.w, h: hitBounds.h, rotation: hitRot, anchorX: hitAnchor[0], anchorY: hitAnchor[1] };

        // Capture positions of all other selected layers
        const positions: { id: string; pos: Vec2 }[] = [];
        for (const id of selection.selectedIds) {
          if (id === hit.id) continue;
          const layer = composition.layers.find((l) => l.id === id);
          if (layer) {
            const pos = evaluateProperty(layer.transform.position, currentFrame) as Vec2;
            positions.push({ id, pos: [pos[0], pos[1]] });
          }
        }

        dragStart.current = { mx: e.clientX, my: e.clientY, state, groupPos: null, initFontSize: 0, initScale: hitScale, multiPositions: positions };
        dragSnapshot.current = { comp: composition, sel: selection };

        // Update activeId to the hit layer
        if (hit.id !== selection.activeId) {
          useEditorStore.getState()._setSelection({ ...selection, activeId: hit.id });
        }

        // Compute snap data
        const selectedIds = selection.selectedIds;
        const excludeIds = new Set(selectedIds);
        const initialRect = getSelectionRect(selectedIds, composition.layers, currentFrame);
        const snapFlags = readSnapFlags();
        const otherRects = snapFlags.layers ? getOtherRects(excludeIds, composition.layers, currentFrame) : [];
        const { vertical, horizontal } = snapFlags.grid && gridSettings.visible
          ? generateGridLines(compW, compH, gridSettings.columns, gridSettings.rows, gridSettings.subdivisions)
          : { vertical: [], horizontal: [] };
        const targets = buildTargets(otherRects, compW, compH, vertical, horizontal, snapFlags.guides && guideSettings.visible ? guideSettings.guidelines : []);
        snapDataRef.current = initialRect ? { initialRect, targets } : null;

        e.preventDefault();
        e.stopPropagation();
        useHistoryStore.getState().setBatching(true);
        setDragging('move');
        setSnapLines([]);
        document.body.style.userSelect = 'none';
        return;
      }
      selectLayer(hit.id, additive, 'canvas');
      return;
    }

    const group = hitTestGroup(cx, cy);
    if (group) {
      selectLayer(group.id, additive, 'canvas');
      return;
    }

    // Start marquee selection on empty space
    if (!additive) selectLayer(null, false, 'canvas');
    marqueeRef.current = { startCX: cx, startCY: cy, active: false, lastIds: '' };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [toComp, hitTestLayers, hitTestGroup, selectLayer, selection, composition, currentFrame, compW, compH, gridSettings, guideSettings]);

  const marqueeHitTest = useCallback((rect: { x: number; y: number; w: number; h: number }): string[] => {
    const ids: string[] = [];
    const rx = Math.min(rect.x, rect.x + rect.w);
    const ry = Math.min(rect.y, rect.y + rect.h);
    const rw = Math.abs(rect.w);
    const rh = Math.abs(rect.h);
    for (const l of composition.layers) {
      if (!l.visible || l.type === 'group') continue;
      if (currentFrame < l.inPoint || currentFrame >= l.outPoint) continue;
      const bounds = getLayerWorldBounds(l, currentFrame, compW, compH);
      if (!bounds) continue;
      const lx = bounds.x - bounds.w / 2;
      const ly = bounds.y - bounds.h / 2;
      if (lx + bounds.w > rx && lx < rx + rw && ly + bounds.h > ry && ly < ry + rh) {
        ids.push(l.id);
      }
    }
    return ids;
  }, [composition.layers, currentFrame]);

  const handleOverlayPointerMove = useCallback((e: React.PointerEvent) => {
    // Marquee drag
    const m = marqueeRef.current;
    if (m) {
      const [cx, cy] = toComp(e.clientX, e.clientY);
      const rect = { x: m.startCX, y: m.startCY, w: cx - m.startCX, h: cy - m.startCY };
      const dist = Math.sqrt(rect.w * rect.w + rect.h * rect.h);
      if (!m.active && dist < 4) return;
      m.active = true;
      setMarquee(rect);
      const ids = marqueeHitTest(rect);
      const key = ids.join(',');
      if (key !== m.lastIds) {
        m.lastIds = key;
        useEditorStore.getState()._setSelection({
          selectedIds: ids,
          activeId: ids.length > 0 ? ids[ids.length - 1] : null,
          selectedKeyframes: [],
          selectedCurvePoints: [],
        });
      }
      return;
    }

    // Normal hover
    if (dragging) return;
    const [cx, cy] = toComp(e.clientX, e.clientY);
    const hit = hitTestLayers(cx, cy);
    if (hit) {
      setHoveredLayer(hit.id);
      return;
    }
    const group = hitTestGroup(cx, cy);
    setHoveredLayer(group ? group.id : null);
  }, [toComp, hitTestLayers, hitTestGroup, dragging, setHoveredLayer, marqueeHitTest]);

  const handleOverlayPointerUp = useCallback(() => {
    if (marqueeRef.current) {
      marqueeRef.current = null;
      setMarquee(null);
    }
  }, []);

  const handlePointerLeave = useCallback(() => {
    setHoveredLayer(null);
  }, [setHoveredLayer]);

  const dragSnapshot = useRef<{ comp: typeof composition; sel: typeof selection } | null>(null);

  const startDrag = useCallback((e: React.PointerEvent, handle: HandleType) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    if (!activeLayer) return;
    const state = getTransformState();
    if (!state) return;
    const gPos = activeLayer.type === 'group' ? evaluateVec2(activeLayer.transform.position, currentFrame) : null;
    let initFontSize = 0;
    if (activeLayer.type === 'text') {
      initFontSize = evaluateNumber(activeLayer.animOverrides.fontSize, currentFrame);
    }
    const initScale = evaluateProperty(activeLayer.transform.scale, currentFrame) as Vec2;
    dragStart.current = { mx: e.clientX, my: e.clientY, state, groupPos: gPos, initFontSize, initScale, multiPositions: [] };
    dragSnapshot.current = { comp: composition, sel: selection };

    // Capture initial positions of all selected layers for multi-drag
    if (handle === 'move' && selection.selectedIds.length > 1) {
      const positions: { id: string; pos: Vec2 }[] = [];
      for (const id of selection.selectedIds) {
        const layer = composition.layers.find((l) => l.id === id);
        if (layer && layer.id !== activeLayer.id) {
          const pos = evaluateProperty(layer.transform.position, currentFrame) as Vec2;
          positions.push({ id, pos: [pos[0], pos[1]] });
        }
      }
      dragStart.current.multiPositions = positions;
    }

    // Compute snap data at drag start (BEFORE any position changes)
    if (handle === 'move') {
      const selectedIds = selection.selectedIds.length > 0 ? selection.selectedIds : [activeLayer.id];
      const excludeIds = new Set(selectedIds);
      const initialRect = getSelectionRect(selectedIds, composition.layers, currentFrame);
      const snapFlags = readSnapFlags();
      const otherRects = snapFlags.layers ? getOtherRects(excludeIds, composition.layers, currentFrame) : [];
      const { vertical, horizontal } = snapFlags.grid && gridSettings.visible
        ? generateGridLines(compW, compH, gridSettings.columns, gridSettings.rows, gridSettings.subdivisions)
        : { vertical: [], horizontal: [] };
      const targets = buildTargets(otherRects, compW, compH, vertical, horizontal, snapFlags.guides && guideSettings.visible ? guideSettings.guidelines : []);
      snapDataRef.current = initialRect ? { initialRect, targets } : null;
    } else {
      snapDataRef.current = null;
    }

    useHistoryStore.getState().setBatching(true);
    setDragging(handle);
    setSnapLines([]);
    document.body.style.userSelect = 'none';
  }, [getTransformState, activeLayer, currentFrame, composition, selection, gridSettings, compW, compH]);

  useEffect(() => {
    if (!dragging) return;

    const handleMove = (e: PointerEvent) => {
      const { state, mx: startMx, my: startMy } = dragStart.current;
      if (!state || !activeLayer || screenScale === 0) return;

      const deltaScreenX = e.clientX - startMx;
      const deltaScreenY = e.clientY - startMy;
      const dx = deltaScreenX / sX;
      const dy = deltaScreenY / sY;
      const shiftHeld = e.shiftKey;

      if (dragging === 'move') {
        // Compute snap from initial rect + raw delta (no feedback loop)
        let snapDx = 0;
        let snapDy = 0;
        if (!e.altKey && snapDataRef.current) {
          const { initialRect, targets } = snapDataRef.current;
          const proposed: Rect = {
            x: initialRect.x + dx,
            y: initialRect.y + dy,
            w: initialRect.w,
            h: initialRect.h,
          };
          const result = snap({ proposed, targets, screenScale });
          snapDx = result.dx;
          snapDy = result.dy;
          setSnapLines(result.lines);
        } else {
          setSnapLines([]);
        }

        if (isGroupActive) {
          const gPos = dragStart.current.groupPos;
          if (!gPos) return;
          const finalX = gPos[0] + dx + snapDx;
          const finalY = gPos[1] + dy + snapDy;

          const prop = getNestedProp(activeLayer, 'transform.position');
          if (prop && prop.keyframes && prop.keyframes.length > 0) {
            addKeyframe(activeLayer.id, 'transform.position', currentFrame, [finalX, finalY] as [number, number]);
          } else {
            updateLayerProperty(activeLayer.id, 'transform.position.defaultValue', [finalX, finalY]);
          }
        } else {
          const finalX = state.x + dx + snapDx;
          const finalY = state.y + dy + snapDy;
          updateAnimatable('transform.position', [finalX, finalY] as Vec2);

          // Move all other selected layers by the same delta
          const { multiPositions } = dragStart.current;
          for (const mp of multiPositions) {
            const layer = composition.layers.find((l) => l.id === mp.id);
            if (!layer) continue;
            const newX = mp.pos[0] + dx + snapDx;
            const newY = mp.pos[1] + dy + snapDy;
            const prop = getNestedProp(layer, 'transform.position');
            if (prop && prop.keyframes && prop.keyframes.length > 0) {
              addKeyframe(layer.id, 'transform.position', currentFrame, [newX, newY] as [number, number]);
            } else {
              updateLayerProperty(layer.id, 'transform.position.defaultValue', [newX, newY]);
            }
          }
        }
      } else if (dragging === 'rotate') {
        if (isGroupActive) {
          const bounds = computeGroupBounds(activeLayer.id, composition.layers, currentFrame);
          const pivotX = bounds.centerX;
          const pivotY = bounds.centerY;
          const [scx, scy] = toScreen(pivotX, pivotY);
          const el = overlayRef.current;
          if (!el) return;
          const rect = el.getBoundingClientRect();
          const absPivotX = rect.left + scx;
          const absPivotY = rect.top + scy;
          const startAngle = Math.atan2(startMy - absPivotY, startMx - absPivotX);
          const currentAngle = Math.atan2(e.clientY - absPivotY, e.clientX - absPivotX);
          let angleDelta = ((currentAngle - startAngle) * 180) / Math.PI;
          if (shiftHeld) angleDelta = Math.round(angleDelta / 15) * 15;
          const initRot = state.rotation;
          const prop = getNestedProp(activeLayer, 'transform.rotation');
          if (prop && prop.keyframes && prop.keyframes.length > 0) {
            addKeyframe(activeLayer.id, 'transform.rotation', currentFrame, initRot + angleDelta);
          } else {
            updateLayerProperty(activeLayer.id, 'transform.rotation.defaultValue', initRot + angleDelta);
          }
        } else {
          const pivotX = state.x + state.anchorX;
          const pivotY = state.y + state.anchorY;
          const [scx, scy] = toScreen(pivotX, pivotY);
          const el = overlayRef.current;
          if (!el) return;
          const rect = el.getBoundingClientRect();
          const absPivotX = rect.left + scx;
          const absPivotY = rect.top + scy;
          const startAngle = Math.atan2(startMy - absPivotY, startMx - absPivotX);
          const currentAngle = Math.atan2(e.clientY - absPivotY, e.clientX - absPivotX);
          let angleDelta = ((currentAngle - startAngle) * 180) / Math.PI;
          if (shiftHeld) angleDelta = Math.round(angleDelta / 15) * 15;
          updateAnimatable('transform.rotation', state.rotation + angleDelta);
        }
      } else {
        if (isGroupActive) return;

        let newW = state.w;
        let newH = state.h;
        let newX = state.x;
        let newY = state.y;

        switch (dragging) {
          case 'tr':
            newW = Math.max(1, state.w + dx);
            newH = Math.max(1, state.h - dy);
            newX = state.x + dx / 2;
            newY = state.y + dy / 2;
            break;
          case 'tl':
            newW = Math.max(1, state.w - dx);
            newH = Math.max(1, state.h - dy);
            newX = state.x + dx / 2;
            newY = state.y + dy / 2;
            break;
          case 'br':
            newW = Math.max(1, state.w + dx);
            newH = Math.max(1, state.h + dy);
            newX = state.x + dx / 2;
            newY = state.y + dy / 2;
            break;
          case 'bl':
            newW = Math.max(1, state.w - dx);
            newH = Math.max(1, state.h + dy);
            newX = state.x + dx / 2;
            newY = state.y + dy / 2;
            break;
          case 'top':
            newH = Math.max(1, state.h - dy);
            newY = state.y + dy / 2;
            break;
          case 'bottom':
            newH = Math.max(1, state.h + dy);
            newY = state.y + dy / 2;
            break;
          case 'left':
            newW = Math.max(1, state.w - dx);
            newX = state.x + dx / 2;
            break;
          case 'right':
            newW = Math.max(1, state.w + dx);
            newX = state.x + dx / 2;
            break;
        }

        if (shiftHeld && ['tl', 'tr', 'bl', 'br'].includes(dragging)) {
          const aspect = state.w / state.h;
          if (newW / newH > aspect) {
            newW = newH * aspect;
          } else {
            newH = newW / aspect;
          }
        }

        if (activeLayer.type === 'shape') {
          const shapeType = (activeLayer as ShapeLayer).shape.type;
          if (shapeType === 'rectangle') {
            updateAnimatable('shape.width', newW);
            updateAnimatable('shape.height', newH);
          } else if (shapeType === 'circle') {
            updateAnimatable('shape.radius', Math.min(newW, newH) / 2);
          } else if (shapeType === 'star') {
            updateAnimatable('shape.outerRadius', Math.min(newW, newH) / 2);
          } else {
            // Polygon and others: use scale transform
            const scaleFactorX = newW / state.w;
            const scaleFactorY = newH / state.h;
            const initScale = dragStart.current.initScale;
            updateLayerProperty(activeLayer.id, 'transform.scale.defaultValue', [initScale[0] * scaleFactorX, initScale[1] * scaleFactorY]);
          }
        } else if (activeLayer.type === 'video') {
          const scaleFactorX = newW / state.w;
          const scaleFactorY = newH / state.h;
          const initScale = dragStart.current.initScale;
          const scaleProp = getNestedProp(activeLayer, 'transform.scale');
          if (scaleProp && scaleProp.keyframes && scaleProp.keyframes.length > 0) {
            addKeyframe(activeLayer.id, 'transform.scale', currentFrame, [initScale[0] * scaleFactorX, initScale[1] * scaleFactorY] as [number, number]);
          } else {
            updateLayerProperty(activeLayer.id, 'transform.scale.defaultValue', [initScale[0] * scaleFactorX, initScale[1] * scaleFactorY]);
          }
        } else if (activeLayer.type === 'text') {
          const textLayer = activeLayer as TextLayer;
          if (textLayer.layoutConfig.boundingBox.type !== 'auto') {
            updateLayerProperty(activeLayer.id, 'layoutConfig.boundingBox', { type: 'fixed' as const, width: Math.max(8, newW), height: Math.max(8, newH) });
          } else {
            const scaleFactor = Math.max(newW / state.w, newH / state.h);
            const newFontSize = Math.max(4, dragStart.current.initFontSize * scaleFactor);
            const fsProp = getNestedProp(activeLayer, 'animOverrides.fontSize');
            if (fsProp && fsProp.keyframes && fsProp.keyframes.length > 0) {
              addKeyframe(activeLayer.id, 'animOverrides.fontSize', currentFrame, newFontSize);
            } else {
              updateLayerProperty(activeLayer.id, 'animOverrides.fontSize.defaultValue', newFontSize);
            }
          }
        } else {
          const scaleFactorX = newW / state.w;
          const scaleFactorY = newH / state.h;
          const initScale = dragStart.current.initScale;
          const scaleProp = getNestedProp(activeLayer, 'transform.scale');
          if (scaleProp && scaleProp.keyframes && scaleProp.keyframes.length > 0) {
            addKeyframe(activeLayer.id, 'transform.scale', currentFrame, [initScale[0] * scaleFactorX, initScale[1] * scaleFactorY] as [number, number]);
          } else {
            updateLayerProperty(activeLayer.id, 'transform.scale.defaultValue', [initScale[0] * scaleFactorX, initScale[1] * scaleFactorY]);
          }
        }
        updateAnimatable('transform.position', [newX, newY] as Vec2);
      }
    };

    const handleUp = () => {
      useHistoryStore.getState().setBatching(false);
      if (dragSnapshot.current) {
        useEditorStore.getState().commitDrag('Transform', dragSnapshot.current.comp, dragSnapshot.current.sel);
        dragSnapshot.current = null;
      }
      setDragging(null);
      setSnapLines([]);
      snapDataRef.current = null;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleUp);
    return () => {
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleUp);
    };
  }, [dragging, activeLayer, isGroupActive, screenScale, sX, sY, toScreen, updateAnimatable, selection.selectedIds, composition.layers, currentFrame, compW, compH, addKeyframe, updateLayerProperty]);

  const getCursor = (handle: HandleType): string => {
    switch (handle) {
      case 'tl': case 'br': return 'nwse-resize';
      case 'tr': case 'bl': return 'nesw-resize';
      case 'top': case 'bottom': return 'ns-resize';
      case 'left': case 'right': return 'ew-resize';
      case 'rotate': return 'crosshair';
      case 'move': return 'move';
      default: return 'default';
    }
  };

  const hasTransform = activeLayer && transformState && screenScale > 0;

  if (!hasTransform) {
    return (
      <div
        ref={overlayRef}
        style={style}
        onPointerDown={handleBackgroundClick}
        onPointerMove={handleOverlayPointerMove}
        onPointerUp={handleOverlayPointerUp}
        onPointerLeave={handlePointerLeave}
      >
        <HoverAndSelectionOutlines
          layers={composition.layers}
          selection={selection}
          hoveredLayerId={hoveredLayerId}
          currentFrame={currentFrame}
          sX={sX}
          sY={sY}
          activeId={null}
          compW={compW}
          compH={compH}
        />
        {marquee && <MarqueeRect rect={marquee} sX={sX} sY={sY} />}
      </div>
    );
  }

  const { x, y, w, h, rotation, anchorX, anchorY } = transformState;
  const [centerSX, centerSY] = toScreen(x, y);
  const sw = w * sX;
  const sh = h * sY;

  const ancSX = anchorX * sX;
  const ancSY = anchorY * sY;
  const originX = sw / 2 + ancSX;
  const originY = sh / 2 + ancSY;

  const handles: { id: HandleType; cx: number; cy: number }[] = [
    { id: 'tl', cx: -sw / 2, cy: -sh / 2 },
    { id: 'tr', cx: sw / 2, cy: -sh / 2 },
    { id: 'bl', cx: -sw / 2, cy: sh / 2 },
    { id: 'br', cx: sw / 2, cy: sh / 2 },
    { id: 'top', cx: 0, cy: -sh / 2 },
    { id: 'bottom', cx: 0, cy: sh / 2 },
    { id: 'left', cx: -sw / 2, cy: 0 },
    { id: 'right', cx: sw / 2, cy: 0 },
  ];

  return (
    <div
      ref={overlayRef}
      style={style}
      onPointerDown={handleBackgroundClick}
      onPointerMove={handleOverlayPointerMove}
      onPointerUp={handleOverlayPointerUp}
      onPointerLeave={handlePointerLeave}
    >
      {showLayerControls && (
        <HoverAndSelectionOutlines
          layers={composition.layers}
          selection={selection}
          hoveredLayerId={hoveredLayerId}
          currentFrame={currentFrame}
          sX={sX}
          sY={sY}
          activeId={activeLayer.id}
          compW={compW}
          compH={compH}
        />
      )}
      <CanvasSnapGuides lines={snapLines} scaleX={sX} scaleY={sY} />


      {showLayerControls && (
      <div
        className="absolute"
        style={{ left: centerSX, top: centerSY, width: 0, height: 0 }}
      >
        <div
          className="absolute pointer-events-none"
          style={{
            left: -sw / 2,
            top: -sh / 2,
            width: sw,
            height: sh,
            transform: `rotate(${rotation}deg)`,
            transformOrigin: `${originX}px ${originY}px`,
          }}
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              border: isGroupActive
                ? '1.5px dashed rgba(34, 197, 94, 0.8)'
                : '1px solid rgba(56, 189, 248, 1)',
            }}
          />

          <div
            className="absolute inset-0 pointer-events-auto"
            style={{ cursor: dragging === 'move' ? 'grabbing' : 'move' }}
            onPointerDown={(e) => startDrag(e, 'move')}
          />

          {handles.map(({ id, cx, cy }) => {
            const isCorner = ['tl', 'tr', 'bl', 'br'].includes(id);
            const size = isCorner ? HANDLE_SIZE : HANDLE_SIZE - 2;
            const hitSize = size + 8;
            const isHovered = hoverHandle === id;

            if (isGroupActive && !isCorner && id !== 'rotate') return null;

            return (
              <div
                key={id}
                className="absolute pointer-events-auto flex items-center justify-center"
                style={{
                  left: sw / 2 + cx - hitSize / 2,
                  top: sh / 2 + cy - hitSize / 2,
                  width: hitSize,
                  height: hitSize,
                  cursor: getCursor(id),
                }}
                onPointerDown={(e) => startDrag(e, id)}
                onPointerEnter={() => setHoverHandle(id)}
                onPointerLeave={() => setHoverHandle(null)}
              >
                <div
                  style={{ width: size, height: size }}
                  className={`rounded-sm border-2 transition-transform duration-75 ${
                    isGroupActive
                      ? 'bg-white border-green-500 shadow-[0_0_4px_rgba(34,197,94,0.5)]'
                      : isCorner
                        ? 'bg-white border-[#f7b500] shadow-[0_0_4px_rgba(247,181,0,0.5)]'
                        : 'bg-white border-[#f7b500] shadow-[0_0_3px_rgba(247,181,0,0.4)]'
                  } ${isHovered ? 'scale-[1.4]' : ''}`}
                />
              </div>
            );
          })}

          <div
            className="absolute pointer-events-none"
            style={{
              left: sw / 2 - 0.5,
              top: -ROTATION_OFFSET,
              width: 1,
              height: ROTATION_OFFSET,
              background: isGroupActive ? 'rgba(34, 197, 94, 0.6)' : 'rgba(56, 189, 248, 0.6)',
            }}
          />
          <div
            className="absolute pointer-events-auto"
            style={{
              left: sw / 2 - 6,
              top: -ROTATION_OFFSET - 6,
              width: 12,
              height: 12,
              cursor: 'crosshair',
            }}
            onPointerDown={(e) => startDrag(e, 'rotate')}
            onPointerEnter={() => setHoverHandle('rotate')}
            onPointerLeave={() => setHoverHandle(null)}
          >
            <div
              className={`w-full h-full rounded-full border-2 transition-transform duration-75 ${
                isGroupActive
                  ? `border-green-500 ${hoverHandle === 'rotate' ? 'bg-green-500/60 scale-[1.3]' : 'bg-green-500/30'}`
                  : `border-[#f7b500] ${hoverHandle === 'rotate' ? 'bg-[#f7b500]/60 scale-[1.3]' : 'bg-[#f7b500]/30'}`
              }`}
            />
          </div>

          {!isGroupActive && (
            <div
              className="absolute pointer-events-none"
              style={{
                left: sw / 2 + ancSX - 5,
                top: sh / 2 + ancSY - 5,
                width: 10,
                height: 10,
              }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" className="text-[#ffc83d]/80">
                <circle cx="5" cy="5" r="3" fill="none" stroke="currentColor" strokeWidth="1" />
                <line x1="0" y1="5" x2="10" y2="5" stroke="currentColor" strokeWidth="0.5" />
                <line x1="5" y1="0" x2="5" y2="10" stroke="currentColor" strokeWidth="0.5" />
              </svg>
            </div>
          )}
        </div>
      </div>
      )}
      {marquee && <MarqueeRect rect={marquee} sX={sX} sY={sY} />}
    </div>
  );
}

function MarqueeRect({ rect, sX, sY }: { rect: { x: number; y: number; w: number; h: number }; sX: number; sY: number }) {
  const left = Math.min(rect.x, rect.x + rect.w) * sX;
  const top = Math.min(rect.y, rect.y + rect.h) * sY;
  const width = Math.abs(rect.w) * sX;
  const height = Math.abs(rect.h) * sY;
  return (
    <div
      className="absolute pointer-events-none z-50"
      style={{
        left,
        top,
        width,
        height,
        border: '1px solid rgba(56, 189, 248, 0.8)',
        backgroundColor: 'rgba(56, 189, 248, 0.08)',
      }}
    />
  );
}

function getNestedProp(obj: unknown, path: string): { keyframes?: unknown[] } | null {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return null;
    current = (current as Record<string, unknown>)[key];
  }
  return current as { keyframes?: unknown[] } | null;
}

interface OutlinesProps {
  layers: Layer[];
  selection: { selectedIds: string[]; activeId: string | null };
  hoveredLayerId: string | null;
  currentFrame: number;
  sX: number;
  sY: number;
  activeId: string | null;
  compW: number;
  compH: number;
}

function HoverAndSelectionOutlines({ layers, selection, hoveredLayerId, currentFrame, sX, sY, activeId, compW, compH }: OutlinesProps) {
  const outlines: { id: string; x: number; y: number; w: number; h: number; type: 'hover' | 'selected' | 'group-hover' | 'group-selected' }[] = [];

  for (const l of layers) {
    if (!l.visible) continue;
    if (l.id === activeId) continue;

    const isSelected = selection.selectedIds.includes(l.id);
    const isHovered = l.id === hoveredLayerId && !isSelected;

    if (!isSelected && !isHovered) continue;

    if (l.type === 'group') {
      const bounds = computeGroupBounds(l.id, layers, currentFrame);
      const w = bounds.maxX - bounds.minX;
      const h = bounds.maxY - bounds.minY;
      if (w > 0 && h > 0) {
        outlines.push({
          id: l.id,
          x: bounds.centerX,
          y: bounds.centerY,
          w,
          h,
          type: isSelected ? 'group-selected' : 'group-hover',
        });
      }
      continue;
    }

    const bounds = getLayerWorldBounds(l, currentFrame, compW, compH);
    if (!bounds) continue;

    outlines.push({ id: l.id, x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h, type: isSelected ? 'selected' : 'hover' });
  }

  if (outlines.length === 0) return null;

  return (
    <>
      {outlines.map(({ id, x, y, w, h, type }) => {
        const screenX = x * sX;
        const screenY = y * sY;
        const sw = w * sX;
        const sh = h * sY;
        let borderStyle: string;
        switch (type) {
          case 'selected':
            borderStyle = '1.5px solid rgba(56, 189, 248, 0.7)';
            break;
          case 'hover':
            borderStyle = '1px dashed rgba(148, 163, 184, 0.5)';
            break;
          case 'group-selected':
            borderStyle = '1.5px dashed rgba(34, 197, 94, 0.6)';
            break;
          case 'group-hover':
            borderStyle = '1px dashed rgba(34, 197, 94, 0.4)';
            break;
        }
        return (
          <div
            key={id}
            className="absolute pointer-events-none"
            style={{
              left: screenX - sw / 2,
              top: screenY - sh / 2,
              width: sw,
              height: sh,
              border: borderStyle,
              borderRadius: 2,
            }}
          />
        );
      })}
    </>
  );
}
