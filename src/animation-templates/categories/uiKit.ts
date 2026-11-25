import { createKeyframe, createPolygonLayer, createProperty } from '../../core/factory';
import type { AnimatableProperty, AnimatableColor, GroupLayer, Layer, PathVertex, ShapeLayer, Vec2, Vec4 } from '../../core/types';
import { buildKeyframesFromSpecs, type KeyframeSpec } from '../../core/keyframeSpecs';
import { typeOnByCharacter } from '../../core/textAnimatorPresets';
import type { AnimationTemplate, BuildCtx } from '../types';
import { group, card, box, dot, label, assemble } from '../kit';
import { buildAgentCursor, findCursorRig, planCursorMove, planCursorClick, buildClickRipple } from '../cursorRig';

// B35 UI-mock kit: the narration-as-UI pieces of the reference cold opens (search bar that types with a
// caret, toggle / pill state switch clicked by a cursor, chat bubbles with tails, a notification
// banner). Everything is ordinary shape / text / group layers with real keys (named eases through
// core/keyframeSpecs), so it stays editable after insert: retype a query with agent.setTextContent, recolour
// with updateLayerProperty / setKeyframes, retime in the timeline. Frames are 0-based (rebased on insert).

const keys = (prop: AnimatableProperty, specs: KeyframeSpec[]): void => { prop.keyframes = buildKeyframesFromSpecs(specs); };
const colorTrack = (name: string, specs: KeyframeSpec[]): AnimatableColor => ({
  id: createProperty(name, 'number', 0).id, name, valueType: 'color', defaultValue: specs[0].value as Vec4, keyframes: buildKeyframesFromSpecs(specs),
});
const corners = (pts: Vec2[]): PathVertex[] => pts.map((p) => ({ position: p, handleIn: [0, 0], handleOut: [0, 0], vertexType: 'corner' as const }));
/** Text optical centring: the text quad is centred on its position, the glyphs sit ~0.2 em above that. */
const textY = (y: number, size: number): number => y + size * 0.2;
/** Rough line width for layout (Inter-ish average advance); the text itself is measured by the renderer. */
const estWidth = (s: string, size: number): number => s.length * size * 0.5;

// ---------------------------------------------------------------------------------------------
// Search bar: the pill stretches open, a placeholder shows, then the query types on behind a caret.
// ---------------------------------------------------------------------------------------------
const PILL: Vec4 = [0.996, 0.996, 0.996, 1];
const INK: Vec4 = [0.024, 0.02, 0.024, 1];
const HINT: Vec4 = [0.573, 0.573, 0.576, 1];
const BLUE: Vec4 = [0.035, 0.533, 0.965, 1];
const QUERY = "What's your fav color?";

function buildSearchBar(ctx: BuildCtx): Layer[] {
  const g = group('Search Bar', ctx.center);
  const c: Layer[] = [];

  const pill = card([0, 0], 680, 104, 52, PILL);
  pill.name = 'Search pill';
  if (pill.shape.type === 'rectangle') keys(pill.shape.width, [{ frame: 0, value: 104, ease: 'expoOut' }, { frame: 20, value: 680 }]);
  keys(pill.transform.opacity, [{ frame: 0, value: 0, ease: 'quadOut' }, { frame: 6, value: 1 }]);
  c.push(pill);

  const lens = dot([-284, -5], 14, [0, 0, 0, 0]);
  lens.name = 'Search icon';
  if (lens.shape.type === 'circle') { lens.shape.strokeColor = HINT; lens.shape.strokeWidth.defaultValue = 4; }
  const handle = box([-271, 9], 4, 13, HINT);
  handle.name = 'Search icon handle';
  handle.transform.rotation.defaultValue = -45;
  for (const l of [lens, handle]) keys(l.transform.opacity, [{ frame: 10, value: 0, ease: 'quadOut' }, { frame: 18, value: 1 }]);
  c.push(lens, handle);

  const hint = label('Search anything', [-10, textY(0, 34)], { size: 34, weight: 400, color: HINT });
  hint.name = 'Placeholder';
  keys(hint.transform.opacity, [{ frame: 12, value: 0, ease: 'quadOut' }, { frame: 20, value: 1, ease: 'hold' }, { frame: 30, value: 0 }]);
  c.push(hint);

  // The query: type-on from frame 30 over 44 frames (offset starts one glyph early so nothing shows
  // before the first keystroke), caret from frame 14 (blinks in the empty field, solid while typing).
  const query = label(QUERY, [-10, textY(0, 36)], { size: 36, weight: 500, color: INK });
  query.name = 'Query';
  const typeOn = typeOnByCharacter(30, 44);
  typeOn.offset = createProperty('Animator Offset', 'number', 0);
  typeOn.offset.keyframes = [createKeyframe(30, -1 / QUERY.length - 0.001, 'linear'), createKeyframe(74, 1, 'linear')];
  query.animators = [typeOn];
  query.caret = { enabled: true, style: 'bar', color: BLUE, width: 3, blinkRate: 1.2, startFrame: 14 };
  c.push(query);

  const btn = dot([296, 0], 32, BLUE);
  btn.name = 'Search button';
  keys(btn.transform.scale, [{ frame: 14, value: [0, 0], ease: 'backOut' }, { frame: 26, value: [1, 1], ease: 'hold' }, { frame: 84, value: [1, 1], ease: 'cubicOut' }, { frame: 87, value: [0.86, 0.86], ease: 'backOut' }, { frame: 95, value: [1, 1] }]);
  c.push(btn);
  const arrow = label('→', [296, textY(0, 30)], { size: 30, weight: 700, color: PILL });
  arrow.name = 'Search button arrow';
  keys(arrow.transform.opacity, [{ frame: 18, value: 0 }, { frame: 24, value: 1 }]);
  c.push(arrow);

  return assemble(g, c, 120);
}

export const searchBarTyping: AnimationTemplate = {
  id: 'search-bar-typing',
  name: 'Search Bar Typing',
  category: 'ui',
  description: 'A search pill stretches open, the placeholder shows, then a query types on behind a blue caret and the button taps.',
  tags: ['search', 'bar', 'typing', 'caret', 'cursor', 'query', 'ui', 'input', 'type-on'],
  durationFrames: 120,
  authorFps: 30,
  build: buildSearchBar,
};

// ---------------------------------------------------------------------------------------------
// Toggle: a cursor glides in and clicks the switch; the knob slides and the track turns green.
// ---------------------------------------------------------------------------------------------
const TRACK_OFF: Vec4 = [0.78, 0.79, 0.82, 1];
const TRACK_ON: Vec4 = [0.2, 0.78, 0.35, 1];
const WHITE: Vec4 = [1, 1, 1, 1];
const LABEL_INK: Vec4 = [0.93, 0.94, 0.97, 1];

function buildToggle(ctx: BuildCtx): Layer[] {
  const g = group('Toggle Switch', ctx.center);
  const c: Layer[] = [];
  const panel = card([0, 0], 560, 150, 36, [0.13, 0.14, 0.18, 1]);
  panel.name = 'Settings row';
  c.push(panel);
  const text = label('Notifications', [-80, textY(0, 40)], { size: 40, weight: 600, color: LABEL_INK });
  c.push(text);

  const onAt = 30; // the click lands at 28; the UI answers 2 frames later
  const track = card([170, 0], 128, 72, 36, TRACK_OFF);
  track.name = 'Toggle track';
  track.animProps = { fillColor: colorTrack('Fill Color', [{ frame: onAt, value: TRACK_OFF, ease: 'cubicInOut' }, { frame: onAt + 8, value: TRACK_ON }]) };
  c.push(track);
  const knob = dot([142, 0], 28, WHITE);
  knob.name = 'Toggle knob';
  keys(knob.transform.position, [{ frame: onAt, value: [142, 0], ease: 'backOut' }, { frame: onAt + 10, value: [198, 0] }]);
  keys(knob.transform.scale, [{ frame: onAt, value: [1, 1], ease: 'quadOut' }, { frame: onAt + 4, value: [1.15, 0.9], ease: 'quadOut' }, { frame: onAt + 10, value: [1, 1] }]);
  c.push(knob);

  // The B51 cursor rig, in group-local space: enters bottom right, clicks the switch, drifts off.
  const cursorLayers = buildAgentCursor({ icon: 'arrow', x: 330, y: 160, frame: 0, endFrame: 90, size: 40 });
  const rig = findCursorRig(cursorLayers, cursorLayers[0].id);
  let cur: GroupLayer = planCursorMove(rig.group, { frame: 8, to: [150, 8], fps: 30, durationFrames: 14 }).group;
  cur = planCursorClick(cur, { frame: 28 });
  const ripple = buildClickRipple(cur, 28, { color: [1, 1, 1, 0.8] });
  ripple.inPoint = 0; // template clips all start at 0 (the ring is transparent until the click)
  cur = planCursorMove(cur, { frame: 52, to: [300, 120], fps: 30 }).group;
  keys(cur.transform.opacity, [{ frame: 0, value: 0, ease: 'quadOut' }, { frame: 6, value: 1 }]);
  c.push(ripple, cur, ...cursorLayers.slice(1));

  return assemble(g, c, 90);
}

export const toggleSwitch: AnimationTemplate = {
  id: 'toggle-switch',
  name: 'Toggle Switch Click',
  category: 'ui',
  description: 'A cursor glides in and clicks a settings toggle: the knob springs across and the track turns green.',
  tags: ['toggle', 'switch', 'pill', 'cursor', 'click', 'settings', 'ui', 'on', 'off'],
  durationFrames: 90,
  authorFps: 30,
  build: buildToggle,
};

// ---------------------------------------------------------------------------------------------
// Chat bubbles: received (grey, tail bottom left) and sent (blue, tail bottom right) pop from their tails.
// ---------------------------------------------------------------------------------------------
const RECV: Vec4 = [0.91, 0.91, 0.93, 1];
const RECV_INK: Vec4 = [0.08, 0.08, 0.1, 1];
const SENT: Vec4 = [0.04, 0.52, 1, 1];
const SENT_INK: Vec4 = [1, 1, 1, 1];

interface Bubble { text: string; sent: boolean; at: number }
const BUBBLES: Bubble[] = [
  { text: 'Did you see the new edit?', sent: false, at: 6 },
  { text: 'Yes! The caret is so smooth', sent: true, at: 34 },
  { text: 'Ship it today', sent: false, at: 70 },
];

/** One bubble = a group pivoting at its tail tip (so it pops out of the tail) + body + tail + text. */
function bubble(b: Bubble, y: number): Layer[] {
  const size = 32;
  const w = Math.max(160, estWidth(b.text, size) + 64);
  const h = 76;
  const side = b.sent ? 1 : -1;
  const tip: Vec2 = [side * 300, y + h / 2 + 4];
  const sub = group(b.sent ? 'Sent bubble' : 'Received bubble', tip);
  // Local space: origin = the tail tip. The body sits up and inward of it.
  const bodyX = -side * (w / 2 - 6);
  const body = card([bodyX, -h / 2 - 4], w, h, 30, b.sent ? SENT : RECV);
  body.name = 'Bubble';
  const tail: ShapeLayer = createPolygonLayer('Tail', 0, 0, corners(b.sent
    ? [[0, 0], [-26, -22], [-6, -26]]
    : [[0, 0], [26, -22], [6, -26]]), true, b.sent ? SENT : RECV, 600);
  if (tail.shape.type === 'polygon') { tail.shape.strokeColor = [0, 0, 0, 0]; tail.shape.strokeWidth.defaultValue = 0; }
  const text = label(b.text, [bodyX, textY(-h / 2 - 4, size)], { size, weight: 500, color: b.sent ? SENT_INK : RECV_INK });
  for (const l of [body, tail, text]) l.parentId = sub.id;
  keys(sub.transform.scale, [{ frame: b.at, value: [0.2, 0.2], ease: 'backOut' }, { frame: b.at + 12, value: [1, 1] }]);
  keys(sub.transform.opacity, [{ frame: b.at, value: 0, ease: 'quadOut' }, { frame: b.at + 4, value: 1 }]);
  return [sub, body, tail, text];
}

function buildChat(ctx: BuildCtx): Layer[] {
  const g = group('Chat Bubbles', ctx.center);
  const c: Layer[] = [];
  BUBBLES.forEach((b, i) => c.push(...bubble(b, -150 + i * 120)));
  // Typing dots before the last received bubble.
  const dotsY = -150 + 2 * 120;
  const holder = card([-250, dotsY], 110, 60, 30, RECV);
  holder.name = 'Typing bubble';
  keys(holder.transform.opacity, [{ frame: 48, value: 0, ease: 'quadOut' }, { frame: 52, value: 1, ease: 'hold' }, { frame: 68, value: 0 }]);
  c.push(holder);
  for (let i = 0; i < 3; i++) {
    const d = dot([-276 + i * 26, dotsY], 7, [0.55, 0.56, 0.6, 1]);
    d.name = `Typing dot ${i + 1}`;
    keys(d.transform.opacity, [{ frame: 48, value: 0, ease: 'hold' }, { frame: 52, value: 1, ease: 'hold' }, { frame: 68, value: 0 }]);
    const bob: KeyframeSpec[] = [];
    for (let f = 52 + i * 3; f < 68; f += 8) bob.push({ frame: f, value: [-276 + i * 26, dotsY], ease: 'sineInOut' }, { frame: f + 4, value: [-276 + i * 26, dotsY - 8], ease: 'sineInOut' });
    keys(d.transform.position, bob);
    c.push(d);
  }
  return assemble(g, c, 110);
}

export const chatBubbles: AnimationTemplate = {
  id: 'chat-bubbles',
  name: 'Chat Bubbles',
  category: 'ui',
  description: 'Received and sent message bubbles with tails pop out of their tails, with a typing indicator before the reply.',
  tags: ['chat', 'bubble', 'message', 'imessage', 'dm', 'tail', 'typing', 'ui', 'social'],
  durationFrames: 110,
  authorFps: 30,
  build: buildChat,
};

// ---------------------------------------------------------------------------------------------
// Notification banner: drops in from above with an overshoot, holds, slides back up.
// ---------------------------------------------------------------------------------------------
function buildNotification(ctx: BuildCtx): Layer[] {
  const g = group('Notification', ctx.center);
  const c: Layer[] = [];
  const panel = card([0, 0], 720, 140, 34, [0.97, 0.97, 0.98, 1]);
  panel.name = 'Banner';
  const icon = card([-290, 0], 84, 84, 20, [0.04, 0.52, 1, 1]);
  icon.name = 'App icon';
  const glyph = label('F', [-290, textY(0, 48)], { size: 48, weight: 800, color: WHITE });
  const title = label('FlashFX', [-120, textY(-24, 30)], { size: 30, weight: 700, color: [0.08, 0.08, 0.1, 1] });
  const body = label('Your video is ready to share', [-10, textY(22, 28)], { size: 28, weight: 400, color: [0.35, 0.36, 0.4, 1] });
  const when = label('now', [310, textY(-24, 24)], { size: 24, weight: 400, color: [0.55, 0.56, 0.6, 1] });
  const content = [panel, icon, glyph, title, body, when];
  const slide = group('Banner slide', [0, 0]);
  for (const l of content) l.parentId = slide.id;
  keys(slide.transform.position, [
    { frame: 0, value: [0, -260], ease: 'backOut' }, { frame: 16, value: [0, 0], ease: 'hold' },
    { frame: 70, value: [0, 0], ease: 'cubicIn' }, { frame: 84, value: [0, -260] },
  ]);
  keys(slide.transform.opacity, [{ frame: 0, value: 0, ease: 'quadOut' }, { frame: 6, value: 1, ease: 'hold' }, { frame: 78, value: 1, ease: 'quadIn' }, { frame: 84, value: 0 }]);
  c.push(slide, ...content);
  return assemble(g, c, 90);
}

export const notificationBanner: AnimationTemplate = {
  id: 'notification-banner',
  name: 'Notification Banner',
  category: 'ui',
  description: 'A phone-style notification drops in from the top with a little overshoot, holds, then slides away.',
  tags: ['notification', 'banner', 'alert', 'push', 'toast', 'ui', 'phone'],
  durationFrames: 90,
  authorFps: 30,
  build: buildNotification,
};
