import type { Layer, Vec2, Vec4 } from '../../core/types';
import type { AnimationTemplate } from '../types';
import { group, box, dot, card, label, assemble, setKeys, floatLoop, fallLoop, EASE_IN, EASE_OUT } from '../kit';

// A split-flap airport departure board. Every character flips independently (a vertical squash of its
// cell that reveals the glyph at the thin point), staggered so the board resolves in a wave from the
// top-left. Behind it, through the "terminal glass", planes taxi in parallax; rain streaks drift over
// the glass (overlay approximation of a track matte). A scene people recognise instantly, exercising
// character-splitting, smart stagger, and grid indexing.

const SKY: Vec4 = [0.24, 0.34, 0.5, 1];
const TARMAC: Vec4 = [0.2, 0.22, 0.27, 1];
const FRAME: Vec4 = [0.05, 0.06, 0.08, 1];
const FLAP: Vec4 = [0.09, 0.1, 0.13, 1];
const SEAM: Vec4 = [0.02, 0.02, 0.03, 1];
const CHAR: Vec4 = [1, 0.82, 0.3, 1];
const BODY: Vec4 = [0.82, 0.85, 0.9, 1];
const WING: Vec4 = [0.68, 0.71, 0.77, 1];
const TAIL: Vec4 = [0.8, 0.45, 0.45, 1];
const GLASS: Vec4 = [0.55, 0.7, 0.9, 0.06];
const RAIN: Vec4 = [0.82, 0.9, 1, 0.32];

const ROWS = ['DEPARTURES  ', 'BA249 TOKYO ', 'AF012 PARIS ', 'JL801 SEOUL ', 'UA355 DUBAI '];
const COLS = 12;
const DUR = 240;
const CELL_W = 76, PITCH_X = 80, PITCH_Y = 56;
const COL0 = -440;   // x of column 0
const ROW0 = -262;   // y of row 0

function plane(cx: number, cy: number, scale: number, c: Layer[], drift: { dx: number; dy: number; period: number; cycles: number; phase: number }): void {
  const pg = group('Plane', [cx, cy]);
  pg.transform.scale.defaultValue = [scale, scale];
  floatLoop(pg, drift.dx, drift.dy, drift.period, drift.cycles, 0, drift.phase);
  c.push(pg);
  const parts: Layer[] = [
    card([0, 0], 150, 30, 15, BODY),
    dot([76, 0], 15, BODY),
    box([-66, -20], 20, 40, TAIL),
    box([-6, 14], 52, 12, WING),
    dot([-30, -4], 4, [0.4, 0.5, 0.6, 1]), dot([-8, -4], 4, [0.4, 0.5, 0.6, 1]), dot([14, -4], 4, [0.4, 0.5, 0.6, 1]),
  ];
  for (const p of parts) { p.parentId = pg.id; c.push(p); }
}

function build(ctx: { center: Vec2 }): Layer[] {
  const g = group('Departure Board', ctx.center);
  const c: Layer[] = [];

  // Terminal window: sky + tarmac
  c.push(box([0, -160], 2000, 900, SKY));
  c.push(box([0, 380], 2000, 440, TARMAC));

  // Parallax planes taxiing on the tarmac (behind the board)
  plane(-200, 250, 0.7, c, { dx: 420, dy: 0, period: 200, cycles: 1.2, phase: 0 });      // far, slow
  plane(160, 320, 1.0, c, { dx: 520, dy: 0, period: 150, cycles: 1.6, phase: 3.1 });      // near, faster
  plane(-40, 210, 0.85, c, { dx: 380, dy: -70, period: 240, cycles: 1, phase: 1.5 });     // climbing away

  // Board frame
  c.push(card([0, -148], 1020, 306, 14, FRAME));

  // Split-flap grid
  ROWS.forEach((rowStr, r) => {
    for (let col = 0; col < COLS; col++) {
      const cx = COL0 + col * PITCH_X;
      const cy = ROW0 + r * PITCH_Y;
      const cell = group(`cell-${r}-${col}`, [cx, cy]);
      const ft = 24 + r * 9 + col * 3; // wave from top-left
      setKeys(cell.transform.scale, [
        { f: ft, v: [1, 1] }, { f: ft + 6, v: [1, 0.05], ease: EASE_IN }, { f: ft + 12, v: [1, 1], ease: EASE_OUT },
      ]);
      c.push(cell);
      const flap = box([0, 0], CELL_W, PITCH_Y - 6, FLAP);
      flap.parentId = cell.id;
      c.push(flap);
      const ch = rowStr[col];
      if (ch !== ' ') {
        const t = label(ch, [0, -6], { size: 34, weight: 800, color: CHAR });
        t.parentId = cell.id;
        setKeys(t.transform.opacity, [{ f: 0, v: 0 }, { f: ft + 5, v: 0 }, { f: ft + 6, v: 1 }]); // revealed at the flip's thin point
        c.push(t);
      }
    }
  });

  // Fixed seam line across each row's midline (the flaps flip past it)
  for (let r = 0; r < ROWS.length; r++) c.push(box([0, ROW0 + r * PITCH_Y], COLS * PITCH_X - 8, 3, SEAM));

  // Glass tint + rain streaks over everything
  c.push(box([0, 0], 2000, 1200, GLASS));
  for (let i = 0; i < 30; i++) {
    const x = ((i * 131) % 1900) - 950;
    const streak = box([x, -560], 3, 46, RAIN);
    streak.transform.rotation.defaultValue = 15;
    fallLoop(streak, 1160, 22 + (i % 4) * 4, 6, (i * 9) % 26, 40);
    c.push(streak);
  }

  return assemble(g, c, DUR);
}

export const departureBoard: AnimationTemplate = {
  id: 'split-flap-board',
  name: 'Departure Board',
  category: 'showcase',
  description: 'A split-flap board resolves in a wave while planes taxi behind rain-streaked glass.',
  tags: ['split flap', 'airport', 'departures', 'board', 'flip', 'terminal', 'showcase', 'planes'],
  durationFrames: DUR,
  authorFps: 30,
  build,
};
