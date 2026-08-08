import type { TutorialApi, TutorialChapter } from './types';

// Phase 2 storyboard — chapters 1–3 running end-to-end against the REAL editor store
// (background → shapes → boolean-with-holes), proving pacing, the input soft-lock and the
// handoff. Phase 3 extends this with styles → text → animate → effects → cloner/particles →
// outline/tidy → play, and tunes positions/colors/timing into one cohesive card.
//
// Positions are in composition space (the Tutorial project is 1920×1080, so centre is 960,540).
// Colours are RGBA in 0–1. Everything is a fixed constant so the build looks identical every run.

type RGBA = [number, number, number, number];

const AMBER: RGBA = [0.969, 0.71, 0.0, 1]; // FlashFX brand
const BLUE: RGBA = [0.29, 0.56, 0.99, 1];
const VIOLET: RGBA = [0.55, 0.45, 0.95, 1];

// Scratch ids handed between steps of the boolean chapter (reset each time that chapter runs).
let boolBase: string | undefined;
let boolCutter: string | undefined;

const setProp = (api: TutorialApi, id: string, path: string, value: unknown) =>
  api.editor().updateLayerProperty(id, path, value);

// Recolour + reposition + resize the most-recently-added shape in one shot.
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

export const tutorialScript: TutorialChapter[] = [
  {
    id: 'canvas',
    title: 'The canvas',
    steps: [
      {
        id: 'intro',
        say: 'Welcome to FlashFX. Sit back — I’ll build a quick motion piece so you can see what’s possible.',
        hold: 2600,
        spotlight: 'canvas',
      },
      {
        id: 'background',
        say: 'First the stage: a deep gradient background sets the mood.',
        hold: 1800,
        spotlight: 'canvas',
        run: (api) => {
          // Every comp ships with one solid background layer — turn it into a dark diagonal gradient.
          const bg = api.editor().composition.background.layers[0];
          if (!bg) return;
          api.editor().updateBackgroundLayer(bg.id, {
            type: 'linear',
            angle: 135,
            stops: [
              { color: [0.05, 0.07, 0.14], position: 0, opacity: 1 },
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
        say: 'Now some shapes. Here’s a rectangle — with live, roundable corners.',
        hold: 1600,
        spotlight: 'shape-tools',
        run: (api) => {
          api.editor().addRectangle();
          const id = placeShape(api, { pos: [620, 330], fill: AMBER, width: 240, height: 180, borderRadius: 28 });
          if (id) api.select([id]);
        },
      },
      {
        id: 'circle',
        say: 'An ellipse…',
        hold: 1300,
        spotlight: 'shape-tools',
        run: (api) => {
          api.editor().addCircle();
          const id = placeShape(api, { pos: [960, 330], fill: BLUE, radius: 100 });
          if (id) api.select([id]);
        },
      },
      {
        id: 'star',
        say: '…and a star. Every one is an editable vector object, not a picture.',
        hold: 1800,
        spotlight: 'shape-tools',
        run: (api) => {
          api.editor().addStar();
          const id = placeShape(api, { pos: [1300, 330], fill: AMBER });
          if (id) api.select([id]);
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
        say: 'Shapes can be combined. I’ll lay down a panel…',
        hold: 1400,
        spotlight: 'canvas',
        run: (api) => {
          api.editor().addRectangle();
          boolBase = placeShape(api, { pos: [960, 740], fill: VIOLET, width: 380, height: 380, borderRadius: 48 });
        },
      },
      {
        id: 'cutter',
        say: '…and a circle right on top of it.',
        hold: 1400,
        spotlight: 'canvas',
        run: (api) => {
          api.editor().addCircle();
          boolCutter = placeShape(api, { pos: [960, 740], fill: BLUE, radius: 120 });
        },
      },
      {
        id: 'difference',
        say: 'Subtract one from the other and you get a clean, real hole — not a fake overlay.',
        hold: 2400,
        spotlight: 'canvas',
        run: (api) => {
          if (!boolBase || !boolCutter) return;
          api.select([boolBase, boolCutter]);
          api.editor().compoundBooleanSelectedShapes('difference');
        },
      },
    ],
  },
];
