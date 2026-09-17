import type { TutorialDef } from '../types';
import { addBackgroundLayer } from '../exampleApi';

export const tutorial: TutorialDef = {
  id: 'background',
  label: 'the Background panel',
  title: 'Canvas Background',
  videoCaption: 'background.mp4',
  intro:
    'Set what fills the canvas behind your layers, and control the overlays and world settings that live outside the timeline. It gathers the fill stack, the grid and guides, and the physics world in one place.',
  bullets: [
    'You can stack up to 10 background fill layers, each a solid color, a linear gradient, or a radial gradient.',
    'You can blend each fill with 8 modes (Normal, Multiply, Screen, Overlay, Soft Light, Add, Darken, Lighten), set its opacity, and reorder or remove it.',
    'You can shape each gradient with up to 6 color stops, tuning color, position, and alpha, plus angle for linear or center and radius for radial.',
    'You can turn on a column-and-row grid with subdivisions and opacity, and toggle its visibility over the canvas.',
    'You can add vertical and horizontal guidelines by position, drop in a Thirds preset, and lock, hide, or clear them.',
    'You can enable a physics world with gravity, time scale, and substeps, then bake the simulation and preview it.',
    'You can switch between the Starter and Full editor layouts from the top of the panel.',
  ],
  exampleLabel: 'Add a background fill',
  seeExample: () => {
    addBackgroundLayer();
  },
};
