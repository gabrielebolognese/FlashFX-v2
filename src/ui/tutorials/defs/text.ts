import type { TutorialDef } from '../types';
import { newText, prop, select } from '../exampleApi';

// Tutorial for the Inspector's Text panel (Text Content / Font / Spacing / Color /
// Alignment & Layout / Decoration sections). Every bullet maps to a real control read
// from src/ui/panels/Inspector.tsx.
export const tutorial: TutorialDef = {
  id: 'text',
  label: 'Text',
  title: 'Type & Text Styling',
  videoCaption: 'text.mp4',
  intro:
    'The Text panel is where you edit a text layer’s words and give them a look. ' +
    'Change the copy, pick a font, tune spacing and color, then align and decorate.',
  bullets: [
    'You can edit the words directly in the multi-line box (up to 500 characters) and switch the bounding box between Auto, fixed Width, and Fixed size.',
    'You can choose a font family (bundled or imported), set the weight from 100 to 900, toggle italic, and drag the Size.',
    'You can tighten or loosen Tracking (letter spacing) and Leading (line height) for fine typographic control.',
    'You can set a fill color, add a text gradient, and give the glyphs a stroke color with adjustable width.',
    'You can align horizontally (left / center / right), vertically inside a fixed box, and apply a case transform (UPPERCASE, lowercase, Capitalize).',
    'You can add underline or strikethrough decoration, and keyframe size, tracking, leading, and stroke width to animate the type.',
  ],
  exampleLabel: 'Create text example',
  seeExample: () => {
    const id = newText('FlashFX');
    prop(id, 'content.spans[0].style.fontWeight', 800);
    prop(id, 'animOverrides.fontSize.defaultValue', 96);
    prop(id, 'animOverrides.letterSpacing.defaultValue', 2);
    prop(id, 'content.spans[0].style.textTransform', 'uppercase');
    prop(id, 'content.spans[0].style.color', [0.85, 0.65, 0.13, 1]);
    select(id);
  },
};
