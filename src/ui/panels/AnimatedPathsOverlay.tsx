import type { CSSProperties } from 'react';
import { useEditorStore } from '../../store/editor';
import { useViewportNavStore } from '../../store/viewportNav';
import { evaluateVec2 } from '../../core/interpolation';
import type { Layer } from '../../core/types';

const SAMPLES = 48;
// Cap the per-frame spacing dots so a very long selected layer can't spray thousands of nodes.
const MAX_SPACING_DOTS = 240;

function positionProp(layer: Layer) {
  if (!('transform' in layer) || !layer.transform) return null;
  const p = layer.transform.position;
  if (!p || !Array.isArray(p.keyframes) || p.keyframes.length < 2) return null;
  return p;
}

/**
 * Canvas "Show Motion Paths" toggle: draws the position trajectory of every layer whose position is
 * keyframed. The curve honours spatial tangents automatically (it samples `evaluateVec2`, which now
 * follows the spatial motion path), so Auto-Bezier keyframes read as smooth arcs. For the SELECTED
 * layer it also draws AE-style per-frame SPACING DOTS — the velocity/weight X-ray: dots bunch where
 * the motion is slow (eased) and spread where it's fast. Read-only (manual tangent dragging is B3b).
 */
export function AnimatedPathsOverlay({ compW, compH, style }: { compW: number; compH: number; style: CSSProperties }) {
  const show = useViewportNavStore((s) => s.showMotionPaths);
  const composition = useEditorStore((s) => s.composition);
  const selection = useEditorStore((s) => s.selection);

  if (!show || compW <= 0 || compH <= 0) return null;

  const selectedIds = new Set(selection.selectedIds.length > 0 ? selection.selectedIds : selection.activeId ? [selection.activeId] : []);
  const dotR = Math.max(2, compW / 250);
  const spacingR = Math.max(1.2, compW / 480);

  const paths: { d: string; keyDots: [number, number][]; spacingDots: [number, number][] }[] = [];
  for (const layer of composition.layers) {
    const prop = positionProp(layer);
    if (!prop) continue;
    const start = layer.inPoint;
    const end = Math.max(layer.inPoint + 1, layer.outPoint);
    const pts: [number, number][] = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const f = start + ((end - start) * i) / SAMPLES;
      pts.push(evaluateVec2(prop, f));
    }
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    const keyDots = prop.keyframes.map((k) => evaluateVec2(prop, k.frame));

    // Per-frame spacing dots for the selected layer only (perf + matches AE's active-path X-ray).
    const spacingDots: [number, number][] = [];
    if (selectedIds.has(layer.id)) {
      const span = Math.max(1, Math.round(end) - Math.round(start));
      const stepEvery = Math.max(1, Math.ceil(span / MAX_SPACING_DOTS)); // thin out on very long layers
      for (let f = Math.round(start); f <= Math.round(end); f += stepEvery) {
        spacingDots.push(evaluateVec2(prop, f));
      }
    }
    paths.push({ d, keyDots, spacingDots });
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
          {p.spacingDots.map(([x, y], j) => (
            <circle key={`s${j}`} cx={x} cy={y} r={spacingR} fill="rgba(247,181,0,0.85)" vectorEffect="non-scaling-stroke" />
          ))}
          {p.keyDots.map(([x, y], j) => (
            <circle key={j} cx={x} cy={y} r={dotR} fill="#ffffff" stroke="rgba(247,181,0,1)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          ))}
        </g>
      ))}
    </svg>
  );
}
