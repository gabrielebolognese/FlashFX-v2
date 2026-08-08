import type { Layer, Vec2, Vec4, ShapeLayer } from '../../core/types';
import type { AnimationTemplate } from '../types';
import { group, box, dot, card, label, assemble, setKeys, floatLoop, LINEAR, EASE_OUT, EASE_IN, EASE_IO, SPRING } from '../kit';
import { makeCursor, moveTo, setIcon, click, park, commit } from '../cursor';

// RECURSIVE demo: FlashFX animating a video editor — its own UI, driven by two believable cursors.
// Five regions (toolbar, media bin, preview, inspector, timeline). The cursor motion is baked by the
// cursor engine (bezier arc + ballistic velocity + overshoot + dwell + sub-pixel noise). This is a
// bounded foundation covering the opening beats (assemble → bin hover → drag to timeline → scrub →
// razor cut) plus continuous background life; the same engine + waypoint approach extends to the full
// 30s sheet. NOTE: baked keyframes — the AE-native pieces (data repeaters, expression cursor, precomp
// track mattes, a real nested video) are approximated, not the live features.

const PANEL: Vec4 = [0.11, 0.13, 0.17, 1];
const PANEL2: Vec4 = [0.14, 0.16, 0.21, 1];
const BORDER: Vec4 = [0.28, 0.32, 0.4, 1];
const TXT: Vec4 = [0.78, 0.82, 0.9, 1];
const DIM: Vec4 = [0.45, 0.5, 0.6, 1];
const ACCENT: Vec4 = [0.36, 0.7, 1, 1];
const ACCENT2: Vec4 = [1, 0.55, 0.3, 1]; // cursor 2
const CLIP: Vec4 = [0.24, 0.42, 0.62, 1];
const DUR = 540;

// A UI element that sits slightly dim and brightens when the cursor passes, then dims back.
function hover(l: Layer, at: number): void {
  const ex = l.transform.opacity.keyframes;
  const base: { f: number; v: number; ease?: typeof EASE_OUT }[] = ex.length ? ex.map((k) => ({ f: k.frame, v: k.value as number })) : [{ f: 0, v: 0.85 }];
  base.push({ f: at, v: 0.85 }, { f: at + 4, v: 1, ease: EASE_OUT }, { f: at + 16, v: 0.85, ease: EASE_IN });
  setKeys(l.transform.opacity, base);
}

function build(ctx: { center: Vec2 }): Layer[] {
  const g = group('Recursive Editor', ctx.center);
  const c: Layer[] = [];
  c.push(box([0, 0], 2000, 1180, [0.06, 0.07, 0.1, 1]));

  // ---- Region panels (border draws + fill fades in the cold open) ----
  const panels: { pos: Vec2; w: number; h: number; at: number }[] = [
    { pos: [0, -516], w: 1900, h: 48, at: 0 },        // toolbar
    { pos: [-815, -176], w: 290, h: 632, at: 6 },     // media bin
    { pos: [-180, -176], w: 950, h: 632, at: 12 },    // preview
    { pos: [635, -176], w: 640, h: 632, at: 18 },     // inspector
    { pos: [0, 345], w: 1900, h: 388, at: 24 },       // timeline
  ];
  for (const p of panels) {
    const fill = box(p.pos, p.w, p.h, PANEL);
    setKeys(fill.transform.opacity, [{ f: p.at, v: 0 }, { f: p.at + 18, v: 1, ease: EASE_OUT }]);
    c.push(fill);
    const brd = box(p.pos, p.w, p.h, [0, 0, 0, 0]);
    if (brd.shape.type === 'rectangle') { brd.shape.strokeColor = BORDER; brd.shape.strokeWidth.defaultValue = 1.5; }
    setKeys(brd.transform.scale, [{ f: p.at, v: [0.6, 0.02] }, { f: p.at + 12, v: [1, 1], ease: EASE_OUT }]);
    c.push(brd);
  }

  // ---- Toolbar: tool icons (pop on stagger), timecode, export ----
  const tools = ['select', 'razor', 'hand', 'text', 'zoom'];
  const toolLayers: ShapeLayer[] = [];
  tools.forEach((_, i) => {
    const t = box([-900 + i * 44, -516], 28, 28, PANEL2);
    if (t.shape.type === 'rectangle') t.shape.borderRadius.defaultValue = 6;
    setKeys(t.transform.scale, [{ f: 30 + i * 4, v: [0, 0] }, { f: 30 + i * 4 + 10, v: [1.12, 1.12], ease: SPRING }, { f: 30 + i * 4 + 16, v: [1, 1], ease: EASE_OUT }]);
    toolLayers.push(t);
    c.push(t);
  });
  const razorIcon = toolLayers[1];
  c.push(label('00:00:12:04', [140, -524], { size: 22, weight: 700, color: TXT, align: 'left' }));
  const exportBtn = card([840, -516], 120, 30, 6, ACCENT);
  c.push(exportBtn);
  c.push(label('Export', [840, -526], { size: 18, weight: 700, color: [0.04, 0.08, 0.14, 1] }));

  // ---- Media bin: search + thumbnails ----
  c.push(card([-815, -452], 250, 30, 6, PANEL2));
  c.push(label('Search clips', [-905, -462], { size: 15, color: DIM, align: 'left' }));
  const thumbs: ShapeLayer[] = [];
  for (let i = 0; i < 6; i++) {
    const tx = -880 + (i % 2) * 130;
    const ty = -370 + Math.floor(i / 2) * 150;
    const th = card([tx, ty], 118, 110, 6, PANEL2);
    th.transform.opacity.defaultValue = 0.85;
    c.push(th);
    thumbs.push(th);
    c.push(card([tx, ty - 8], 106, 66, 3, [0.2 + i * 0.03, 0.3, 0.42, 1])); // thumbnail image
    c.push(label(`clip_0${i + 1}`, [tx, ty + 32], { size: 12, color: TXT }));
  }
  // one loading shimmer thumbnail that completes ~11s
  const shimmer = box([-880, -370], 106, 66, [0.5, 0.6, 0.75, 1]);
  setKeys(shimmer.transform.opacity, [{ f: 0, v: 0.15 }, { f: 60, v: 0.4, ease: EASE_IO }, { f: 150, v: 0.15, ease: EASE_IO }, { f: 300, v: 0.4, ease: EASE_IO }, { f: 330, v: 0, ease: EASE_OUT }]);
  c.push(shimmer);

  // ---- Preview canvas: a mini "video" + bounding box + handles ----
  c.push(box([-180, -210], 820, 460, [0.5, 0.72, 0.92, 1]));          // sky
  c.push(box([-180, 60], 820, 160, [0.3, 0.55, 0.35, 1]));            // ground
  const previewSun = dot([120, -300], 46, [1, 0.9, 0.5, 1]);
  floatLoop(previewSun, 0, 8, 120, 4);
  c.push(previewSun);
  const bbox = box([-180, -160], 300, 220, [0, 0, 0, 0]);
  if (bbox.shape.type === 'rectangle') { bbox.shape.strokeColor = ACCENT; bbox.shape.strokeWidth.defaultValue = 2; }
  c.push(bbox);
  const handles: ShapeLayer[] = [];
  for (const [hx, hy] of [[-330, -270], [-180, -270], [-30, -270], [-330, -160], [-30, -160], [-330, -50], [-180, -50], [-30, -50]] as Vec2[]) {
    const hd = box([hx, hy], 10, 10, ACCENT); handles.push(hd); c.push(hd);
  }
  c.push(box([-180, 110], 780, 6, PANEL2)); // scrub bar

  // ---- Inspector: property groups ----
  const groups = ['Transform', 'Effects', 'Color'];
  groups.forEach((name, gi) => {
    const gy = -430 + gi * 150;
    c.push(card([635, gy], 600, 30, 4, PANEL2));
    c.push(label(name, [370, gy - 8], { size: 17, weight: 700, color: TXT, align: 'left' }));
    for (let r = 0; r < 2; r++) {
      const ry = gy + 44 + r * 40;
      c.push(label(r === 0 ? 'Position' : 'Scale', [380, ry - 8], { size: 14, color: DIM, align: 'left' }));
      c.push(box([720, ry], 180, 4, PANEL2));          // slider track
      c.push(dot([700, ry], 8, ACCENT));               // slider handle
      c.push(dot([860, ry], 6, DIM));                  // stopwatch
    }
  });

  // ---- Timeline: track headers + clips + playhead + ruler ----
  const trackNames = ['V3', 'V2', 'V1', 'A1', 'A2'];
  const trackClips: ShapeLayer[] = [];
  trackNames.forEach((tn, ti) => {
    const ty = 210 + ti * 62;
    const header = box([-870, ty], 150, 56, PANEL2);
    setKeys(header.transform.position, [{ f: 30 + ti * 6, v: [-870, ty + 80] }, { f: 30 + ti * 6, v: [-870, ty + 80] }, { f: 40 + ti * 6, v: [-870, ty], ease: EASE_OUT }]);
    setKeys(header.transform.opacity, [{ f: 30 + ti * 6, v: 0 }, { f: 40 + ti * 6, v: 1, ease: EASE_OUT }]);
    c.push(header);
    c.push(label(tn, [-920, ty - 9], { size: 16, weight: 700, color: TXT, align: 'left' }));
    for (const dx of [-30, 0, 30]) c.push(dot([-830 + dx, ty], 5, DIM)); // lock/mute/solo
    // audio meter (bounces) on the A tracks
    if (ti >= 3) { const meter = box([-770, ty], 8, 30, ti === 3 ? [0.4, 0.85, 0.5, 1] : [0.85, 0.7, 0.3, 1]); meterBounce(meter, ti); c.push(meter); }
    // a couple of existing clips per track
    for (let ci = 0; ci < 2; ci++) {
      const cx = -560 + ci * 420 + ti * 40;
      const clip = card([cx, ty], 300, 48, 4, CLIP);
      clip.transform.opacity.defaultValue = 0.9;
      trackClips.push(clip);
      c.push(clip);
    }
  });
  const ruler = box([100, 175], 1660, 2, BORDER);
  c.push(ruler);
  // playhead advancing slowly the whole time
  const playhead = box([-400, 350], 2, 360, [1, 0.8, 0.2, 1]);
  const phKeys: { f: number; v: Vec2; ease?: typeof LINEAR }[] = [];

  // ---- The dragged clip (created by cursor 1) ----
  const dragClip = card([-880, -370], 118, 110, 6, CLIP);
  dragClip.transform.opacity.defaultValue = 0;
  const shadow = card([-880, -366], 118, 110, 10, [0, 0, 0, 0.4]);
  shadow.transform.opacity.defaultValue = 0;
  c.push(shadow, dragClip);

  // =========================== CHOREOGRAPHY ===========================
  const cur1 = makeCursor('Cursor 1', [0.98, 0.98, 1, 1], [1120, 680], 1337);
  cur1.frame = 74; // enters after the assemble
  cur1.posKeys = [{ f: 0, v: [1120, 680] }, { f: 74, v: [1120, 680] }];

  // Beat: arc to the media bin, hovering thumbnails on the way.
  moveTo(cur1, [-760, -520], { overshoot: true });
  moveTo(cur1, thumbPos(thumbs, 0)); hover(thumbs[0], cur1.frame);
  moveTo(cur1, thumbPos(thumbs, 2)); hover(thumbs[2], cur1.frame);
  moveTo(cur1, thumbPos(thumbs, 3)); hover(thumbs[3], cur1.frame);
  const grabF = click(cur1);

  // Beat: drag clip 3 down to timeline track V1. Element leads-lags behind the cursor.
  moveTo(cur1, [-360, 272]);
  dragKeyframes(dragClip, shadow, thumbPos(thumbs, 3), [-360, 272], grabF, cur1);
  const dropF = cur1.frame;
  // dropped clip settles on V1 with a bounce; a new timeline clip + waveform draw in
  const placed = card([-360, 272], 300, 48, 4, [0.3, 0.55, 0.78, 1]);
  placed.transform.opacity.defaultValue = 0;
  setKeys(placed.transform.opacity, [{ f: dropF, v: 0 }, { f: dropF + 2, v: 1 }]);
  setKeys(placed.transform.scale, [{ f: dropF, v: [1, 0.4] }, { f: dropF + 8, v: [1, 1.1], ease: SPRING }, { f: dropF + 16, v: [1, 1], ease: EASE_OUT }]);
  c.push(placed);
  const wave = box([-360, 272], 6, 30, [0.6, 0.8, 1, 0.8]);
  if (wave.shape.type === 'rectangle') setKeys(wave.shape.width, [{ f: dropF + 4, v: 0 }, { f: dropF + 16, v: 280, ease: EASE_OUT }]);
  c.push(wave);
  park(cur1, 200);

  // Beat: grab the playhead, icon → resize, scrub right then back.
  moveTo(cur1, [-400, 200], { overshoot: true });
  setIcon(cur1, 'resize');
  const scrubStart = cur1.frame;
  moveTo(cur1, [520, 200]);
  moveTo(cur1, [40, 200]);
  const scrubEnd = cur1.frame;
  setIcon(cur1, 'arrow');
  park(cur1, 160);

  // Beat: arc to razor tool, click (fills accent), back to timeline as razor, click to cut.
  const razorPos = razorIcon.transform.position.defaultValue as Vec2;
  moveTo(cur1, [razorPos[0], razorPos[1]], { overshoot: true });
  const razorClickF = click(cur1);
  const razorFill = box([razorPos[0], razorPos[1]], 28, 28, ACCENT);
  if (razorFill.shape.type === 'rectangle') razorFill.shape.borderRadius.defaultValue = 6;
  setKeys(razorFill.transform.opacity, [{ f: 0, v: 0 }, { f: razorClickF + 2, v: 0 }, { f: razorClickF + 3, v: 1 }]);
  c.push(razorFill);
  setIcon(cur1, 'razor');
  moveTo(cur1, [-360, 272]);
  const cutF = click(cur1);
  // cut flash + halves separate
  const flash = box([-360, 272], 6, 48, [1, 1, 1, 1]);
  setKeys(flash.transform.opacity, [{ f: cutF, v: 0 }, { f: cutF + 2, v: 1 }, { f: cutF + 6, v: 0, ease: EASE_OUT }]);
  c.push(flash);
  setKeys(placed.transform.position, [{ f: cutF, v: [-360, 272] }, { f: cutF + 6, v: [-372, 272], ease: EASE_OUT }]);
  park(cur1, 240);
  moveTo(cur1, [200, 40]); // rest near the preview

  const cur1Layers = commit(cur1);

  // ---- Cursor 2: fades in at the inspector, drags "Glow" onto a clip (effect badge + bloom) ----
  const cur2 = makeCursor('Cursor 2', ACCENT2, [700, -300], 9001);
  cur2.frame = 250;
  cur2.posKeys = [{ f: 0, v: [700, -300] }, { f: 250, v: [700, -300] }];
  const nameTag = card([760, -300], 96, 22, 4, [ACCENT2[0], ACCENT2[1], ACCENT2[2], 0.9]);
  moveTo(cur2, [635, -286], { overshoot: true });
  click(cur2);
  moveTo(cur2, [-120, 272]);
  const glowDrop = cur2.frame;
  const badge = dot([-40, 254], 9, ACCENT2);
  setKeys(badge.transform.scale, [{ f: glowDrop, v: [0, 0] }, { f: glowDrop + 8, v: [1, 1], ease: SPRING }]);
  c.push(badge);
  // preview bloom
  const bloom = box([-180, -160], 340, 260, [1, 0.9, 0.6, 0]);
  setKeys(bloom.transform.opacity, [{ f: glowDrop, v: 0 }, { f: glowDrop + 12, v: 0.35, ease: EASE_OUT }, { f: glowDrop + 40, v: 0.2, ease: EASE_IO }]);
  c.push(bloom);
  park(cur2, 300);
  const cur2Layers = commit(cur2);
  // cursor-2 name tag trails the cursor with spring lag
  setKeys(nameTag.transform.position, cur2.posKeys.map((k) => ({ f: (k.f as number) + 3, v: [(k.v as Vec2)[0] + 70, (k.v as Vec2)[1] + 16], ease: SPRING })));
  c.push(nameTag, ...cur2Layers, ...cur1Layers);

  // ---- Continuous background: playhead advance (with the scrub detour), autosave pulse ----
  phKeys.push({ f: 0, v: [-400, 350], ease: LINEAR });
  phKeys.push({ f: scrubStart, v: [-400 + (scrubStart / DUR) * 300, 350], ease: LINEAR });
  phKeys.push({ f: scrubStart + 8, v: [520, 350], ease: EASE_OUT });   // scrub right
  phKeys.push({ f: scrubEnd, v: [40, 350], ease: EASE_IN });            // scrub back
  phKeys.push({ f: DUR, v: [360, 350], ease: LINEAR });                 // resume slow advance
  setKeys(playhead.transform.position, phKeys);
  c.push(playhead);
  const save = dot([930, -516], 6, [0.4, 0.85, 0.5, 1]);
  const sk: { f: number; v: Vec2; ease?: typeof EASE_IO }[] = [];
  for (let f = 0; f <= DUR; f += 180) { sk.push({ f, v: [1, 1] }, { f: f + 12, v: [1.8, 1.8], ease: EASE_IO }, { f: f + 30, v: [1, 1], ease: EASE_IO }); }
  setKeys(save.transform.scale, sk);
  c.push(save);

  return assemble(g, c, DUR);
}

function thumbPos(thumbs: ShapeLayer[], i: number): Vec2 {
  return thumbs[i].transform.position.defaultValue as Vec2;
}

function meterBounce(meter: ShapeLayer, seed: number): void {
  if (meter.shape.type !== 'rectangle') return;
  const hk: { f: number; v: number; ease?: typeof EASE_IO }[] = [];
  let s = seed * 97 + 3;
  for (let f = 0; f <= DUR; f += 6) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    hk.push({ f, v: 8 + (s % 34), ease: EASE_IO });
  }
  setKeys(meter.shape.height, hk);
}

// Drag: the element follows the cursor with 40–60ms lag, tilts from velocity, shadow grows.
function dragKeyframes(el: ShapeLayer, shadow: ShapeLayer, from: Vec2, to: Vec2, startF: number, cur: { posKeys: { f: number; v: number | Vec2 }[]; frame: number }): void {
  // Sample the cursor's own path over the drag window and follow it 2 frames behind.
  const window = cur.posKeys.filter((k) => (k.f as number) >= startF);
  const pk: { f: number; v: Vec2; ease?: typeof LINEAR }[] = [{ f: startF, v: from }];
  const ok: { f: number; v: number; ease?: typeof EASE_OUT }[] = [{ f: startF - 1, v: 0 }, { f: startF, v: 1 }];
  const sk: { f: number; v: number; ease?: typeof EASE_OUT }[] = [{ f: startF - 1, v: 0 }, { f: startF, v: 0.5 }];
  const rk: { f: number; v: number; ease?: typeof LINEAR }[] = [{ f: startF, v: 0 }];
  let prev = from;
  for (const k of window) {
    const p = k.v as Vec2;
    pk.push({ f: (k.f as number) + 2, v: [p[0], p[1]], ease: LINEAR });
    const vx = p[0] - prev[0];
    rk.push({ f: (k.f as number) + 2, v: Math.max(-4, Math.min(4, vx * 0.06)), ease: LINEAR });
    prev = p;
  }
  // spring to final on release
  pk.push({ f: cur.frame + 6, v: to, ease: SPRING });
  ok.push({ f: cur.frame + 4, v: 1 }, { f: cur.frame + 6, v: 0, ease: EASE_OUT });
  sk.push({ f: cur.frame + 4, v: 0.5 }, { f: cur.frame + 6, v: 0, ease: EASE_OUT });
  rk.push({ f: cur.frame + 6, v: 0, ease: SPRING });
  setKeys(el.transform.position, pk);
  setKeys(el.transform.opacity, ok);
  setKeys(el.transform.rotation, rk);
  setKeys(shadow.transform.position, pk.map((k) => ({ f: k.f, v: [(k.v as Vec2)[0] + 6, (k.v as Vec2)[1] + 8] as Vec2, ease: k.ease })));
  setKeys(shadow.transform.opacity, sk);
}

export const recursiveEditor: AnimationTemplate = {
  id: 'recursive-editor',
  name: 'Recursive Editor',
  category: 'showcase',
  description: 'FlashFX animating a video editor — two believable cursors assemble, drag, scrub and cut.',
  tags: ['editor', 'cursor', 'ui', 'meta', 'recursive', 'showcase', 'demo'],
  durationFrames: DUR,
  authorFps: 30,
  build,
};
