import type { TutorialApi, TutorialChapter } from './types';

// Phase 3 storyboard — the full cohesive build. FlashFX assembles a title card live against the
// REAL editor store: gradient stage → shapes → boolean-with-holes → shared styles → text →
// keyframed fly-in → glow/shadow → particles → outline + auto-tidy → play & hand off.
//
// Everything is a fixed constant so the build looks identical every run. Positions are in the
// Tutorial project's composition space (1920×1080, centre 960,540). Colours are RGBA in 0–1.
//
// Deliberately NOT shown: the Cloner (its GPU render path is unbuilt — see CLAUDE.md — so it would
// add an invisible layer). Particles carry the "repetition / energy" beat instead. Final visual
// polish (exact positions/timing) is a browser-tuning pass, as the plan notes.

type RGBA = [number, number, number, number];

const AMBER: RGBA = [0.969, 0.71, 0.0, 1]; // FlashFX brand
const BLUE: RGBA = [0.29, 0.56, 0.99, 1];
const VIOLET: RGBA = [0.55, 0.45, 0.95, 1];
const SLATE: RGBA = [0.78, 0.83, 0.92, 1];
const TEAL: RGBA = [0.1, 0.85, 0.7, 1]; // the shared-style recolour target (big, obvious shift)

// The app's own "Ease Out" bezier handles (menuDefinitions.ts) — reused so the fly-in decelerates
// exactly like a hand-authored ease.
const EASE_OUT: [[number, number], [number, number]] = [[0.58, 1], [0.001, 0.001]];

// Composition layout (1920×1080).
const CX = 960;
const TITLE_POS: [number, number] = [CX, 470];
const TAGLINE_POS: [number, number] = [CX, 635];
const FLY_FROM: [number, number] = [CX, 600]; // title starts lower, rises into place
const SETTLE = 18; // frame the fly-in lands on

// Scratch ids handed between steps (reassigned each time their chapter runs).
let trioRect: string | undefined;
let trioStar: string | undefined;
let boolBase: string | undefined;
let boolCutter: string | undefined;
let brandStyle: string | undefined;
let titleId: string | undefined;
let taglineId: string | undefined;

const setProp = (api: TutorialApi, id: string, path: string, value: unknown) =>
  api.editor().updateLayerProperty(id, path, value);

// Recolour + reposition + resize the most-recently-added shape in one shot; returns its id.
function placeShape(
  api: TutorialApi,
  opts: { pos: [number, number]; fill: RGBA; width?: number; height?: number; radius?: number; borderRadius?: number },
): string {
  const id = api.lastLayerId();
  if (!id) return '';
  setProp(api, id, 'transform.position.defaultValue', opts.pos);
  setProp(api, id, 'shape.fillColor', opts.fill);
  setProp(api, id, 'shape.strokeColor', [0, 0, 0, 0]);
  if (opts.width != null) setProp(api, id, 'shape.width.defaultValue', opts.width);
  if (opts.height != null) setProp(api, id, 'shape.height.defaultValue', opts.height);
  if (opts.radius != null) setProp(api, id, 'shape.radius.defaultValue', opts.radius);
  if (opts.borderRadius != null) setProp(api, id, 'shape.borderRadius.defaultValue', opts.borderRadius);
  return id;
}

// Set a just-added text layer's content, font, colour, size, alignment and position. Rewrites
// content.spans wholesale (one span) so we never touch the fiddly spans[i] bracket path.
function styleText(
  api: TutorialApi,
  id: string,
  text: string,
  opts: { fontFamily: string; fontWeight: 400 | 500 | 700; color: RGBA; fontSize: number; pos: [number, number] },
): void {
  const layer = api.editor().composition.layers.find((l) => l.id === id);
  if (!layer || layer.type !== 'text') return;
  const base = layer.content.spans[0]?.style;
  if (!base) return;
  const style = { ...base, fontFamily: opts.fontFamily, fontWeight: opts.fontWeight, color: opts.color };
  setProp(api, id, 'content.spans', [{ text, style }]);
  setProp(api, id, 'animOverrides.fontSize.defaultValue', opts.fontSize);
  setProp(api, id, 'layoutConfig.horizontalAlign', 'center');
  setProp(api, id, 'transform.position.defaultValue', opts.pos);
}

export const tutorialScript: TutorialChapter[] = [
  {
    id: 'canvas',
    title: 'The canvas',
    steps: [
      {
        id: 'intro',
        say: 'Welcome to FlashFX. Sit back — I’ll build a title card from scratch so you can see what’s possible.',
        hold: 2800,
        spotlight: 'canvas',
      },
      {
        id: 'background',
        say: 'First the stage: a deep diagonal gradient sets the mood.',
        hold: 1800,
        spotlight: 'canvas',
        run: (api) => {
          const bg = api.editor().composition.background.layers[0];
          if (!bg) return;
          api.editor().updateBackgroundLayer(bg.id, {
            type: 'linear',
            angle: 135,
            stops: [
              { color: [0.06, 0.08, 0.15], position: 0, opacity: 1 },
              { color: [0.01, 0.012, 0.02], position: 1, opacity: 1 },
            ],
          });
        },
      },
    ],
  },
  {
    id: 'shapes',
    title: 'Shapes',
    steps: [
      {
        id: 'rect',
        say: 'Now some accent shapes across the top. A rounded rectangle…',
        hold: 1400,
        spotlight: 'shape-tools',
        run: (api) => {
          api.editor().addRectangle();
          trioRect = placeShape(api, { pos: [720, 245], fill: AMBER, width: 150, height: 110, borderRadius: 22 });
        },
      },
      {
        id: 'circle',
        say: '…an ellipse…',
        hold: 1200,
        spotlight: 'shape-tools',
        run: (api) => {
          api.editor().addCircle();
          placeShape(api, { pos: [985, 275], fill: BLUE, radius: 58 });
        },
      },
      {
        id: 'star',
        say: '…and a star. Every one is an editable vector object, not a picture.',
        hold: 1700,
        spotlight: 'shape-tools',
        run: (api) => {
          api.editor().addStar();
          trioStar = placeShape(api, { pos: [1205, 240], fill: AMBER });
        },
      },
    ],
  },
  {
    id: 'styles',
    title: 'Shared styles',
    steps: [
      {
        id: 'link',
        say: 'Colours can be shared. I’ll link the rectangle and the star to one brand style…',
        hold: 1900,
        spotlight: 'inspector',
        run: (api) => {
          brandStyle = api.editor().createColorStyle(AMBER, 'Brand');
          if (!brandStyle) return;
          if (trioRect) api.editor().linkLayerColorStyle(trioRect, 'fill', brandStyle);
          if (trioStar) api.editor().linkLayerColorStyle(trioStar, 'fill', brandStyle);
        },
      },
      {
        id: 'recolor',
        say: '…now editing that one style repaints both at once.',
        hold: 2200,
        spotlight: 'inspector',
        run: (api) => {
          if (brandStyle) api.editor().updateStyleColor(brandStyle, TEAL);
        },
      },
    ],
  },
  {
    id: 'boolean',
    title: 'Combine',
    steps: [
      {
        id: 'base',
        say: 'Shapes can be fused. I’ll lay a panel at the bottom…',
        hold: 1300,
        spotlight: 'canvas',
        run: (api) => {
          api.editor().addRectangle();
          boolBase = placeShape(api, { pos: [CX, 835], fill: VIOLET, width: 260, height: 260, borderRadius: 36 });
        },
      },
      {
        id: 'cutter',
        say: '…drop a circle on it…',
        hold: 1200,
        spotlight: 'canvas',
        run: (api) => {
          api.editor().addCircle();
          boolCutter = placeShape(api, { pos: [CX, 835], fill: BLUE, radius: 80 });
        },
      },
      {
        id: 'difference',
        say: '…and subtract it for a clean, real hole — not a fake overlay.',
        hold: 2200,
        spotlight: 'canvas',
        run: (api) => {
          if (!boolBase || !boolCutter) return;
          api.select([boolBase, boolCutter]);
          api.editor().compoundBooleanSelectedShapes('difference');
        },
      },
    ],
  },
  {
    id: 'text',
    title: 'Text',
    steps: [
      {
        id: 'headline',
        say: 'Every card needs a headline.',
        hold: 1800,
        spotlight: 'canvas',
        run: (api) => {
          api.editor().addText('FlashFX');
          const id = api.lastLayerId();
          if (!id) return;
          titleId = id;
          styleText(api, id, 'FlashFX', { fontFamily: 'Montserrat', fontWeight: 700, color: AMBER, fontSize: 170, pos: TITLE_POS });
          api.select([id]);
        },
      },
      {
        id: 'tagline',
        say: 'And a tagline underneath.',
        hold: 1700,
        spotlight: 'canvas',
        run: (api) => {
          api.editor().addText('everything in one canvas');
          const id = api.lastLayerId();
          if (!id) return;
          taglineId = id;
          styleText(api, id, 'everything in one canvas', { fontFamily: 'Montserrat', fontWeight: 500, color: SLATE, fontSize: 46, pos: TAGLINE_POS });
        },
      },
    ],
  },
  {
    id: 'animate',
    title: 'Animate',
    steps: [
      {
        id: 'keyframes',
        say: 'Keyframes bring it to life — I’ll make the headline rise and scale into place, with an ease.',
        hold: 2600,
        spotlight: 'timeline',
        run: (api) => {
          const id = titleId;
          if (!id) return;
          const ed = api.editor();
          ed.addKeyframe(id, 'transform.position', 0, FLY_FROM);
          ed.addKeyframe(id, 'transform.position', SETTLE, TITLE_POS);
          ed.addKeyframe(id, 'transform.scale', 0, [0.8, 0.8]);
          ed.addKeyframe(id, 'transform.scale', SETTLE, [1, 1]);
          ed.setKeyframeInterpolation(
            id,
            [
              { propertyPath: 'transform.position', frame: 0 },
              { propertyPath: 'transform.position', frame: SETTLE },
              { propertyPath: 'transform.scale', frame: 0 },
              { propertyPath: 'transform.scale', frame: SETTLE },
            ],
            'bezier',
            EASE_OUT[0],
            EASE_OUT[1],
          );
          api.setFrame(SETTLE); // land on the settled pose so the rest of the build reads clearly
        },
      },
    ],
  },
  {
    id: 'effects',
    title: 'Effects',
    steps: [
      {
        id: 'glow-shadow',
        say: 'Depth in a click — a soft glow and a drop shadow on the title.',
        hold: 2200,
        spotlight: 'inspector',
        run: (api) => {
          if (!titleId) return;
          api.editor().enableLayerEffect(titleId, 'glow');
          api.editor().enableLayerEffect(titleId, 'shadow');
        },
      },
    ],
  },
  {
    id: 'particles',
    title: 'Particles',
    steps: [
      {
        id: 'burst',
        say: 'A particle system adds energy — thousands of GPU sprites, live. Watch it when we play.',
        hold: 2200,
        spotlight: 'canvas',
        run: (api) => {
          api.editor().addParticleLayer();
        },
      },
    ],
  },
  {
    id: 'refine',
    title: 'Refine',
    steps: [
      {
        id: 'outline',
        say: 'Text can become editable vector paths — here’s the tagline, outlined glyph by glyph.',
        hold: 2200,
        spotlight: 'canvas',
        run: async (api) => {
          if (taglineId) await api.editor().outlineTextLayer(taglineId);
        },
      },
      {
        id: 'tidy',
        say: 'And Tidy Up snaps a messy layout into a perfect row automatically.',
        hold: 2200,
        spotlight: 'canvas',
        run: (api) => {
          const ids = [trioRect, trioStar].filter((x): x is string => !!x);
          // Re-select the whole accent trio (rect + circle + star) by picking the three shapes near
          // the top band, then tidy.
          const top = api.editor().composition.layers
            .filter((l) => l.type === 'shape' && !!l.visible)
            .filter((l) => {
              const p = l.type === 'shape' ? l.transform.position.defaultValue : null;
              return Array.isArray(p) && p[1] < 360;
            })
            .map((l) => l.id);
          const sel = top.length >= 2 ? top : ids;
          if (sel.length >= 2) {
            api.select(sel);
            api.editor().tidyUpSelection();
          }
        },
      },
    ],
  },
  {
    id: 'play',
    title: 'Play',
    steps: [
      {
        id: 'rewind',
        say: 'That’s the card. Let’s watch it play.',
        hold: 900,
        spotlight: 'transport',
        run: (api) => { api.setFrame(0); },
      },
      {
        id: 'go',
        say: 'The headline flies in, the particles ignite — your piece, running live.',
        hold: 5200,
        spotlight: 'transport',
        run: (api) => { api.timeline().play(); },
      },
    ],
  },
];
