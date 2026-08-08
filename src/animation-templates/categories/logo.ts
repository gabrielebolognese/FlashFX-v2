import type { Layer, Vec2, Vec4 } from '../../core/types';
import type { AnimationTemplate } from '../types';
import { group, dot, star, label, assemble, popIn, rotateIn, fadeIn, setKeys, EASE_IO } from '../kit';

const AMBER: Vec4 = [0.969, 0.71, 0.0, 1];
const DARK: Vec4 = [0.09, 0.12, 0.2, 1];
const WHITE: Vec4 = [0.95, 0.96, 1, 1];

// A logo sting: a disc pops in, a star spins into place on top, then a wordmark fades up. The disc
// gives a subtle final breathe.
function build(ctx: { center: Vec2 }): Layer[] {
  const g = group('Logo Sting', ctx.center);
  const children: Layer[] = [];

  const disc = dot([0, -40], 120, DARK);
  setKeys(disc.transform.scale, [
    { f: 0, v: [0, 0] },
    { f: 12, v: [1, 1], ease: EASE_IO },
    { f: 60, v: [1, 1], ease: EASE_IO },
    { f: 74, v: [1.05, 1.05], ease: EASE_IO },
    { f: 88, v: [1, 1], ease: EASE_IO },
  ]);
  setKeys(disc.transform.opacity, [{ f: 0, v: 0 }, { f: 6, v: 1, ease: EASE_IO }]);
  children.push(disc);

  const mark = star([0, -40], 5, 70, 30, AMBER);
  popIn(mark, 8, 14);
  rotateIn(mark, 8, 18, -160);
  children.push(mark);

  const word = label('FLASHFX', [0, 110], { size: 56, weight: 800, color: WHITE });
  fadeIn(word, 22, 10);
  children.push(word);

  return assemble(g, children, 110);
}

export const logoPop: AnimationTemplate = {
  id: 'logo-pop',
  name: 'Logo Sting',
  category: 'logo',
  description: 'A disc pops, a star spins in, a wordmark fades up.',
  tags: ['logo', 'sting', 'brand', 'intro', 'reveal', 'badge'],
  durationFrames: 110,
  authorFps: 30,
  build,
};
