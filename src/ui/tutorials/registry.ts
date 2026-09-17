import type { TutorialDef } from './types';
import { tutorial as transform } from './defs/transform';
import { tutorial as shape } from './defs/shape';
import { tutorial as material } from './defs/material';
import { tutorial as pattern } from './defs/pattern';
import { tutorial as effects } from './defs/effects';
import { tutorial as masks } from './defs/masks';
import { tutorial as motionPath } from './defs/motion-path';
import { tutorial as video } from './defs/video';
import { tutorial as image } from './defs/image';
import { tutorial as audio } from './defs/audio';
import { tutorial as text } from './defs/text';
import { tutorial as textMotion } from './defs/text-motion';
import { tutorial as layer } from './defs/layer';
import { tutorial as timing } from './defs/timing';
import { tutorial as background } from './defs/background';
import { tutorial as physics } from './defs/physics';

// The tutorial registry. `TUTORIALS` maps a tutorial id → its def; `SECTION_TUTORIALS` maps a
// normalized inspector <Section> title → the tutorial id, so the shared <Section> renders the right
// "Tutorial: How to use X" button automatically. Background/Physics wire their buttons directly (they
// aren't <Section>-based). Per-panel defs live in ./defs/*.

const ALL: TutorialDef[] = [
  transform, shape, material, pattern, effects, masks, motionPath, video,
  image, audio, text, textMotion, layer, timing, background, physics,
];

export const TUTORIALS: Record<string, TutorialDef> = Object.fromEntries(ALL.map((t) => [t.id, t]));

/** Normalized inspector Section title → tutorial id (e.g. "shape (polygon)" → "shape"). */
export const SECTION_TUTORIALS: Record<string, string> = {
  transform: 'transform',
  shape: 'shape',
  material: 'material',
  pattern: 'pattern',
  effects: 'effects',
  masks: 'masks',
  'motion path': 'motion-path',
  video: 'video',
  image: 'image',
  audio: 'audio',
  'text content': 'text',
  'text motion control': 'text-motion',
  layer: 'layer',
  timing: 'timing',
};

/** Normalize a Section title for lookup: lowercase, drop any "(...)" suffix, trim. */
export function normalizeSectionTitle(title: string): string {
  return title.toLowerCase().replace(/\s*\(.*\)\s*$/, '').trim();
}

export function tutorialForSectionTitle(title: string): TutorialDef | undefined {
  const id = SECTION_TUTORIALS[normalizeSectionTitle(title)];
  return id ? TUTORIALS[id] : undefined;
}

export function getTutorial(id: string): TutorialDef | undefined {
  return TUTORIALS[id];
}
