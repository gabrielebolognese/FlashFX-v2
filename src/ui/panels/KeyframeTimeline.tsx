import { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import { useEditorStore } from '../../store/editor';
import { useTimelineStore } from '../../store/timeline';
import { ChevronDown, ChevronRight, Plus, Diamond, Magnet } from 'lucide-react';
import type { Layer, AnimatableProperty, ShapeLayer, TextLayer, AudioLayer } from '../../core/types';
import { findNearestKeyframeFrame } from '../../core/timelineSnap';
import { useContextMenu } from '../context-menu';
import { buildKeyframeMenu } from '../context-menu/menuDefinitions';
import {
  frameToPixel,
  pixelToFrame,
  getVisibleFrameRange,
  getRulerTicks,
  getMaxScrollX,
  formatRulerLabel,
} from './timeline/timeUtils';

const ROW_HEIGHT = 22;
const GROUP_ROW_HEIGHT = 24;
const ZOOM_SENSITIVITY = 0.002;

interface PropertyTrack {
  id: string;
  name: string;
  propertyPath: string;
  property: AnimatableProperty;
  groupId: string;
}

interface PropertyGroup {
  id: string;
  name: string;
  tracks: PropertyTrack[];
}

function extractAnimatableProperties(layer: Layer): PropertyGroup[] {
  const groups: PropertyGroup[] = [];

  const transformGroup: PropertyGroup = {
    id: 'transform',
    name: 'Transform',
    tracks: [
      { id: 'pos', name: 'Position', propertyPath: 'transform.position', property: layer.transform.position, groupId: 'transform' },
      { id: 'rot', name: 'Rotation', propertyPath: 'transform.rotation', property: layer.transform.rotation, groupId: 'transform' },
      { id: 'scale', name: 'Scale', propertyPath: 'transform.scale', property: layer.transform.scale, groupId: 'transform' },
      { id: 'anchor', name: 'Anchor Point', propertyPath: 'transform.anchorPoint', property: layer.transform.anchorPoint, groupId: 'transform' },
      { id: 'opacity', name: 'Opacity', propertyPath: 'transform.opacity', property: layer.transform.opacity, groupId: 'transform' },
    ],
  };
  groups.push(transformGroup);

  if (layer.type === 'shape') {
    const sl = layer as ShapeLayer;
    const shapeGroup: PropertyGroup = { id: 'shape', name: 'Shape', tracks: [] };

    switch (sl.shape.type) {
      case 'rectangle':
        shapeGroup.tracks.push(
          { id: 'sh_w', name: 'Width', propertyPath: 'shape.width', property: sl.shape.width, groupId: 'shape' },
          { id: 'sh_h', name: 'Height', propertyPath: 'shape.height', property: sl.shape.height, groupId: 'shape' },
          { id: 'sh_sw', name: 'Stroke Width', propertyPath: 'shape.strokeWidth', property: sl.shape.strokeWidth, groupId: 'shape' },
          { id: 'sh_br', name: 'Border Radius', propertyPath: 'shape.borderRadius', property: sl.shape.borderRadius, groupId: 'shape' },
        );
        break;
      case 'circle':
        shapeGroup.tracks.push(
          { id: 'sh_r', name: 'Radius', propertyPath: 'shape.radius', property: sl.shape.radius, groupId: 'shape' },
          { id: 'sh_sw', name: 'Stroke Width', propertyPath: 'shape.strokeWidth', property: sl.shape.strokeWidth, groupId: 'shape' },
        );
        break;
      case 'star':
        shapeGroup.tracks.push(
          { id: 'sh_pts', name: 'Points', propertyPath: 'shape.points', property: sl.shape.points, groupId: 'shape' },
          { id: 'sh_or', name: 'Outer Radius', propertyPath: 'shape.outerRadius', property: sl.shape.outerRadius, groupId: 'shape' },
          { id: 'sh_ir', name: 'Inner Radius', propertyPath: 'shape.innerRadius', property: sl.shape.innerRadius, groupId: 'shape' },
          { id: 'sh_sw', name: 'Stroke Width', propertyPath: 'shape.strokeWidth', property: sl.shape.strokeWidth, groupId: 'shape' },
        );
        break;
      case 'polygon':
        shapeGroup.tracks.push(
          { id: 'sh_sw', name: 'Stroke Width', propertyPath: 'shape.strokeWidth', property: sl.shape.strokeWidth, groupId: 'shape' },
        );
        break;
    }
    if (shapeGroup.tracks.length > 0) groups.push(shapeGroup);
  }

  if (layer.type === 'text') {
    const tl = layer as TextLayer;
    const textGroup: PropertyGroup = {
      id: 'text',
      name: 'Text Style',
      tracks: [
        { id: 'tx_fs', name: 'Font Size', propertyPath: 'animOverrides.fontSize', property: tl.animOverrides.fontSize, groupId: 'text' },
        { id: 'tx_lh', name: 'Line Height', propertyPath: 'animOverrides.lineHeight', property: tl.animOverrides.lineHeight, groupId: 'text' },
        { id: 'tx_ls', name: 'Letter Spacing', propertyPath: 'animOverrides.letterSpacing', property: tl.animOverrides.letterSpacing, groupId: 'text' },
        { id: 'tx_sw', name: 'Stroke Width', propertyPath: 'animOverrides.strokeWidth', property: tl.animOverrides.strokeWidth, groupId: 'text' },
      ],
    };
    groups.push(textGroup);
  }

  if (layer.type === 'audio') {
    const al = layer as AudioLayer;
    const audioGroup: PropertyGroup = {
      id: 'audio',
      name: 'Audio',
      tracks: [
        { id: 'au_vol', name: 'Volume', propertyPath: 'audio.volume', property: al.audio.volume, groupId: 'audio' },
        { id: 'au_pitch', name: 'Pitch', propertyPath: 'audio.pitch', property: al.audio.pitch, groupId: 'audio' },
      ],
    };
    groups.push(audioGroup);
  }

  return groups;
}

export function KeyframeTimeline() {
  const composition = useEditorStore((s) => s.composition);
  const selection = useEditorStore((s) => s.selection);
  const addKeyframe = useEditorStore((s) => s.addKeyframe);
  const updateLayerProperty = useEditorStore((s) => s.updateLayerProperty);
  const { show: showContextMenu } = useContextMenu();

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

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const selectedKeyframes = useEditorStore((s) => s.selection.selectedKeyframes);
  const selectedCurvePoints = useEditorStore((s) => s.selection.selectedCurvePoints);
  const selectKeyframes = useEditorStore((s) => s.selectKeyframes);
  const containerRef = useRef<HTMLDivElement>(null);
  const kfAreaRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(600);

  // Keyframe marquee selection
  const [kfMarquee, setKfMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const kfMarqueeRef = useRef<{ startX: number; startY: number; active: boolean; lastIds: string } | null>(null);

  // Keyframe playhead snapping
  const [snapToKeyframes, setSnapToKeyframes] = useState(true);
  const [isSnapped, setIsSnapped] = useState(false);

  // Gather all keyframe times from the active layer
  const allKeyframeTimes = useMemo(() => {
    if (!activeLayer) return [];
    const groups = extractAnimatableProperties(activeLayer);
    const times = new Set<number>();
    for (const group of groups) {
      for (const track of group.tracks) {
        if (track.property.keyframes) {
          for (const kf of track.property.keyframes) {
            times.add(kf.frame);
          }
        }
      }
    }
    return [...times].sort((a, b) => a - b);
  }, [activeLayer]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      setContainerWidth(entries[0].contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const propertyGroups = useMemo(() => {
    if (!activeLayer || activeLayer.type === 'group') return [];
    return extractAnimatableProperties(activeLayer);
  }, [activeLayer]);

  const toggleGroup = useCallback((groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  const handleScrub = useCallback((e: React.MouseEvent | MouseEvent) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    let frame = pixelToFrame(x, zoomLevel, scrollX);
    frame = Math.max(0, Math.min(frame, durationFrames - 1));

    // Snap playhead to nearest keyframe if enabled
    if (snapToKeyframes && allKeyframeTimes.length > 0) {
      const snapped = findNearestKeyframeFrame(allKeyframeTimes, frame, 3);
      if (snapped !== null) {
        frame = snapped;
        setIsSnapped(true);
      } else {
        setIsSnapped(false);
      }
    } else {
      setIsSnapped(false);
    }

    scrubTo(frame);
  }, [zoomLevel, scrollX, scrubTo, durationFrames, snapToKeyframes, allKeyframeTimes]);

  const handleRulerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    handleScrub(e);
    const onMove = (ev: MouseEvent) => handleScrub(ev);
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [handleScrub]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;

    if (e.ctrlKey || e.metaKey) {
      const factor = Math.exp(-e.deltaY * ZOOM_SENSITIVITY);
      zoomAtCursor(cursorX, factor);
    } else {
      const maxScroll = getMaxScrollX(durationFrames, zoomLevel, containerWidth);
      const dx = e.deltaX !== 0 ? e.deltaX : e.deltaY;
      const newScrollX = Math.max(0, Math.min(maxScroll, scrollX + dx * 2));
      setScrollX(newScrollX);
    }
  }, [zoomLevel, scrollX, durationFrames, containerWidth, setScrollX, zoomAtCursor]);

  const handleAddKeyframe = useCallback((track: PropertyTrack) => {
    if (!activeLayer) return;
    const prop = track.property;
    const value = prop.defaultValue;
    addKeyframe(activeLayer.id, track.propertyPath, currentFrame, value as number | [number, number]);
  }, [activeLayer, currentFrame, addKeyframe]);

  const handleDeleteKeyframe = useCallback((track: PropertyTrack, frame: number) => {
    if (!activeLayer) return;
    const newKeyframes = track.property.keyframes.filter((k) => k.frame !== frame);
    updateLayerProperty(activeLayer.id, `${track.propertyPath}.keyframes`, newKeyframes);
  }, [activeLayer, updateLayerProperty]);

  const handleKeyframeSelect = useCallback((keyId: string, additive: boolean) => {
    if (additive) {
      const current = useEditorStore.getState().selection.selectedKeyframes;
      const has = current.includes(keyId);
      if (has) {
        selectKeyframes(current.filter((k) => k !== keyId));
      } else {
        selectKeyframes([...current, keyId]);
      }
    } else {
      selectKeyframes([keyId]);
    }
  }, [selectKeyframes]);

  // Keyframe marquee drag effect
  useEffect(() => {
    if (!kfMarqueeRef.current) return;

    const handleMove = (e: PointerEvent) => {
      const m = kfMarqueeRef.current;
      if (!m) return;
      const el = kfAreaRef.current;
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
      setKfMarquee(mRect);

      // Hit test keyframes against the marquee
      const hits: string[] = [];
      let accY = 0;
      for (const row of flatRows) {
        const rowH = row.type === 'group' ? GROUP_ROW_HEIGHT : ROW_HEIGHT;
        if (row.type === 'track') {
          const track = row.track;
          for (const kf of track.property.keyframes) {
            const kx = frameToPixel(kf.frame, zoomLevel, scrollX);
            const ky = accY + rowH / 2;
            if (kx >= mRect.x && kx <= mRect.x + mRect.w && ky >= mRect.y && ky <= mRect.y + mRect.h) {
              hits.push(`${track.id}_${kf.frame}`);
            }
          }
        }
        accY += rowH;
      }

      const key = hits.join(',');
      if (key !== m.lastIds) {
        m.lastIds = key;
        selectKeyframes(hits);
      }
    };

    const handleUp = () => {
      kfMarqueeRef.current = null;
      setKfMarquee(null);
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [kfMarquee === null && kfMarqueeRef.current !== null]);

  const visibleRange = getVisibleFrameRange(containerWidth, zoomLevel, scrollX);
  const ticks = getRulerTicks(visibleRange, zoomLevel);
  const playheadX = frameToPixel(currentFrame, zoomLevel, scrollX);

  // Build flat list of visible rows
  const flatRows: ({ type: 'group'; group: PropertyGroup } | { type: 'track'; track: PropertyTrack })[] = [];
  for (const group of propertyGroups) {
    flatRows.push({ type: 'group', group });
    if (!collapsedGroups.has(group.id)) {
      for (const track of group.tracks) {
        flatRows.push({ type: 'track', track });
      }
    }
  }

  if (!activeLayer || activeLayer.type === 'group') {
    return (
      <div className="flex flex-col h-full bg-[#0e1c32]">
        <div className="h-[26px] min-h-[26px] flex items-center px-3 border-b border-[#1a2a42] bg-[#081220]">
          <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Keyframes</span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <span className="text-[11px] text-slate-600">Select a layer to view keyframes</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#0e1c32]">
      {/* Header */}
      <div className="h-[26px] min-h-[26px] flex items-center px-3 border-b border-[#1a2a42] bg-[#081220]">
        <Diamond size={10} className="text-yellow-500 mr-1.5" />
        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Keyframes</span>
        <span className="text-[9px] text-slate-600 ml-2 truncate">{activeLayer.name}</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setSnapToKeyframes(!snapToKeyframes)}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium transition-all ${
              snapToKeyframes
                ? 'bg-[#f7b500]/10 border border-[#f7b500]/30 text-[#ffc83d]'
                : 'border border-transparent text-slate-600 hover:text-slate-400'
            }`}
            title="Snap playhead to keyframes"
          >
            <Magnet size={9} />
            <span>Snap</span>
          </button>
        </div>
      </div>

      {/* Main area: property list left | keyframe tracks right */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        {/* Ruler row */}
        <div className="flex flex-row flex-shrink-0" style={{ height: 21 }}>
          <div className="flex-shrink-0 border-r border-b border-[#243a5c] bg-[#081220]" style={{ width: 180 }} />
          <div
            ref={containerRef}
            className="flex-1 relative bg-[#1a1e28] border-b border-[#243a5c] cursor-col-resize select-none overflow-hidden"
            onMouseDown={handleRulerMouseDown}
            onWheel={handleWheel}
          >
            {ticks.map((tick) => {
              const x = frameToPixel(tick.frame, zoomLevel, scrollX);
              if (x < -40 || x > containerWidth + 40) return null;
              return (
                <div key={tick.frame} className="absolute top-0 h-full" style={{ left: x }}>
                  <div
                    className={`w-px ${tick.major ? 'bg-slate-500/60' : 'bg-slate-700/40'}`}
                    style={{ height: tick.major ? 10 : 5, marginTop: tick.major ? 10 : 15 }}
                  />
                  {tick.major && (
                    <span className="absolute top-[1px] left-[3px] text-[9px] text-slate-400 whitespace-nowrap font-mono">
                      {formatRulerLabel(tick.frame, frameRate)}
                    </span>
                  )}
                </div>
              );
            })}
            {playheadX >= -5 && playheadX <= containerWidth + 5 && (
              <div
                className="absolute bottom-0 z-20 pointer-events-none"
                style={{ left: playheadX, transform: 'translateX(-4px)' }}
              >
                <div className="w-0 h-0 border-l-[5px] border-r-[5px] border-b-[6px] border-l-transparent border-r-transparent border-b-[#ffcc00]" />
              </div>
            )}
          </div>
        </div>

        {/* Track rows */}
        <div className="flex-1 flex flex-row min-h-0 overflow-hidden">
          {/* Left: property names */}
          <div className="flex-shrink-0 min-h-0 overflow-y-auto overflow-x-hidden border-r border-[#1a2a42] bg-[#081220]" style={{ width: 180 }}>
            {flatRows.map((row) => {
              if (row.type === 'group') {
                const isCollapsed = collapsedGroups.has(row.group.id);
                const hasKeyframes = row.group.tracks.some((t) => t.property.keyframes.length > 0);
                return (
                  <div
                    key={row.group.id}
                    className="flex items-center px-2 border-b border-[#1a2a42] cursor-pointer hover:bg-[#141820] select-none"
                    style={{ height: GROUP_ROW_HEIGHT }}
                    onClick={() => toggleGroup(row.group.id)}
                  >
                    {isCollapsed
                      ? <ChevronRight size={10} className="text-slate-500 mr-1 flex-shrink-0" />
                      : <ChevronDown size={10} className="text-slate-500 mr-1 flex-shrink-0" />
                    }
                    <span className="text-[10px] font-medium text-slate-300 flex-1 truncate">{row.group.name}</span>
                    {hasKeyframes && <Diamond size={7} className="text-yellow-500 ml-1 flex-shrink-0" />}
                  </div>
                );
              }
              const track = row.track;
              const hasKeys = track.property.keyframes.length > 0;
              return (
                <div
                  key={track.id}
                  className="flex items-center px-2 pl-5 border-b border-[#1a2a42] group/row"
                  style={{ height: ROW_HEIGHT }}
                >
                  <span className={`text-[9px] flex-1 truncate ${hasKeys ? 'text-yellow-400/90' : 'text-slate-500'}`}>
                    {track.name}
                  </span>
                  <button
                    onClick={() => handleAddKeyframe(track)}
                    className="opacity-0 group-hover/row:opacity-100 p-0.5 text-slate-500 hover:text-yellow-400 transition-all"
                    title="Add keyframe at current frame"
                  >
                    <Plus size={9} />
                  </button>
                </div>
              );
            })}
            {flatRows.length === 0 && (
              <div className="p-3 text-[10px] text-slate-600 text-center">No animatable properties</div>
            )}
          </div>

          {/* Right: keyframe diamonds area */}
          <div
            ref={kfAreaRef}
            className="flex-1 relative overflow-hidden bg-[#16294a] select-none"
            onWheel={handleWheel}
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).closest('[data-kf-id]')) return;
              const el = kfAreaRef.current;
              if (!el) return;
              const rect = el.getBoundingClientRect();
              kfMarqueeRef.current = { startX: e.clientX - rect.left, startY: e.clientY - rect.top, active: false, lastIds: '' };
              const additive = e.shiftKey || e.ctrlKey || e.metaKey;
              if (!additive) selectKeyframes([]);
            }}
          >
            {flatRows.map((row) => {
              if (row.type === 'group') {
                const isCollapsed = collapsedGroups.has(row.group.id);
                const allKeyframes = row.group.tracks.flatMap((t) => t.property.keyframes);
                return (
                  <div
                    key={`tr_${row.group.id}`}
                    className="relative border-b border-[#1a2a42]"
                    style={{ height: GROUP_ROW_HEIGHT }}
                  >
                    {/* Show summary diamonds for collapsed groups */}
                    {isCollapsed && allKeyframes.map((kf) => {
                      const x = frameToPixel(kf.frame, zoomLevel, scrollX);
                      if (x < -8 || x > containerWidth + 8) return null;
                      return (
                        <div
                          key={`${row.group.id}_${kf.frame}`}
                          className="absolute top-1/2 -translate-y-1/2 w-[8px] h-[8px] rotate-45 bg-yellow-500/60 border border-yellow-500/80"
                          style={{ left: x - 4 }}
                        />
                      );
                    })}
                  </div>
                );
              }

              const track = row.track;
              return (
                <div
                  key={`tr_${track.id}`}
                  className="relative border-b border-[#1a2a42]"
                  style={{ height: ROW_HEIGHT }}
                >
                  {track.property.keyframes.map((kf) => {
                    const x = frameToPixel(kf.frame, zoomLevel, scrollX);
                    if (x < -8 || x > containerWidth + 8) return null;
                    const keyId = `${track.id}_${kf.frame}`;
                    const isKfSelected = selectedKeyframes.includes(keyId) || selectedCurvePoints.some((cp) => cp === keyId || cp.startsWith(track.id + '_') && cp.endsWith('_' + kf.frame));
                    return (
                      <div
                        key={keyId}
                        data-kf-id={keyId}
                        className={`absolute top-1/2 -translate-y-1/2 w-[9px] h-[9px] rotate-45 cursor-pointer transition-all
                          ${isKfSelected
                            ? 'bg-yellow-300 border-[1.5px] border-white shadow-[0_0_6px_rgba(250,204,21,0.6)]'
                            : 'bg-yellow-500 border border-yellow-600 hover:bg-yellow-400 hover:scale-125'
                          }`}
                        style={{ left: x - 4.5 }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const isSingle = selection.selectedKeyframes.length <= 1;
                          showContextMenu(e.clientX, e.clientY, buildKeyframeMenu(isSingle));
                        }}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          const additive = e.shiftKey || e.ctrlKey || e.metaKey;
                          handleKeyframeSelect(keyId, additive);
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          handleDeleteKeyframe(track, kf.frame);
                        }}
                        title={`Frame ${kf.frame}`}
                      />
                    );
                  })}
                </div>
              );
            })}

            {/* Playhead line */}
            {playheadX >= -1 && playheadX <= containerWidth + 1 && (
              <div
                className="absolute top-0 bottom-0 z-20 pointer-events-none"
                style={{
                  left: playheadX,
                  width: isSnapped ? 2 : 1,
                  backgroundColor: isSnapped ? '#ef4444' : '#ffcc00',
                  boxShadow: isSnapped ? '0 0 8px rgba(239,68,68,0.7)' : 'none',
                  transform: isSnapped ? 'translateX(-0.5px)' : 'none',
                }}
              />
            )}

            {/* Keyframe marquee */}
            {kfMarquee && (
              <div
                className="absolute z-30 pointer-events-none"
                style={{
                  left: kfMarquee.x,
                  top: kfMarquee.y,
                  width: kfMarquee.w,
                  height: kfMarquee.h,
                  border: '1px solid rgba(250, 204, 21, 0.8)',
                  backgroundColor: 'rgba(250, 204, 21, 0.06)',
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
