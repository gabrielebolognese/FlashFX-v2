import type { TutorialDef } from '../types';
import { newStar, applyGlow, newCircle, applyShadow } from '../exampleApi';

export const tutorial: TutorialDef = {
  id: 'effects',
  label: 'Layer Effects',
  title: 'Layer Effects',
  videoCaption: 'effects.mp4',
  intro:
    'Stack GPU-rendered effects on any layer to add depth, light, and motion. Toggle each one on and dial in its parameters — the viewport previews them live and exports render at full quality.',
  bullets: [
    'You can enable Motion Blur and set the shutter angle (0–360°) to control how far a moving layer streaks.',
    'You can drop a Shadow and tune its color, opacity, light angle, distance, stretch, and blur.',
    'You can add a Glow in Bloom, Outer, or Inner mode, adjusting color, intensity, radius, and threshold.',
    'You can blur a layer four ways — Gaussian, Directional, Radial, or Kawase — each with its own controls.',
    'You can set the blur radius, direction angle and strength, radial center, or Kawase pass count per type.',
    'You can flip on Shadow Only or Glow Only to render just the effect without the source layer.',
  ],
  exampleLabel: 'Create example',
  seeExample: () => {
    const a = newStar();
    applyGlow(a);
    const b = newCircle();
    applyShadow(b);
  },
};
