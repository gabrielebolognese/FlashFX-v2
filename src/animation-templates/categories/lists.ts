import type { Layer, Vec2, Vec4 } from '../../core/types';
import type { AnimationTemplate } from '../types';
import { group, dot, label, assemble, flyIn, popIn } from '../kit';

const AMBER: Vec4 = [0.969, 0.71, 0.0, 1];
const WHITE: Vec4 = [0.9, 0.93, 0.98, 1];

const ITEMS = ['Fast, GPU-accelerated', 'Keyframes with real easing', 'Editable vector shapes', 'Export-ready in one click'];

// A bulleted list whose rows reveal one after another: each dot pops, its text slides in from the left.
function build(ctx: { center: Vec2 }): Layer[] {
  const g = group('Bullet List', ctx.center);
  const children: Layer[] = [];

  const rowH = 84;
  const top = -((ITEMS.length - 1) * rowH) / 2;

  ITEMS.forEach((text, i) => {
    const y = top + i * rowH;
    const at = i * 10;

    const bullet = dot([-300, y], 12, AMBER);
    popIn(bullet, at, 10);
    children.push(bullet);

    const item = label(text, [-260, y - 22], { size: 40, weight: 500, color: WHITE, align: 'left' });
    flyIn(item, at + 3, 12, [-40, 0]);
    children.push(item);
  });

  return assemble(g, children, 120);
}

export const bulletList: AnimationTemplate = {
  id: 'bullet-list',
  name: 'Bullet List',
  category: 'lists',
  description: 'List rows reveal one by one — a dot pops, the text slides in.',
  tags: ['list', 'bullets', 'points', 'features', 'reveal', 'stagger'],
  durationFrames: 120,
  authorFps: 30,
  build,
};
