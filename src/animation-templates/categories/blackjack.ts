import type { AnimationTemplate, BuildCtx } from '../types';
import type { Layer, Vec2, Vec4, FontWeight } from '../../core/types';
import { group, card, label, setKeys, assemble, EASE_OUT, EASE_IO } from '../kit';
import { createCameraLayer, createProperty } from '../../core/factory';

// Blackjack Deal — a top-down casino table. The dealer distributes two hands (Player A♠ 10♥ = 21,
// Dealer K♦ 7♣ = 17) with staggered card throws; a slow 2.5D camera push-in + drift gives it depth
// and energy; and a monospace commentary types each hand out one character at a time. ~13s @ 30fps.
//
// Conventions (see kit.ts): scene layers are authored group-local around (0,0) and made is3D so the
// camera projects them; the CAMERA is authored in COMP space (cx,cy) and mirrors categories/parallax.

const FELT: Vec4 = [0.086, 0.30, 0.196, 1];
const FELT_RIM: Vec4 = [0.05, 0.17, 0.115, 1];
const CARD: Vec4 = [0.97, 0.97, 0.95, 1];
const INK: Vec4 = [0.10, 0.11, 0.14, 1];   // black suits ♠ ♣
const RED: Vec4 = [0.80, 0.12, 0.16, 1];   // red suits ♥ ♦
const LIGHT: Vec4 = [0.86, 0.90, 0.94, 1]; // commentary
const GOLD: Vec4 = [0.97, 0.72, 0.10, 1];

const CARD_W = 150, CARD_H = 210, RADIUS = 12, IN = 16;
const DECK: Vec2 = [560, -340]; // where cards are thrown from (top-right)
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

/** Make a layer 3D on the focal plane at depth z (mirrors parallax.ts's `depth`). */
function depth<T extends Layer>(l: T, z: number): T {
  l.is3D = true;
  l.transform.positionZ = createProperty('Z Position', 'number', z);
  return l;
}

/** Throw a card (white rounded rect + its rank/suit label) from the deck to `rest`, settling with a
 *  small rotation and grow. The two layers share keyframes so they move as one. */
function deal(layers: Layer[], rest: Vec2, rank: string, red: boolean, rot: number, at: number): void {
  const c = card(rest, CARD_W, CARD_H, RADIUS, CARD);
  const textRest: Vec2 = [rest[0], rest[1] + 6];
  const t = label(rank, textRest, { size: 54, weight: 800, color: red ? RED : INK, align: 'center' });
  for (const [l, home] of [[c, rest], [t, textRest]] as [Layer, Vec2][]) {
    depth(l, 0);
    setKeys(l.transform.position, [{ f: 0, v: DECK }, { f: at, v: DECK }, { f: at + IN, v: home, ease: EASE_OUT }]);
    setKeys(l.transform.rotation, [{ f: 0, v: -26 }, { f: at, v: -26 }, { f: at + IN, v: rot, ease: EASE_OUT }]);
    setKeys(l.transform.opacity, [{ f: 0, v: 0 }, { f: Math.max(0, at - 1), v: 0 }, { f: at + 3, v: 1 }]);
    setKeys(l.transform.scale, [{ f: at, v: [0.86, 0.86] }, { f: at + IN, v: [1, 1], ease: EASE_OUT }]);
  }
  layers.push(c, t);
}

/** Type a line of text one character at a time — one is3D monospace label per glyph, staggered. */
function typeLine(layers: Layer[], text: string, x: number, y: number, at: number, size: number, color: Vec4, weight: FontWeight = 700): void {
  const adv = size * 0.6; // monospace advance so the reveal is even
  const CPS = 2;          // frames per character
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === ' ') continue; // spaces still consume an index (advance + a tiny time gap)
    const gx = x + i * adv;
    const l = label(ch, [gx, y], { size, weight, color, align: 'left' });
    if (l.content?.spans?.[0]) l.content.spans[0].style.fontFamily = MONO;
    depth(l, 0); // focal plane — scales with the cards under the push-in, stays in frame
    const f = at + i * CPS;
    setKeys(l.transform.opacity, [{ f: 0, v: 0 }, { f: Math.max(0, f - 1), v: 0 }, { f: f + 2, v: 1 }]);
    setKeys(l.transform.position, [{ f: f, v: [gx, y + 10] }, { f: f + 6, v: [gx, y], ease: EASE_OUT }]);
    layers.push(l);
  }
}

function build(ctx: BuildCtx): Layer[] {
  const [cx, cy] = ctx.center;
  const W = cx * 2, H = cy * 2, DUR = 390;
  const g = group('Blackjack', ctx.center);
  const layers: Layer[] = [];

  // Felt table (rim behind, rounded felt in front) — farthest depth so the camera push reads.
  const rim = depth(card([0, 0], W + 240, H + 180, 130, FELT_RIM), 210);
  setKeys(rim.transform.opacity, [{ f: 0, v: 0 }, { f: 14, v: 1 }]);
  const felt = depth(card([0, 30], W - 30, H - 110, 90, FELT), 150);
  setKeys(felt.transform.opacity, [{ f: 2, v: 0 }, { f: 18, v: 1 }]);
  layers.push(rim, felt);

  // Deal: dealer (top) then player (bottom), interleaved.
  deal(layers, [-90, -250], 'K♦', true, -6, 36);  // dealer 1: K♦
  deal(layers, [-90, 155], 'A♠', false, -5, 54);  // player 1: A♠
  deal(layers, [90, -250], '7♣', false, 6, 78);   // dealer 2: 7♣
  deal(layers, [90, 155], '10♥', true, 5, 96);    // player 2: 10♥ (completes 21)

  // Commentary — types out each hand character by character (monospace, left-anchored). Kept in the
  // upper-middle-left band so the push-in never clips it.
  typeLine(layers, 'PLAYER  A♠  10♥   = 21', -560, 300, 132, 40, LIGHT);
  typeLine(layers, 'DEALER  K♦  7♣    = 17', -560, 356, 206, 40, LIGHT);
  typeLine(layers, 'BLACKJACK', -560, 414, 276, 56, GOLD, 800);

  // Camera — a slow cinematic push-in with a gentle drift (comp space; mirrors parallax.ts). Kept
  // modest so the spread-out top-down table stays fully framed through the whole move.
  const cam = createCameraLayer('Camera', W, H, DUR);
  cam.transform.position = createProperty('Position', 'vec2', [cx, cy]);
  setKeys(cam.transform.position, [{ f: 0, v: [cx - 70, cy - 80], ease: EASE_IO }, { f: DUR, v: [cx + 60, cy + 24], ease: EASE_IO }]);
  cam.transform.positionZ = createProperty('Z Position', 'number', -H);
  setKeys(cam.transform.positionZ, [{ f: 0, v: -H * 1.22, ease: EASE_IO }, { f: DUR, v: -H * 1.02, ease: EASE_IO }]);
  cam.camera.pointOfInterest = createProperty('Point of Interest', 'vec2', [cx, cy]);
  cam.camera.pointOfInterestZ = createProperty('POI Z', 'number', 0);
  layers.push(cam);

  return assemble(g, layers, DUR);
}

export const blackjack: AnimationTemplate = {
  id: 'blackjack',
  name: 'Blackjack Deal',
  category: 'showcase',
  description: 'Top-down casino table: the dealer distributes two hands with a cinematic camera push-in and a character-by-character commentary.',
  tags: ['cards', 'casino', 'camera', '2.5d', 'text', 'showcase'],
  durationFrames: 390,
  authorFps: 30,
  build,
};
