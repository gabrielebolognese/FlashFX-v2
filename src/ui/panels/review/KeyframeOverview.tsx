import { useRef, useEffect, useMemo, memo, useCallback } from 'react';
import { useEditorStore } from '../../../store/editor';
import { useTimelineStore } from '../../../store/timeline';
import type { Layer, AnimatableProperty, ShapeGeometry } from '../../../core/types';

interface KeyframeEntry {
  frame: number;
  layerName: string;
  propertyName: string;
  color: string;
}

const LAYER_COLORS: Record<string, string> = {
  shape: '#22c55e',
  text: '#f59e0b',
  video: '#3b82f6',
  audio: '#a855f7',
  image: '#ec4899',
  group: '#6b7280',
};

function collectKeyframes(property: AnimatableProperty, layerName: string, propName: string, color: string): KeyframeEntry[] {
  return property.keyframes.map((kf) => ({
    frame: kf.frame,
    layerName,
    propertyName: propName,
    color,
  }));
}

// The animatable sub-properties of each shape variant, keyed for display.
function shapeProperties(shape: ShapeGeometry): [string, AnimatableProperty][] {
  switch (shape.type) {
    case 'rectangle':
      return [
        ['width', shape.width],
        ['height', shape.height],
        ['borderRadius', shape.borderRadius],
        ['strokeWidth', shape.strokeWidth],
      ];
    case 'circle':
      return [
        ['radius', shape.radius],
        ['strokeWidth', shape.strokeWidth],
      ];
    case 'star':
      return [
        ['points', shape.points],
        ['outerRadius', shape.outerRadius],
        ['innerRadius', shape.innerRadius],
        ['strokeWidth', shape.strokeWidth],
      ];
    case 'polygon':
      return [['strokeWidth', shape.strokeWidth]];
  }
}

function extractAllKeyframes(layers: Layer[]): Map<string, KeyframeEntry[]> {
  const byLayer = new Map<string, KeyframeEntry[]>();

  for (const layer of layers) {
    const color = LAYER_COLORS[layer.type] ?? '#6b7280';
    const entries: KeyframeEntry[] = [];

    // Transform properties
    entries.push(...collectKeyframes(layer.transform.position, layer.name, 'Position', color));
    entries.push(...collectKeyframes(layer.transform.rotation, layer.name, 'Rotation', color));
    entries.push(...collectKeyframes(layer.transform.scale, layer.name, 'Scale', color));
    entries.push(...collectKeyframes(layer.transform.anchorPoint, layer.name, 'Anchor', color));
    entries.push(...collectKeyframes(layer.transform.opacity, layer.name, 'Opacity', color));

    // Shape properties
    if (layer.type === 'shape') {
      for (const [key, prop] of shapeProperties(layer.shape)) {
        entries.push(...collectKeyframes(prop, layer.name, key, color));
      }
    }

    // Text properties
    if (layer.type === 'text') {
      const overrides = layer.animOverrides;
      entries.push(...collectKeyframes(overrides.fontSize, layer.name, 'fontSize', color));
      entries.push(...collectKeyframes(overrides.lineHeight, layer.name, 'lineHeight', color));
      entries.push(...collectKeyframes(overrides.letterSpacing, layer.name, 'letterSpacing', color));
      entries.push(...collectKeyframes(overrides.strokeWidth, layer.name, 'strokeWidth', color));
    }

    // Audio properties
    if (layer.type === 'audio') {
      entries.push(...collectKeyframes(layer.audio.volume, layer.name, 'Volume', color));
      entries.push(...collectKeyframes(layer.audio.pitch, layer.name, 'Pitch', color));
    }

    if (entries.length > 0) {
      byLayer.set(layer.id, entries);
    }
  }

  return byLayer;
}

const LayerKeyframeRow = memo(function LayerKeyframeRow({
  layer,
  keyframes,
  durationFrames,
  width,
}: {
  layer: Layer;
  keyframes: KeyframeEntry[];
  durationFrames: number;
  width: number;
}) {
  const color = LAYER_COLORS[layer.type] ?? '#6b7280';
  return (
    <div className="flex items-center h-5 border-b border-[#16294a]">
      <div className="w-[120px] flex-shrink-0 px-2 truncate text-[9px] text-slate-500 flex items-center gap-1">
        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        {layer.name}
      </div>
      <div className="flex-1 relative h-full">
        {keyframes.map((kf, i) => {
          const x = (kf.frame / durationFrames) * (width - 120);
          return (
            <div
              key={i}
              className="absolute top-1/2 -translate-y-1/2 w-[5px] h-[5px] rotate-45"
              style={{
                left: x,
                backgroundColor: kf.color,
                opacity: 0.85,
              }}
            />
          );
        })}
      </div>
    </div>
  );
});

export const KeyframeOverview = memo(function KeyframeOverview() {
  const composition = useEditorStore((s) => s.composition);
  const containerRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const widthRef = useRef(0);

  const layers = composition.layers;
  const durationFrames = composition.settings.durationFrames;
  const frameRate = composition.settings.frameRate;

  const keyframesByLayer = useMemo(() => extractAllKeyframes(layers), [layers]);

  const layersWithKeyframes = useMemo(
    () => layers.filter((l) => keyframesByLayer.has(l.id)),
    [layers, keyframesByLayer]
  );

  // Measure container width
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      widthRef.current = container.getBoundingClientRect().width;
    });
    observer.observe(container);
    widthRef.current = container.getBoundingClientRect().width;
    return () => observer.disconnect();
  }, []);

  // Playhead animation loop - direct DOM manipulation
  useEffect(() => {
    const update = () => {
      rafRef.current = requestAnimationFrame(update);
      const playhead = playheadRef.current;
      if (!playhead) return;
      const frame = useTimelineStore.getState().currentFrame;
      const labelOffset = 120;
      const trackWidth = widthRef.current - labelOffset;
      if (trackWidth <= 0) return;
      const x = labelOffset + (frame / durationFrames) * trackWidth;
      playhead.style.transform = `translateX(${x}px)`;
    };
    rafRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafRef.current);
  }, [durationFrames]);

  // Generate ruler marks
  const rulerMarks = useMemo(() => {
    const totalSec = durationFrames / frameRate;
    let interval = 1;
    if (totalSec > 300) interval = 60;
    else if (totalSec > 60) interval = 10;
    else if (totalSec > 20) interval = 5;
    else if (totalSec > 5) interval = 2;

    const marks: { sec: number; label: string }[] = [];
    for (let s = 0; s <= totalSec; s += interval) {
      const min = Math.floor(s / 60);
      const sec = Math.floor(s % 60);
      marks.push({ sec: s, label: min > 0 ? `${min}:${sec.toString().padStart(2, '0')}` : `${sec}s` });
    }
    return marks;
  }, [durationFrames, frameRate]);

  const handleRulerClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const labelOffset = 120;
    const trackWidth = rect.width - labelOffset;
    if (x < labelOffset || trackWidth <= 0) return;
    const frame = Math.round(((x - labelOffset) / trackWidth) * durationFrames);
    useTimelineStore.getState().scrubTo(Math.max(0, Math.min(frame, durationFrames - 1)));
  }, [durationFrames]);

  return (
    <div ref={containerRef} className="h-full flex flex-col bg-[#0e1c32] overflow-hidden relative">
      {/* Header */}
      <div className="h-[22px] flex items-center px-3 border-b border-[#1a2a42] flex-shrink-0">
        <span className="text-[10px] font-medium text-slate-400">Keyframe Overview</span>
        <span className="text-[9px] text-slate-600 ml-2">{layersWithKeyframes.length} animated layers</span>
      </div>

      {/* Ruler */}
      <div
        className="h-5 flex-shrink-0 border-b border-[#1a2a42] relative cursor-pointer"
        onClick={handleRulerClick}
      >
        <div className="absolute left-[120px] right-0 top-0 h-full">
          {rulerMarks.map((mark) => {
            const percent = (mark.sec * frameRate) / durationFrames * 100;
            return (
              <div
                key={mark.sec}
                className="absolute top-0 h-full flex flex-col items-center"
                style={{ left: `${percent}%` }}
              >
                <div className="w-px h-2 bg-slate-700" />
                <span className="text-[8px] text-slate-600 mt-0.5">{mark.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Keyframe rows */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {layersWithKeyframes.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[10px] text-slate-600">
            No keyframes in project
          </div>
        ) : (
          layersWithKeyframes.map((layer) => (
            <LayerKeyframeRow
              key={layer.id}
              layer={layer}
              keyframes={keyframesByLayer.get(layer.id)!}
              durationFrames={durationFrames}
              width={widthRef.current || 400}
            />
          ))
        )}
      </div>

      {/* Playhead */}
      <div
        ref={playheadRef}
        className="absolute top-[22px] bottom-0 w-px bg-[#f7b500] pointer-events-none z-10"
        style={{ transform: 'translateX(120px)' }}
      >
        <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-2 h-2 bg-[#f7b500] rotate-45" />
      </div>
    </div>
  );
});
