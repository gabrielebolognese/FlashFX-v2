import type { CSSProperties } from 'react';
import { useEditorStore } from '../../store/editor';
import { useViewportNavStore } from '../../store/viewportNav';
import { evaluateVec2 } from '../../core/interpolation';
import type { Layer } from '../../core/types';

const SAMPLES = 48;

function positionProp(layer: Layer) {
  if (!('transform' in layer) || !layer.transform) return null;
  const p = layer.transform.position;
  if (!p || !Array.isArray(p.keyframes) || p.keyframes.length < 2) return null;
  return p;
}

/**
 * Canvas "Show Motion Paths" toggle: draws the position trajectory of every
 * layer whose position is keyframed, sampled across the layer's lifetime.
 * A read-only companion to the interactive MotionPathOverlay (which edits a
 * single selected path). Plotted in composition coordinates via an SVG viewBox.
 */
export function AnimatedPathsOverlay({ compW, compH, style }: { compW: number; compH: number; style: CSSProperties }) {
  const show = useViewportNavStore((s) => s.showMotionPaths);
  const composition = useEditorStore((s) => s.composition);

  if (!show || compW <= 0 || compH <= 0) return null;

  const paths: { d: string; dots: [number, number][] }[] = [];
  for (const layer of composition.layers) {
    const prop = positionProp(layer);
    if (!prop) continue;
    const start = layer.inPoint;
    const end = Math.max(layer.inPoint + 1, layer.outPoint);
    const pts: [number, number][] = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const f = start + ((end - start) * i) / SAMPLES;
      const [x, y] = evaluateVec2(prop, f);
      pts.push([x, y]);
    }
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    // Keyframe dots (the actual authored positions).
    const dots = prop.keyframes.map((k) => {
      const [x, y] = evaluateVec2(prop, k.frame);
      return [x, y] as [number, number];
    });
    paths.push({ d, dots });
  }

  if (paths.length === 0) return null;

  return (
    <svg
      style={{ ...style, pointerEvents: 'none' }}
      viewBox={`0 0 ${compW} ${compH}`}
      preserveAspectRatio="none"
    >
      {paths.map((p, i) => (
        <g key={i}>
          <path d={p.d} fill="none" stroke="rgba(247,181,0,0.9)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          {p.dots.map(([x, y], j) => (
            <circle key={j} cx={x} cy={y} r={Math.max(2, compW / 250)} fill="#ffffff" stroke="rgba(247,181,0,1)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          ))}
        </g>
      ))}
    </svg>
  );
}
