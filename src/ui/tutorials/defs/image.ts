import type { TutorialDef } from '../types';
import { newText } from '../exampleApi';

export const tutorial: TutorialDef = {
  id: 'image',
  label: 'Image controls',
  title: 'Image Properties',
  videoCaption: 'image.mp4',
  intro:
    'Select an image you dropped on the canvas to inspect its source details and reach the built-in tools. This panel reflects the imported asset, so it appears once a picture is on the stage.',
  bullets: [
    'You can read the image’s original pixel dimensions (width x height) at a glance.',
    'You can check the source format the picture was imported as (PNG, JPG, WebP, and so on).',
    'You can see how large the imported file is on disk.',
    'You can lock the aspect ratio so resizing always keeps the image’s proportions.',
    'You can remove the background in one click with the built-in AI tool (the model downloads once, then is cached).',
  ],
  exampleLabel: 'Add a note',
  seeExample: () => {
    newText('Drop an image on the canvas to use these controls');
  },
};
