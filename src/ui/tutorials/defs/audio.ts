import type { TutorialDef } from '../types';
import { newText } from '../exampleApi';

export const tutorial: TutorialDef = {
  id: 'audio',
  label: 'Audio controls',
  title: 'Audio Controls',
  videoCaption: 'audio.mp4',
  intro:
    'Shape the sound of an audio or video clip: mixing, pitch, and on-device tools live here. Select a clip that carries audio to reveal these controls.',
  bullets: [
    'You can mute or unmute a clip with one click.',
    'You can read the clip’s duration, sample rate, and channel layout (mono / stereo) at a glance.',
    'You can set volume from 0 to 2x, and keyframe it to fade audio in or out.',
    'You can shift pitch up or down by semitones (-24 to +24), with keyframes for pitch sweeps.',
    'You can strip silence to automatically trim quiet gaps out of the clip.',
    'You can auto-caption a clip - transcribed on-device - to add subtitles to the timeline.',
  ],
  exampleLabel: 'Add a note',
  seeExample: () => {
    newText('Drop an audio clip on the timeline to use these controls');
  },
};
