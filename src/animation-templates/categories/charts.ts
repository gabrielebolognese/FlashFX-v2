import type { Layer, Vec2, Vec4 } from '../../core/types';
import type { AnimationTemplate } from '../types';
import { group, box, label, assemble, growUp, fadeIn, flyIn } from '../kit';

const BARS = [0.55, 0.8, 0.4, 1.0, 0.68];
const LABELS = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'];
const AMBER: Vec4 = [0.969, 0.71, 0.0, 1];
const BLUE: Vec4 = [0.29, 0.56, 0.99, 1];
const AXIS: Vec4 = [0.3, 0.36, 0.48, 1];
const LABEL_COL: Vec4 = [0.7, 0.76, 0.88, 1];

// A bar chart whose bars grow up from a baseline, staggered; axis and labels fade in first.
function build(ctx: { center: Vec2 }): Layer[] {
  const g = group('Bar Chart', ctx.center);
  const children: Layer[] = [];

  const maxH = 360;
  const barW = 74;
  const gap = 44;
  const n = BARS.length;
  const spanW = n * barW + (n - 1) * gap;
  const x0 = -spanW / 2 + barW / 2;
  const baseY = 200; // local y of the baseline

  // Baseline axis
  const axis = box([0, baseY + 4], spanW + 60, 4, AXIS);
  fadeIn(axis, 0, 8);
  children.push(axis);

  BARS.forEach((frac, i) => {
    const x = x0 + i * (barW + gap);
    const h = Math.round(maxH * frac);
    const bar = box([x, baseY - h / 2], barW, h, i % 2 === 0 ? AMBER : BLUE);
    growUp(bar, baseY, h, 6 + i * 6, 16);
    children.push(bar);

    const cap = label(LABELS[i], [x, baseY + 24], { size: 26, weight: 600, color: LABEL_COL });
    flyIn(cap, 10 + i * 6, 10, [0, 16]);
    children.push(cap);
  });

  return assemble(g, children, 120);
}

export const barChartGrow: AnimationTemplate = {
  id: 'bar-chart-grow',
  name: 'Bar Chart',
  category: 'charts',
  description: 'Bars grow up from the baseline in sequence, with axis labels.',
  tags: ['chart', 'bar', 'data', 'graph', 'stats', 'grow'],
  durationFrames: 120,
  authorFps: 30,
  build,
};
