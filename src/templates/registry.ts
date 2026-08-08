import type { Template } from './types';

// The deep-link template whitelist. Add an entry here (and nothing else) to expose a new
// `/?template=<id>` landing-page CTA. Keep ids URL-safe, lowercase, stable — the landing page
// hard-codes them.

export const TEMPLATES: Record<string, Template> = {
  // The particle-generator demo: a live fire burst on a dark stage, playing on arrival.
  particles: {
    name: 'Particle Demo',
    width: 1920,
    height: 1080,
    videoFormat: 'long',
    autoplay: true,
    apply: (editor) => {
      // Dark diagonal gradient stage (same look as the tutorial's opening beat).
      const bg = editor.composition.background.layers[0];
      if (bg) {
        editor.updateBackgroundLayer(bg.id, {
          type: 'linear',
          angle: 135,
          stops: [
            { color: [0.05, 0.07, 0.14], position: 0, opacity: 1 },
            { color: [0.01, 0.012, 0.02], position: 1, opacity: 1 },
          ],
        });
      }
      // A real particle layer (fire preset), centred in the comp.
      editor.addParticleLayer();
    },
  },
};

export type TemplateId = keyof typeof TEMPLATES;

export function isTemplateId(v: string): v is TemplateId {
  return Object.prototype.hasOwnProperty.call(TEMPLATES, v);
}
