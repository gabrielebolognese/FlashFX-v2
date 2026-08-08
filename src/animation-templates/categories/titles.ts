import type { Layer, Vec2, Vec4 } from '../../core/types';
import type { AnimationTemplate } from '../types';
import { group, box, label, assemble, flyIn, fadeIn, fadeOut, growRight, EASE_OUT } from '../kit';

const AMBER: Vec4 = [0.969, 0.71, 0.0, 1];
const WHITE: Vec4 = [0.96, 0.97, 1, 1];
const SLATE: Vec4 = [0.72, 0.78, 0.9, 1];
const BAR_DARK: Vec4 = [0.09, 0.12, 0.2, 1];

// Title with an underline that draws on.
function buildTitleRise(ctx: { center: Vec2 }): Layer[] {
  const g = group('Title', ctx.center);
  const children: Layer[] = [];

  const headline = label('Your Headline', [0, -10], { size: 96, weight: 800, color: WHITE });
  flyIn(headline, 0, 14, [0, 46]);
  children.push(headline);

  // Underline: a thin bar that grows left→right beneath the headline.
  const rule = box([0, 60], 460, 8, AMBER);
  growRight(rule, -230, 460, 10, 16);
  children.push(rule);

  return assemble(g, children, 120);
}

// Lower-third: a bar slides in from the left carrying a name + role, holds, then slides out.
function buildLowerThird(ctx: { center: Vec2 }): Layer[] {
  const g = group('Lower Third', ctx.center);
  const children: Layer[] = [];

  const bar = box([0, 0], 620, 116, BAR_DARK);
  flyIn(bar, 0, 12, [-720, 0]);
  fadeOut(bar, 92, 10);
  children.push(bar);

  const accent = box([-286, 0], 8, 116, AMBER);
  flyIn(accent, 2, 12, [-720, 0]);
  fadeOut(accent, 92, 10);
  children.push(accent);

  const name = label('Jane Doe', [10, -20], { size: 44, weight: 700, color: WHITE, align: 'center' });
  fadeIn(name, 12, 8, EASE_OUT);
  fadeOut(name, 92, 10);
  children.push(name);

  const role = label('Product Designer', [10, 30], { size: 26, weight: 500, color: SLATE, align: 'center' });
  fadeIn(role, 16, 8, EASE_OUT);
  fadeOut(role, 92, 10);
  children.push(role);

  return assemble(g, children, 120);
}

export const titleRise: AnimationTemplate = {
  id: 'title-rise',
  name: 'Title Rise',
  category: 'titles',
  description: 'A headline rises and fades in over a drawing-on underline.',
  tags: ['title', 'headline', 'intro', 'text', 'underline'],
  durationFrames: 120,
  authorFps: 30,
  build: buildTitleRise,
};

export const lowerThirdSlide: AnimationTemplate = {
  id: 'lower-third-slide',
  name: 'Lower Third',
  category: 'titles',
  description: 'A name/role bar slides in, holds, then slides away.',
  tags: ['lower third', 'name', 'title', 'broadcast', 'caption'],
  durationFrames: 120,
  authorFps: 30,
  build: buildLowerThird,
};
