import type { Layer, Vec2, Vec4 } from '../../core/types';
import type { AnimationTemplate } from '../types';
import { group, card, dot, label, assemble, popIn, flyIn, fadeIn, setKeys, SPRING, EASE_OUT, EASE_IO } from '../kit';

// Flagship: an animated month calendar — a card, a month title that flies in, a weekday header row
// that staggers in, and a grid of day circles + numbers that cascade in, with one highlighted day
// that pops and then pulses on a loop. Everything is ordinary shape/text/group layers with real
// keyframes, so the user can edit any piece afterwards.

const MONTH = 'AUGUST 2026';
const DAYS = 31;
const FIRST_WEEKDAY = 5; // Aug 1 2026 is a Saturday (0=Sun … 6=Sat)
const HIGHLIGHT = 8;
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const COL = 92;        // horizontal spacing
const ROW = 92;        // vertical spacing
const R = 34;          // day-circle radius
const COL0 = -(6 * COL) / 2; // x of column 0
const HEADER_Y = -196;
const ROW0_Y = -104;

const CARD_FILL: Vec4 = [0.08, 0.1, 0.18, 1];
const CELL_FILL: Vec4 = [0.16, 0.2, 0.3, 1];
const HL_FILL: Vec4 = [0.969, 0.71, 0.0, 1];
const TITLE_COL: Vec4 = [0.95, 0.96, 1, 1];
const HEADER_COL: Vec4 = [0.55, 0.62, 0.78, 1];
const NUM_COL: Vec4 = [0.85, 0.89, 0.96, 1];
const HL_NUM_COL: Vec4 = [0.06, 0.08, 0.14, 1];

function build(ctx: { center: Vec2 }): Layer[] {
  const g = group('Calendar', ctx.center);
  const children: Layer[] = [];

  // Card + title
  const bg = card([0, 6], 720, 660, 28, CARD_FILL);
  popIn(bg, 0, 10);
  children.push(bg);

  const title = label(MONTH, [0, -286], { size: 52, weight: 700, color: TITLE_COL });
  flyIn(title, 6, 12, [0, -40]);
  children.push(title);

  // Weekday header row
  WEEKDAYS.forEach((w, c) => {
    const h = label(w, [COL0 + c * COL, HEADER_Y], { size: 24, weight: 600, color: HEADER_COL });
    fadeIn(h, 10 + c * 1.5, 8);
    children.push(h);
  });

  // Day grid
  for (let d = 1; d <= DAYS; d++) {
    const index = FIRST_WEEKDAY + (d - 1);
    const c = index % 7;
    const row = Math.floor(index / 7);
    const x = COL0 + c * COL;
    const y = ROW0_Y + row * ROW;
    const at = 16 + index * 0.7;
    const highlighted = d === HIGHLIGHT;

    const circle = dot([x, y], R, highlighted ? HL_FILL : CELL_FILL);
    if (highlighted) {
      // pop in with the cascade, then pulse on a loop
      setKeys(circle.transform.scale, [
        { f: at, v: [0, 0] },
        { f: at + 10, v: [1, 1], ease: SPRING },
        { f: 74, v: [1, 1], ease: EASE_IO },
        { f: 90, v: [1.1, 1.1], ease: EASE_IO },
        { f: 106, v: [1, 1], ease: EASE_IO },
        { f: 122, v: [1.1, 1.1], ease: EASE_IO },
        { f: 138, v: [1, 1], ease: EASE_IO },
      ]);
      setKeys(circle.transform.opacity, [{ f: at, v: 0 }, { f: at + 4, v: 1, ease: EASE_OUT }]);
    } else {
      popIn(circle, at, 10);
    }
    children.push(circle);

    const num = label(String(d), [x, y + 9], { size: 28, weight: highlighted ? 700 : 500, color: highlighted ? HL_NUM_COL : NUM_COL });
    if (highlighted) {
      setKeys(num.transform.scale, [{ f: at, v: [0, 0] }, { f: at + 10, v: [1, 1], ease: SPRING }]);
      setKeys(num.transform.opacity, [{ f: at, v: 0 }, { f: at + 4, v: 1, ease: EASE_OUT }]);
    } else {
      popIn(num, at, 10);
    }
    children.push(num);
  }

  return assemble(g, children, 150);
}

export const calendarMonth: AnimationTemplate = {
  id: 'calendar-month',
  name: 'Month Calendar',
  category: 'calendar',
  description: 'A month grid with a highlighted, pulsing day. Circles + numbers cascade in.',
  tags: ['calendar', 'month', 'date', 'grid', 'schedule', 'day'],
  durationFrames: 150,
  authorFps: 30,
  build,
};
