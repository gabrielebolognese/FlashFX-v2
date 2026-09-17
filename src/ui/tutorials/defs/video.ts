import type { TutorialDef } from '../types';
import { newText } from '../exampleApi';

// Tutorial copy + demo for the inspector's "Video" section (VideoProperties in Inspector.tsx).
export const tutorial: TutorialDef = {
  id: 'video',
  label: 'Video controls',
  title: 'Video Clip Controls',
  videoCaption: 'video.mp4',
  intro:
    'Fine-tune how a video clip plays back: trim into the source, change its speed, remap or blend frames for smooth retimes, and manage its audio.',
  bullets: [
    'You can read the clip’s source size, duration and frame rate at a glance.',
    'You can trim into the source with Offset, so playback starts partway through the clip.',
    'You can set a playback Speed to slow down or speed up the footage.',
    'You can turn on Time Remap to animate source time - ease for speed ramps, flatten to freeze, descend to reverse.',
    'You can enable Frame Mix to cross-dissolve adjacent frames (Mix or Optical Flow) so slow-motion doesn’t stutter.',
    'You can lock the aspect ratio so corner-resizing keeps the clip’s proportions.',
    'You can mute the clip and strip silent stretches from its audio.',
  ],
  exampleLabel: 'Add a note',
  seeExample: () => {
    newText('Drop a video clip on the canvas, then these controls appear');
  },
};
