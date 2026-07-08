import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { useEditorStore } from '../../store/editor';
import { useTimelineStore } from '../../store/timeline';
import type { Layer, AnimatableProperty, ShapeLayer, TextLayer, Keyframe, Vec2 } from '../../core/types';
import {
  frameToPixel,
  pixelToFrame,
  getVisibleFrameRange,
  getRulerTicks,
  getMaxScrollX,
  getFrameWidth,
  formatRulerLabel,
} from './timeline/timeUtils';

const TRACK_HEIGHT = 120;
const ZOOM_SENSITIVITY = 0.002;

interface PropertyDef {
  id: string;
  name: string;
  path: string;
  color: string;
  property: AnimatableProperty;
}

const PROPERTY_COLORS: Record<string, string> = {
  'transform.position': '#ff4444',
  'transform.rotation': '#ffaa00',
  'transform.scale': '#44cc44',
  'transform.opacity': '#aa88ff',
  'transform.anchorPoint': '#ff88cc',
  'shape.width': '#44aaff',
  'shape.height': '#ffcc44',
  'shape.radius': '#44aaff',
  'shape.borderRadius': '#88ddaa',
  'shape.outerRadius': '#44aaff',
  'shape.innerRadius': '#88aaff',
  'shape.strokeWidth': '#cc8844',
  'shape.points': '#dd88cc',
  'text.style.fontSize': '#44aaff',
  'text.style.lineHeight': '#ffcc44',
  'text.style.letterSpacing': '#88ddaa',
  'text.style.strokeWidth': '#cc8844',
};

interface CurvePreset {
  id: string;
  name: string;
  p1: Vec2;
  p2: Vec2;
}

const PRESETS: CurvePreset[] = [
  { id: 'linear', name: 'Linear', p1: [0.25, 0.25], p2: [0.75, 0.75] },
  { id: 'ease-in', name: 'Ease In', p1: [0.42, 0], p2: [1, 1] },
  { id: 'ease-out', name: 'Ease Out', p1: [0, 0], p2: [0.58, 1] },
  { id: 'ease-in-out', name: 'Ease In-Out', p1: [0.42, 0], p2: [0.58, 1] },
  { id: 'cubic-in', name: 'Cubic In', p1: [0.55, 0.055], p2: [0.675, 0.19] },
  { id: 'cubic-out', name: 'Cubic Out', p1: [0.215, 0.61], p2: [0.355, 1] },
  { id: 'cubic-in-out', name: 'Cubic In-Out', p1: [0.645, 0.045], p2: [0.355, 1] },
  { id: 'expo-in', name: 'Expo In', p1: [0.95, 0.05], p2: [0.795, 0.035] },
  { id: 'expo-out', name: 'Expo Out', p1: [0.19, 1], p2: [0.22, 1] },
  { id: 'back-in', name: 'Back In', p1: [0.6, -0.28], p2: [0.735, 0.045] },
  { id: 'back-out', name: 'Back Out', p1: [0.175, 0.885], p2: [0.32, 1.275] },
  { id: 'spring', name: 'Spring', p1: [0.2, 1.4], p2: [0.4, 1] },
];

function extractProperties(layer: Layer): PropertyDef[] {
  const defs: PropertyDef[] = [];

  if (layer.transform.position.valueType === 'vec2') {
    defs.push({ id: 'pos_x', name: 'X', path: 'transform.position', color: PROPERTY_COLORS['transform.position'], property: layer.transform.position });
    defs.push({ id: 'pos_y', name: 'Y', path: 'transform.position', color: '#ff8844', property: layer.transform.position });
  }

  defs.push({ id: 'rotation', name: 'Rotation', path: 'transform.rotation', color: PROPERTY_COLORS['transform.rotation'], property: layer.transform.rotation });

  if (layer.transform.scale.valueType === 'vec2') {
    defs.push({ id: 'scale_x', name: 'ScaleX', path: 'transform.scale', color: PROPERTY_COLORS['transform.scale'], property: layer.transform.scale });
    defs.push({ id: 'scale_y', name: 'ScaleY', path: 'transform.scale', color: '#88ee44', property: layer.transform.scale });
  }

  defs.push({ id: 'opacity', name: 'Opacity', path: 'transform.opacity', color: PROPERTY_COLORS['transform.opacity'], property: layer.transform.opacity });

  if (layer.type === 'shape') {
    const s = (layer as ShapeLayer).shape;
    if (s.type === 'rectangle') {
      defs.push({ id: 'width', name: 'Width', path: 'shape.width', color: PROPERTY_COLORS['shape.width'], property: s.width });
      defs.push({ id: 'height', name: 'Height', path: 'shape.height', color: PROPERTY_COLORS['shape.height'], property: s.height });
    } else if (s.type === 'circle') {
      defs.push({ id: 'radius', name: 'Radius', path: 'shape.radius', color: PROPERTY_COLORS['shape.radius'], property: s.radius });
    } else if (s.type === 'star') {
      defs.push({ id: 'outer_r', name: 'OuterR', path: 'shape.outerRadius', color: PROPERTY_COLORS['shape.outerRadius'], property: s.outerRadius });
      defs.push({ id: 'inner_r', name: 'InnerR', path: 'shape.innerRadius', color: PROPERTY_COLORS['shape.innerRadius'], property: s.innerRadius });
    }
  }

  if (layer.type === 'text') {
    const t = (layer as TextLayer).animOverrides;
    defs.push({ id: 'font_size', name: 'FontSize', path: 'animOverrides.fontSize', color: PROPERTY_COLORS['animOverrides.fontSize'], property: t.fontSize });
  }

  return defs;
}

function extractMotionPathProperties(motionPaths: import('../../core/types').MotionPath[], layerId: string): PropertyDef[] {
  const defs: PropertyDef[] = [];
  const paths = (motionPaths || []).filter((p) => p.layerId === layerId);
  for (const mp of paths) {
    defs.push({ id: `mp_progress_${mp.id}`, name: 'Path %', path: `motionPath.${mp.id}.progress`, color: '#ffcc00', property: mp.progress });
  }
  return defs;
}

function getKeyframeValue(kf: Keyframe, component: 'x' | 'y' | 'single'): number {
  if (typeof kf.value === 'number') return kf.value;
  return component === 'y' ? kf.value[1] : kf.value[0];
}

function cubicBezier(t: number, p1: Vec2, p2: Vec2): number {
  const cx = 3 * p1[0];
  const bx = 3 * (p2[0] - p1[0]) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * p1[1];
  const by = 3 * (p2[1] - p1[1]) - cy;
  const ay = 1 - cy - by;
  let x = t;
  for (let i = 0; i < 8; i++) {
    const xEst = ((ax * x + bx) * x + cx) * x;
    const diff = xEst - t;
    if (Math.abs(diff) < 1e-6) break;
    const dx = (3 * ax * x + 2 * bx) * x + cx;
    if (Math.abs(dx) < 1e-6) break;
    x -= diff / dx;
  }
  return ((ay * x + by) * x + cy) * x;
}

function interpolateAtFrame(keyframes: Keyframe[], frame: number, component: 'x' | 'y' | 'single'): number {
  if (keyframes.length === 0) return 0;
  if (keyframes.length === 1) return getKeyframeValue(keyframes[0], component);
  if (frame <= keyframes[0].frame) return getKeyframeValue(keyframes[0], component);
  if (frame >= keyframes[keyframes.length - 1].frame) return getKeyframeValue(keyframes[keyframes.length - 1], component);

  for (let i = 0; i < keyframes.length - 1; i++) {
    const a = keyframes[i];
    const b = keyframes[i + 1];
    if (frame >= a.frame && frame <= b.frame) {
      const range = b.frame - a.frame;
      if (range === 0) return getKeyframeValue(a, component);
      const t = (frame - a.frame) / range;
      const valA = getKeyframeValue(a, component);
      const valB = getKeyframeValue(b, component);
      if (a.interpolation === 'hold') return valA;
      if (a.interpolation === 'bezier') {
        const eased = cubicBezier(t, a.handleOut, b.handleIn);
        return valA + (valB - valA) * eased;
      }
      return valA + (valB - valA) * t;
    }
  }
  return getKeyframeValue(keyframes[keyframes.length - 1], component);
}

function HandleNumericField({ label, value, onChange, step = 0.05, precision = 2, min, max }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  precision?: number;
  min?: number;
  max?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = () => {
    setDraft(value.toFixed(precision));
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const commit = () => {
    setEditing(false);
    const parsed = parseFloat(draft);
    if (isNaN(parsed)) return;
    let clamped = parsed;
    if (min !== undefined) clamped = Math.max(min, clamped);
    if (max !== undefined) clamped = Math.min(max, clamped);
    onChange(clamped);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') setEditing(false);
  };

  return (
    <div className="flex items-center gap-1">
      <span className="text-[8px] text-slate-500">{label}</span>
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          className="w-[42px] h-[18px] px-1 text-[9px] text-white bg-[#1a2a42] border border-[#3a4055] rounded outline-none focus:border-[#facc15] font-mono text-center"
          autoFocus
        />
      ) : (
        <button
          onClick={startEdit}
          className="w-[42px] h-[18px] px-1 text-[9px] text-slate-300 bg-[#141822] border border-[#243a5c] rounded font-mono text-center hover:border-[#3a4055] hover:text-white transition-colors"
        >
          {value.toFixed(precision)}
        </button>
      )}
    </div>
  );
}

export function InterpolationGraph() {
  const composition = useEditorStore((s) => s.composition);
  const selection = useEditorStore((s) => s.selection);
  const updateLayerProperty = useEditorStore((s) => s.updateLayerProperty);

  const currentFrame = useTimelineStore((s) => s.currentFrame);
  const zoomLevel = useTimelineStore((s) => s.zoomLevel);
  const scrollX = useTimelineStore((s) => s.scrollX);
  const scrubTo = useTimelineStore((s) => s.scrubTo);
  const setScrollX = useTimelineStore((s) => s.setScrollX);
  const zoomAtCursor = useTimelineStore((s) => s.zoomAtCursor);
  const durationFrames = composition.settings.durationFrames;
  const frameRate = composition.settings.frameRate;

  const activeLayer = selection.activeId
    ? composition.layers.find((l) => l.id === selection.activeId) ?? null
    : null;

  const [enabledProps, setEnabledProps] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; trackId: string; kfFrame: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(500);
  const selectCurvePoints = useEditorStore((s) => s.selectCurvePoints);
  const selectedCurvePoints = useEditorStore((s) => s.selection.selectedCurvePoints);

  // Graph marquee selection
  const [graphMarquee, setGraphMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const graphMarqueeRef = useRef<{ startX: number; startY: number; active: boolean; lastIds: string } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      setContainerWidth(entries[0].contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const allProperties = useMemo(() => {
    if (!activeLayer || activeLayer.type === 'group') return [];
    const layerProps = extractProperties(activeLayer);
    const mpProps = extractMotionPathProperties(composition.motionPaths, activeLayer.id);
    return [...layerProps, ...mpProps];
  }, [activeLayer, composition.motionPaths]);

  // Auto-enable all properties when layer changes
  useEffect(() => {
    if (allProperties.length === 0) {
      setEnabledProps(new Set());
      return;
    }
    setEnabledProps(new Set(allProperties.map((p) => p.id)));
  }, [activeLayer?.id]);

  const visibleTracks = useMemo(() => {
    return allProperties.filter((p) => enabledProps.has(p.id));
  }, [allProperties, enabledProps]);

  const toggleProp = useCallback((id: string) => {
    setEnabledProps((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleScrub = useCallback((e: React.MouseEvent | MouseEvent) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const frame = pixelToFrame(x, zoomLevel, scrollX);
    scrubTo(Math.max(0, Math.min(frame, durationFrames - 1)));
  }, [zoomLevel, scrollX, scrubTo, durationFrames]);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;

    if (e.ctrlKey || e.metaKey) {
      // Zoom
      const factor = Math.exp(-e.deltaY * ZOOM_SENSITIVITY);
      zoomAtCursor(cursorX, factor);
    } else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      // Horizontal scroll (shift+wheel or trackpad horizontal gesture)
      const maxScroll = getMaxScrollX(durationFrames, zoomLevel, containerWidth);
      const dx = e.shiftKey ? e.deltaY : e.deltaX;
      const newScrollX = Math.max(0, Math.min(maxScroll, scrollX + dx * 2));
      setScrollX(newScrollX);
    } else {
      // Vertical scroll -- scroll the tracks container vertically
      el.scrollTop += e.deltaY;
    }
  }, [zoomLevel, scrollX, durationFrames, containerWidth, setScrollX, zoomAtCursor]);

  // Attach wheel handler as non-passive native event to allow preventDefault
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const handleContextMenu = useCallback((e: React.MouseEvent, trackId: string, kfFrame: number) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, trackId, kfFrame });
  }, []);

  const applyPreset = useCallback((preset: CurvePreset) => {
    if (!contextMenu || !activeLayer) { setContextMenu(null); return; }
    const propDef = allProperties.find((p) => p.id === contextMenu.trackId);
    if (!propDef) { setContextMenu(null); return; }

    const kfIndex = propDef.property.keyframes.findIndex((k) => k.frame === contextMenu.kfFrame);
    if (kfIndex >= 0) {
      const newKeyframes = [...propDef.property.keyframes];
      newKeyframes[kfIndex] = { ...newKeyframes[kfIndex], handleOut: preset.p1, interpolation: 'bezier' };
      if (kfIndex + 1 < newKeyframes.length) {
        newKeyframes[kfIndex + 1] = { ...newKeyframes[kfIndex + 1], handleIn: preset.p2 };
      }
      updateLayerProperty(activeLayer.id, `${propDef.path}.keyframes`, newKeyframes);
    }
    setContextMenu(null);
  }, [contextMenu, activeLayer, allProperties, updateLayerProperty]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [contextMenu]);

  // Graph marquee handlers
  const handleGraphPointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('circle')) return;
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    graphMarqueeRef.current = { startX: e.clientX - rect.left, startY: e.clientY - rect.top, active: false, lastIds: '' };
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    if (!additive) selectCurvePoints([]);
  }, [selectCurvePoints]);

  useEffect(() => {
    if (!graphMarqueeRef.current) return;

    const handleMove = (e: PointerEvent) => {
      const m = graphMarqueeRef.current;
      if (!m) return;
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const dx = x - m.startX;
      const dy = y - m.startY;
      if (!m.active && Math.sqrt(dx * dx + dy * dy) < 4) return;
      m.active = true;

      const mRect = {
        x: Math.min(m.startX, x),
        y: Math.min(m.startY, y),
        w: Math.abs(dx),
        h: Math.abs(dy),
      };
      setGraphMarquee(mRect);

      // Hit test keyframe dots: each track occupies TRACK_HEIGHT vertically
      const hits: string[] = [];
      for (let i = 0; i < visibleTracks.length; i++) {
        const prop = visibleTracks[i];
        const trackTop = i * TRACK_HEIGHT;
        const kfs = prop.property.keyframes;
        if (kfs.length === 0) continue;

        const values = kfs.map((kf) => getKeyframeValue(kf, prop.id.endsWith('_y') || prop.id === 'scale_y' ? 'y' : prop.id.endsWith('_x') || prop.id === 'pos_x' || prop.id === 'scale_x' ? 'x' : 'single'));
        let minV = Math.min(...values);
        let maxV = Math.max(...values);
        if (minV === maxV) { minV -= 50; maxV += 50; }
        const pad = (maxV - minV) * 0.15;
        minV -= pad; maxV += pad;
        const valRange = maxV - minV;

        for (const kf of kfs) {
          const kx = frameToPixel(kf.frame, zoomLevel, scrollX);
          const component = prop.id.endsWith('_y') || prop.id === 'scale_y' ? 'y' : prop.id.endsWith('_x') || prop.id === 'pos_x' || prop.id === 'scale_x' ? 'x' : 'single';
          const val = getKeyframeValue(kf, component);
          const ky = trackTop + TRACK_HEIGHT - 20 - ((val - minV) / valRange) * (TRACK_HEIGHT - 40);

          if (kx >= mRect.x && kx <= mRect.x + mRect.w && ky >= mRect.y && ky <= mRect.y + mRect.h) {
            hits.push(`${prop.id}_${kf.frame}`);
          }
        }
      }

      const key = hits.join(',');
      if (key !== m.lastIds) {
        m.lastIds = key;
        selectCurvePoints(hits);
      }
    };

    const handleUp = () => {
      graphMarqueeRef.current = null;
      setGraphMarquee(null);
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [graphMarquee === null && graphMarqueeRef.current !== null]);

  // Find selected keyframe data for numeric editing
  const selectedKeyframeData = useMemo(() => {
    if (selectedCurvePoints.length === 0) return null;
    const pointId = selectedCurvePoints[0];
    const lastUnderscore = pointId.lastIndexOf('_');
    if (lastUnderscore === -1) return null;
    const propId = pointId.substring(0, lastUnderscore);
    const frame = parseInt(pointId.substring(lastUnderscore + 1), 10);
    if (isNaN(frame)) return null;

    const propDef = allProperties.find((p) => p.id === propId);
    if (!propDef) return null;
    const kfIndex = propDef.property.keyframes.findIndex((k) => k.frame === frame);
    if (kfIndex < 0) return null;

    const kf = propDef.property.keyframes[kfIndex];
    const hasNext = kfIndex < propDef.property.keyframes.length - 1;
    const hasPrev = kfIndex > 0;

    return { propDef, kfIndex, kf, hasNext, hasPrev, propId };
  }, [selectedCurvePoints, allProperties]);

  const updateHandleValue = useCallback((type: 'in' | 'out', axis: 0 | 1, value: number) => {
    if (!selectedKeyframeData || !activeLayer) return;
    const { propDef, kfIndex, kf } = selectedKeyframeData;
    const newKeyframes = [...propDef.property.keyframes];
    if (type === 'out') {
      const newHandle: Vec2 = [...kf.handleOut];
      newHandle[axis] = value;
      newKeyframes[kfIndex] = { ...newKeyframes[kfIndex], handleOut: newHandle, interpolation: 'bezier' };
    } else {
      const newHandle: Vec2 = [...kf.handleIn];
      newHandle[axis] = value;
      newKeyframes[kfIndex] = { ...newKeyframes[kfIndex], handleIn: newHandle };
    }
    updateLayerProperty(activeLayer.id, `${propDef.path}.keyframes`, newKeyframes);
  }, [selectedKeyframeData, activeLayer, updateLayerProperty]);

  const updateKeyframeValue = useCallback((value: number) => {
    if (!selectedKeyframeData || !activeLayer) return;
    const { propDef, kfIndex, kf } = selectedKeyframeData;
    const component: 'x' | 'y' | 'single' = propDef.id.endsWith('_y') || propDef.id === 'scale_y' ? 'y'
      : propDef.id.endsWith('_x') || propDef.id === 'pos_x' || propDef.id === 'scale_x' ? 'x' : 'single';
    const newKeyframes = [...propDef.property.keyframes];
    if (component === 'single' || typeof kf.value === 'number') {
      newKeyframes[kfIndex] = { ...kf, value };
    } else {
      const newVal: Vec2 = [...kf.value as Vec2];
      if (component === 'x') newVal[0] = value;
      else newVal[1] = value;
      newKeyframes[kfIndex] = { ...kf, value: newVal };
    }
    updateLayerProperty(activeLayer.id, `${propDef.path}.keyframes`, newKeyframes);
  }, [selectedKeyframeData, activeLayer, updateLayerProperty]);

  const visibleRange = getVisibleFrameRange(containerWidth, zoomLevel, scrollX);
  const ticks = getRulerTicks(visibleRange, zoomLevel);
  const playheadX = frameToPixel(currentFrame, zoomLevel, scrollX);

  if (!activeLayer || activeLayer.type === 'group') {
    return (
      <div className="flex flex-col h-full bg-[#081220]">
        <div className="h-[28px] min-h-[28px] flex items-center px-3 border-b border-[#1a2a42] bg-[#081220]">
          <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider">Graph Editor</span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <span className="text-[11px] text-slate-600">Select a layer to view curves</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#081220] relative">
      {/* Property toggle bar */}
      <div className="h-[28px] min-h-[28px] flex items-center px-3 gap-3 border-b border-[#1a2a42] bg-[#081220] overflow-x-auto">
        <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider flex-shrink-0">Curves</span>
        {allProperties.map((prop) => {
          const active = enabledProps.has(prop.id);
          return (
            <button
              key={prop.id}
              onClick={() => toggleProp(prop.id)}
              className={`flex items-center flex-shrink-0 transition-all ${active ? 'opacity-100' : 'opacity-40 hover:opacity-70'}`}
            >
              <span className="text-[9px] text-slate-300">{prop.name}</span>
            </button>
          );
        })}
      </div>

      {/* Numeric handle editor (visible when a keyframe is selected) */}
      {selectedKeyframeData && (
        <div className="h-[30px] min-h-[30px] flex items-center px-3 gap-4 border-b border-[#1a2a42] bg-[#0d1018]">
          <HandleNumericField
            label="Value"
            value={getKeyframeValue(selectedKeyframeData.kf, selectedKeyframeData.propId.endsWith('_y') || selectedKeyframeData.propId === 'scale_y' ? 'y' : selectedKeyframeData.propId.endsWith('_x') || selectedKeyframeData.propId === 'pos_x' || selectedKeyframeData.propId === 'scale_x' ? 'x' : 'single')}
            onChange={updateKeyframeValue}
            step={1}
            precision={1}
          />
          <span className="text-[8px] text-slate-600">|</span>
          {selectedKeyframeData.hasNext && (
            <>
              <span className="text-[8px] text-slate-500 uppercase">Out</span>
              <HandleNumericField
                label="X"
                value={selectedKeyframeData.kf.handleOut[0]}
                onChange={(v) => updateHandleValue('out', 0, v)}
                step={0.05}
                precision={2}
                min={0}
                max={1}
              />
              <HandleNumericField
                label="Y"
                value={selectedKeyframeData.kf.handleOut[1]}
                onChange={(v) => updateHandleValue('out', 1, v)}
                step={0.05}
                precision={2}
                min={-2}
                max={3}
              />
            </>
          )}
          {selectedKeyframeData.hasPrev && (
            <>
              <span className="text-[8px] text-slate-500 uppercase">In</span>
              <HandleNumericField
                label="X"
                value={selectedKeyframeData.kf.handleIn[0]}
                onChange={(v) => updateHandleValue('in', 0, v)}
                step={0.05}
                precision={2}
                min={0}
                max={1}
              />
              <HandleNumericField
                label="Y"
                value={selectedKeyframeData.kf.handleIn[1]}
                onChange={(v) => updateHandleValue('in', 1, v)}
                step={0.05}
                precision={2}
                min={-2}
                max={3}
              />
            </>
          )}
        </div>
      )}

      {/* Tracks area */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden relative"
        onPointerDown={handleGraphPointerDown}
      >
        {visibleTracks.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-[10px] text-slate-600">Enable properties above to view curves</span>
          </div>
        ) : (
          visibleTracks.map((prop) => (
            <PropertyTrackRow
              key={prop.id}
              prop={prop}
              containerWidth={containerWidth}
              zoomLevel={zoomLevel}
              scrollX={scrollX}
              ticks={ticks}
              playheadX={playheadX}
              currentFrame={currentFrame}
              durationFrames={durationFrames}
              frameRate={frameRate}
              onScrub={handleScrub}
              onContextMenu={handleContextMenu}
              selectedCurvePoints={selectedCurvePoints}
              selectedKeyframes={selection.selectedKeyframes}
              onSelectPoint={selectCurvePoints}
              activeLayerId={activeLayer?.id ?? null}
              propertyPath={prop.path}
              updateLayerProperty={updateLayerProperty}
            />
          ))
        )}

        {/* Graph marquee */}
        {graphMarquee && (
          <div
            className="absolute z-30 pointer-events-none"
            style={{
              left: graphMarquee.x,
              top: graphMarquee.y,
              width: graphMarquee.w,
              height: graphMarquee.h,
              border: '1px solid rgba(56, 189, 248, 0.8)',
              backgroundColor: 'rgba(56, 189, 248, 0.06)',
            }}
          />
        )}
      </div>

      {/* Context menu for presets */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-[#1a1e28] border border-[#243a5c] rounded shadow-xl py-1 min-w-[140px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-2 py-1 text-[8px] text-slate-600 uppercase tracking-wider">Easing Presets</div>
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => applyPreset(preset)}
              className="w-full px-3 py-1.5 text-left text-[10px] text-slate-300 hover:bg-[#243a5c] hover:text-white transition-colors"
            >
              {preset.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface PropertyTrackRowProps {
  prop: PropertyDef;
  containerWidth: number;
  zoomLevel: number;
  scrollX: number;
  ticks: { frame: number; major: boolean }[];
  playheadX: number;
  currentFrame: number;
  durationFrames: number;
  frameRate: number;
  onScrub: (e: React.MouseEvent | MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent, trackId: string, kfFrame: number) => void;
  selectedCurvePoints: string[];
  selectedKeyframes: string[];
  onSelectPoint: (ids: string[], additive?: boolean) => void;
  activeLayerId: string | null;
  propertyPath: string;
  updateLayerProperty: (layerId: string, path: string, value: unknown) => void;
}

function PropertyTrackRow({ prop, containerWidth, zoomLevel, scrollX, ticks, playheadX, currentFrame, durationFrames, frameRate, onScrub, onContextMenu, selectedCurvePoints, selectedKeyframes, onSelectPoint, activeLayerId, propertyPath, updateLayerProperty }: PropertyTrackRowProps) {
  const keyframes = prop.property.keyframes;
  const component: 'x' | 'y' | 'single' = prop.id.endsWith('_y') || prop.id === 'scale_y' ? 'y'
    : prop.id.endsWith('_x') || prop.id === 'pos_x' || prop.id === 'scale_x' ? 'x' : 'single';

  const svgRef = useRef<SVGSVGElement>(null);

  // Compute value range for this property
  const values = keyframes.length > 0
    ? keyframes.map((kf) => getKeyframeValue(kf, component))
    : [typeof prop.property.defaultValue === 'number' ? prop.property.defaultValue : (component === 'y' ? (prop.property.defaultValue as Vec2)[1] : (prop.property.defaultValue as Vec2)[0])];
  let minVal = Math.min(...values);
  let maxVal = Math.max(...values);
  if (minVal === maxVal) {
    minVal -= 50;
    maxVal += 50;
  }
  const padding = (maxVal - minVal) * 0.15;
  minVal -= padding;
  maxVal += padding;
  const valRange = maxVal - minVal;

  const valueToY = useCallback((v: number) => {
    return TRACK_HEIGHT - 20 - ((v - minVal) / valRange) * (TRACK_HEIGHT - 40);
  }, [minVal, valRange]);

  // Generate curve path with sub-frame sampling for smooth bezier curves
  const curvePath = useMemo(() => {
    const startFrame = Math.max(0, Math.floor(scrollX / getFrameWidth(zoomLevel)) - 2);
    const endFrame = Math.min(durationFrames, Math.ceil((scrollX + containerWidth) / getFrameWidth(zoomLevel)) + 2);

    if (keyframes.length === 0) {
      const defaultVal = typeof prop.property.defaultValue === 'number'
        ? prop.property.defaultValue
        : (component === 'y' ? (prop.property.defaultValue as Vec2)[1] : (prop.property.defaultValue as Vec2)[0]);
      const py = valueToY(defaultVal);
      return `M${frameToPixel(startFrame, zoomLevel, scrollX).toFixed(1)},${py.toFixed(1)} L${frameToPixel(endFrame, zoomLevel, scrollX).toFixed(1)},${py.toFixed(1)}`;
    }

    if (keyframes.length === 1) {
      const val = getKeyframeValue(keyframes[0], component);
      const py = valueToY(val);
      return `M${frameToPixel(startFrame, zoomLevel, scrollX).toFixed(1)},${py.toFixed(1)} L${frameToPixel(endFrame, zoomLevel, scrollX).toFixed(1)},${py.toFixed(1)}`;
    }

    // Use sub-frame sampling for smooth curves. Sample at ~3px density.
    const frameWidth = getFrameWidth(zoomLevel);
    const step = Math.max(0.1, 3 / frameWidth);
    const points: string[] = [];
    let first = true;
    for (let f = startFrame; f <= endFrame; f += step) {
      const val = interpolateAtFrame(keyframes, f, component);
      const px = frameToPixel(f, zoomLevel, scrollX);
      const py = valueToY(val);
      points.push(`${first ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`);
      first = false;
    }
    // Ensure we end exactly at endFrame
    if (points.length > 0) {
      const lastVal = interpolateAtFrame(keyframes, endFrame, component);
      const lastPx = frameToPixel(endFrame, zoomLevel, scrollX);
      const lastPy = valueToY(lastVal);
      points.push(`L${lastPx.toFixed(1)},${lastPy.toFixed(1)}`);
    }
    return points.join(' ');
  }, [keyframes, zoomLevel, scrollX, containerWidth, durationFrames, component, valueToY]);

  const handleRulerDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    onScrub(e);
    const onMove = (ev: MouseEvent) => onScrub(ev);
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [onScrub]);

  const handleKeyframeClick = useCallback((e: React.MouseEvent, kfFrame: number) => {
    e.stopPropagation();
    const pointId = `${prop.id}_${kfFrame}`;
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    onSelectPoint([pointId], additive);
  }, [prop.id, onSelectPoint]);

  // Correct bezier handle drag using proper coordinate mapping.
  // The handle coordinates (handleOut/handleIn) are in normalized segment space:
  //   P1 = handleOut of keyframe A (for segment A->B)
  //   P2 = handleIn of keyframe B (for segment A->B)
  // Both use [0,1] x [-inf,+inf] where X is time fraction, Y is value progress fraction.
  const handleHandleDown = useCallback((e: React.MouseEvent, kfIndex: number, type: 'in' | 'out') => {
    e.stopPropagation();
    e.preventDefault();
    if (!activeLayerId || !svgRef.current) return;

    const svgRect = svgRef.current.getBoundingClientRect();

    // Determine the segment endpoints in pixel space
    let segStartX: number, segStartY: number, segEndX: number, segEndY: number;

    if (type === 'out') {
      // handleOut belongs to segment from kf[kfIndex] to kf[kfIndex+1]
      const kfA = keyframes[kfIndex];
      const kfB = keyframes[kfIndex + 1];
      if (!kfB) return;
      segStartX = frameToPixel(kfA.frame, zoomLevel, scrollX);
      segStartY = valueToY(getKeyframeValue(kfA, component));
      segEndX = frameToPixel(kfB.frame, zoomLevel, scrollX);
      segEndY = valueToY(getKeyframeValue(kfB, component));
    } else {
      // handleIn belongs to segment from kf[kfIndex-1] to kf[kfIndex]
      const kfA = keyframes[kfIndex - 1];
      const kfB = keyframes[kfIndex];
      if (!kfA) return;
      segStartX = frameToPixel(kfA.frame, zoomLevel, scrollX);
      segStartY = valueToY(getKeyframeValue(kfA, component));
      segEndX = frameToPixel(kfB.frame, zoomLevel, scrollX);
      segEndY = valueToY(getKeyframeValue(kfB, component));
    }

    const segW = segEndX - segStartX;
    const segH = segEndY - segStartY;

    const onMove = (ev: MouseEvent) => {
      // Convert mouse position to SVG-local pixel coordinates
      const px = ev.clientX - svgRect.left;
      const py = ev.clientY - svgRect.top;

      // Convert pixel position to normalized segment coordinates
      let nx: number, ny: number;
      if (Math.abs(segW) < 1) {
        nx = type === 'out' ? 0.33 : 0.67;
      } else {
        nx = (px - segStartX) / segW;
      }
      if (Math.abs(segH) < 1) {
        // Same value at both ends: interpret Y as deviation from flat
        // Use a fixed pixel-to-normalized scale
        ny = -(py - segStartY) / 50;
      } else {
        ny = (py - segStartY) / segH;
      }

      // Clamp X to valid range [0, 1] (time can't go backwards)
      nx = Math.max(0, Math.min(1, nx));
      // Y can exceed [0,1] for overshoot, clamp to reasonable range
      ny = Math.max(-2, Math.min(3, ny));

      const newHandle: Vec2 = [nx, ny];
      const newKeyframes = [...keyframes];
      if (type === 'out') {
        newKeyframes[kfIndex] = { ...newKeyframes[kfIndex], handleOut: newHandle, interpolation: 'bezier' };
      } else {
        newKeyframes[kfIndex] = { ...newKeyframes[kfIndex], handleIn: newHandle };
      }
      updateLayerProperty(activeLayerId, `${propertyPath}.keyframes`, newKeyframes);
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [keyframes, activeLayerId, propertyPath, updateLayerProperty, zoomLevel, scrollX, valueToY, component]);

  // Determine which keyframes are selected to show handles
  const selectedKfIndices = useMemo(() => {
    const indices: number[] = [];
    for (let i = 0; i < keyframes.length; i++) {
      const pointId = `${prop.id}_${keyframes[i].frame}`;
      const isSelected = selectedCurvePoints.includes(pointId) ||
        selectedKeyframes.some((sk) => pointId === sk || pointId.startsWith(sk.split('_')[0] + '_') && pointId.endsWith('_' + keyframes[i].frame));
      if (isSelected) indices.push(i);
    }
    return indices;
  }, [keyframes, selectedCurvePoints, selectedKeyframes, prop.id]);

  // Fixed perpendicular nudge (in pixels) for near-linear handles
  const HANDLE_LINEAR_NUDGE = 18;
  // Tolerance: handle is considered "on the line" if within this many pixels
  const HANDLE_LINEAR_TOLERANCE = 3;

  const computeHandlePixel = useCallback((kfIndex: number, type: 'in' | 'out'): { x: number; y: number } | null => {
    let ax: number, ay: number, bx: number, by: number, handle: Vec2;

    if (type === 'out') {
      const kfA = keyframes[kfIndex];
      const kfB = keyframes[kfIndex + 1];
      if (!kfB) return null;
      ax = frameToPixel(kfA.frame, zoomLevel, scrollX);
      ay = valueToY(getKeyframeValue(kfA, component));
      bx = frameToPixel(kfB.frame, zoomLevel, scrollX);
      by = valueToY(getKeyframeValue(kfB, component));
      handle = kfA.handleOut;
    } else {
      const kfA = keyframes[kfIndex - 1];
      const kfB = keyframes[kfIndex];
      if (!kfA) return null;
      ax = frameToPixel(kfA.frame, zoomLevel, scrollX);
      ay = valueToY(getKeyframeValue(kfA, component));
      bx = frameToPixel(kfB.frame, zoomLevel, scrollX);
      by = valueToY(getKeyframeValue(kfB, component));
      handle = kfB.handleIn;
    }

    // True handle position in pixel space
    const hx = ax + handle[0] * (bx - ax);
    const hy = ay + handle[1] * (by - ay);

    // Segment direction vector
    const segDx = bx - ax;
    const segDy = by - ay;
    const segLen = Math.sqrt(segDx * segDx + segDy * segDy);

    if (segLen < 1) return { x: hx, y: hy - HANDLE_LINEAR_NUDGE };

    // Unit perpendicular (rotated 90 degrees CCW from segment direction)
    const perpX = -segDy / segLen;
    const perpY = segDx / segLen;

    // Vector from the handle's anchor keyframe to the handle point
    const anchorX = type === 'out' ? ax : bx;
    const anchorY = type === 'out' ? ay : by;
    const toHandleX = hx - anchorX;
    const toHandleY = hy - anchorY;

    // Perpendicular distance from handle to segment line
    const perpDist = toHandleX * perpX + toHandleY * perpY;

    // Only apply a fixed nudge when the handle is essentially ON the line.
    // Once the user drags it off (past tolerance), show at true position.
    if (Math.abs(perpDist) > HANDLE_LINEAR_TOLERANCE) {
      return { x: hx, y: hy };
    }

    // Handle is on/near the line -- apply a fixed perpendicular nudge
    return {
      x: hx + perpX * HANDLE_LINEAR_NUDGE,
      y: hy + perpY * HANDLE_LINEAR_NUDGE,
    };
  }, [keyframes, zoomLevel, scrollX, valueToY, component]);

  return (
    <div className="border-b border-[#1a2a42] relative" style={{ height: TRACK_HEIGHT }}>
      {/* Label on left */}
      <div className="absolute left-0 top-0 bottom-0 w-[50px] flex items-center z-10 pointer-events-none">
        <div className="flex items-center pl-2">
          <span className="text-[9px] font-medium text-slate-400 truncate">{prop.name}</span>
        </div>
      </div>

      {/* Value scale on left */}
      <div className="absolute left-[50px] top-0 bottom-0 w-[30px] flex flex-col justify-between py-3 pointer-events-none z-10">
        <span className="text-[7px] text-slate-600 font-mono">{Math.round(maxVal)}</span>
        <span className="text-[7px] text-slate-600 font-mono">{Math.round((maxVal + minVal) / 2)}</span>
        <span className="text-[7px] text-slate-600 font-mono">{Math.round(minVal)}</span>
      </div>

      {/* Track area */}
      <svg
        ref={svgRef}
        className="absolute inset-0 w-full h-full cursor-col-resize"
        onMouseDown={handleRulerDown}
      >
        {/* Grid lines (vertical time markers) */}
        {ticks.map((tick) => {
          const x = frameToPixel(tick.frame, zoomLevel, scrollX);
          if (x < 0 || x > containerWidth) return null;
          return (
            <line
              key={tick.frame}
              x1={x}
              y1={0}
              x2={x}
              y2={TRACK_HEIGHT}
              stroke={tick.major ? '#1c3155' : '#151820'}
              strokeWidth={tick.major ? 0.8 : 0.4}
            />
          );
        })}

        {/* Horizontal center line */}
        <line x1={0} y1={TRACK_HEIGHT / 2} x2={containerWidth} y2={TRACK_HEIGHT / 2} stroke="#1a2a42" strokeWidth={0.5} />

        {/* Curve */}
        {curvePath && (
          <path d={curvePath} fill="none" stroke="#ffffff" strokeWidth={1.5} strokeLinecap="round" opacity={0.85} />
        )}

        {/* Bezier handles for selected keyframes */}
        {selectedKfIndices.map((kfIdx) => {
          const kf = keyframes[kfIdx];
          const kfX = frameToPixel(kf.frame, zoomLevel, scrollX);
          const kfY = valueToY(getKeyframeValue(kf, component));

          const handles: JSX.Element[] = [];

          // handleOut: control point P1 for segment kf[kfIdx] -> kf[kfIdx+1]
          const outPos = computeHandlePixel(kfIdx, 'out');
          if (outPos) {
            handles.push(
              <g key={`out-${kf.frame}`}>
                <line x1={kfX} y1={kfY} x2={outPos.x} y2={outPos.y} stroke="#facc15" strokeWidth={1} opacity={0.8} />
                <circle
                  cx={outPos.x} cy={outPos.y} r={4.5}
                  fill="#facc15" stroke="#000" strokeWidth={0.8}
                  className="cursor-grab active:cursor-grabbing"
                  onMouseDown={(e) => handleHandleDown(e, kfIdx, 'out')}
                />
              </g>
            );
          }

          // handleIn: control point P2 for segment kf[kfIdx-1] -> kf[kfIdx]
          const inPos = computeHandlePixel(kfIdx, 'in');
          if (inPos) {
            handles.push(
              <g key={`in-${kf.frame}`}>
                <line x1={kfX} y1={kfY} x2={inPos.x} y2={inPos.y} stroke="#facc15" strokeWidth={1} opacity={0.8} />
                <circle
                  cx={inPos.x} cy={inPos.y} r={4.5}
                  fill="#facc15" stroke="#000" strokeWidth={0.8}
                  className="cursor-grab active:cursor-grabbing"
                  onMouseDown={(e) => handleHandleDown(e, kfIdx, 'in')}
                />
              </g>
            );
          }

          return <g key={`handles-${kf.frame}`}>{handles}</g>;
        })}

        {/* Keyframe diamonds */}
        {keyframes.map((kf) => {
          const x = frameToPixel(kf.frame, zoomLevel, scrollX);
          if (x < -10 || x > containerWidth + 10) return null;
          const val = getKeyframeValue(kf, component);
          const y = valueToY(val);
          const pointId = `${prop.id}_${kf.frame}`;
          const isSelected = selectedCurvePoints.includes(pointId) ||
            selectedKeyframes.some((sk) => pointId === sk || pointId.startsWith(sk.split('_')[0] + '_') && pointId.endsWith('_' + kf.frame));
          const s = isSelected ? 6 : 5;
          return (
            <g key={kf.frame}>
              <rect
                x={x - s}
                y={y - s}
                width={s * 2}
                height={s * 2}
                transform={`rotate(45 ${x} ${y})`}
                fill={isSelected ? '#22c55e' : '#facc15'}
                stroke={isSelected ? '#166534' : '#000000'}
                strokeWidth={isSelected ? 2 : 1}
                className="cursor-pointer"
                onContextMenu={(e) => {
                  e.stopPropagation();
                  onContextMenu(e as unknown as React.MouseEvent, prop.id, kf.frame);
                }}
                onMouseDown={(e) => handleKeyframeClick(e, kf.frame)}
              />
              <text x={x} y={y - 10} textAnchor="middle" fill="#aaa" fontSize={8} className="pointer-events-none select-none">
                {Math.round(val)}
              </text>
            </g>
          );
        })}

        {/* Playhead */}
        {playheadX >= 0 && playheadX <= containerWidth && (
          <line x1={playheadX} y1={0} x2={playheadX} y2={TRACK_HEIGHT} stroke="#ffcc00" strokeWidth={1} />
        )}
      </svg>
    </div>
  );
}
