import type { Template } from './types';
import { useEditorStore } from '../store/editor';
import { PARTICLE_PRESETS } from '../particles/presets';

// The deep-link template whitelist. Add an entry here (and nothing else) to expose a new
// `/?template=<id>` landing-page CTA. Keep ids URL-safe, lowercase, stable — the landing page
// hard-codes them.

export const TEMPLATES: Record<string, Template> = {
  // The particle-generator hero: a big tuned "magic" emitter on a dark stage, playing on arrival.
  particles: {
    name: 'Particle Demo',
    width: 1920,
    height: 1080,
    videoFormat: 'long',
    durationFrames: 210, // 7s @ 30fps
    autoplay: true,
    apply: (editor) => {
      // Dark diagonal gradient stage.
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

      // Add a particle layer, then override it with the tuned "magic" emitter.
      editor.addParticleLayer();
      const st = useEditorStore.getState();
      const id = st.selection.activeId;
      if (!id) return;

      const cfg = PARTICLE_PRESETS.magic();
      cfg.maxParticles = 1600;   // headroom so the high rate + burst never clip
      cfg.spawnRate = 350;
      cfg.burstCount = 300;
      cfg.emitterShape = 'ring';
      cfg.emitterRadius = 250;
      cfg.gravity = [130, 100];
      cfg.initialSpeed = { min: 3, max: 10 };

      editor.updateLayerProperty(id, 'particle.preset', 'magic');
      editor.updateLayerProperty(id, 'particle.emitterConfig', JSON.stringify(cfg));
      editor.updateLayerProperty(id, 'outPoint', st.composition.settings.durationFrames);
    },
  },
};

export type TemplateId = keyof typeof TEMPLATES;

export function isTemplateId(v: string): v is TemplateId {
  return Object.prototype.hasOwnProperty.call(TEMPLATES, v);
}
