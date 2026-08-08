import type { Layer, Vec2, Vec4 } from '../../core/types';
import type { AnimationTemplate } from '../types';
import { group, box, dot, card, label, assemble, flyIn, fadeIn, fadeOut, twinkle } from '../kit';

const PHONE: Vec4 = [0.12, 0.13, 0.16, 1];
const SCREEN: Vec4 = [0.13, 0.16, 0.22, 1];
const HEADER: Vec4 = [0.16, 0.2, 0.28, 1];
const NAME: Vec4 = [0.9, 0.93, 0.98, 1];
const ONLINE: Vec4 = [0.3, 0.85, 0.45, 1];
const IN_BUB: Vec4 = [0.24, 0.27, 0.34, 1];
const IN_TXT: Vec4 = [0.9, 0.92, 0.96, 1];
const OUT_BUB: Vec4 = [0.2, 0.5, 0.95, 1];
const OUT_TXT: Vec4 = [1, 1, 1, 1];
const DOT: Vec4 = [0.6, 0.65, 0.72, 1];

interface Msg { text: string; incoming: boolean; at: number }
const THREAD: Msg[] = [
  { text: 'Hey! Are you free?', incoming: true, at: 8 },
  { text: "Yeah, what's up?", incoming: false, at: 30 },
  { text: 'Made you something', incoming: true, at: 52 },
];

function build(ctx: { center: Vec2 }): Layer[] {
  const g = group('Phone Chat', ctx.center);
  const c: Layer[] = [];

  // Device
  c.push(card([0, 0], 470, 940, 62, PHONE));
  c.push(card([0, 6], 430, 852, 46, SCREEN));
  c.push(card([0, -404], 150, 26, 13, PHONE)); // notch
  c.push(box([0, -372], 430, 64, HEADER));
  c.push(dot([-150, -372], 8, ONLINE));
  c.push(label('Alex', [-70, -388], { size: 28, weight: 700, color: NAME, align: 'left' }));

  // Messages
  for (const m of THREAD) {
    const y = -250 + THREAD.indexOf(m) * 116;
    const x = m.incoming ? -66 : 66;
    const w = Math.min(320, Math.max(170, m.text.length * 15 + 44));
    const bub = card([x, y], w, 78, 26, m.incoming ? IN_BUB : OUT_BUB);
    flyIn(bub, m.at, 12, [0, 30]);
    c.push(bub);
    const t = label(m.text, [x, y - 16], { size: 26, weight: 500, color: m.incoming ? IN_TXT : OUT_TXT });
    flyIn(t, m.at, 12, [0, 30]);
    c.push(t);
  }

  // Typing indicator (incoming), then the final reply lands
  const typeAt = 74;
  const typeY = 98;
  const typeBub = card([-66, typeY], 96, 56, 24, IN_BUB);
  flyIn(typeBub, typeAt, 8, [0, 20]);
  fadeOut(typeBub, typeAt + 26, 6);
  c.push(typeBub);
  for (let i = 0; i < 3; i++) {
    const d = dot([-92 + i * 26, typeY - 2], 7, DOT);
    fadeIn(d, typeAt, 6);
    twinkle(d, 18, 2, typeAt + i * 6, 0.3);
    fadeOut(d, typeAt + 26, 6);
    c.push(d);
  }
  const reply = card([66, typeY], 250, 78, 26, OUT_BUB);
  flyIn(reply, typeAt + 30, 12, [0, 30]);
  c.push(reply);
  const replyT = label("Can't wait!", [66, typeY - 16], { size: 26, weight: 500, color: OUT_TXT });
  flyIn(replyT, typeAt + 30, 12, [0, 30]);
  c.push(replyT);

  return assemble(g, c, 150);
}

export const phoneMessages: AnimationTemplate = {
  id: 'phone-messages',
  name: 'Phone Chat',
  category: 'ui',
  description: 'Text messages pop into a phone one by one, with a typing indicator.',
  tags: ['phone', 'chat', 'messages', 'text', 'sms', 'ui', 'social', 'bubbles'],
  durationFrames: 150,
  authorFps: 30,
  build,
};
