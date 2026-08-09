import type { Template, TemplateEditor } from './types';
import { useEditorStore } from '../store/editor';
import { PARTICLE_PRESETS } from '../particles/presets';

type RGB = [number, number, number];

// The deep-link template whitelist. Add an entry here (and nothing else) to expose a new
// `/?template=<id>` landing-page CTA. Keep ids URL-safe, lowercase, stable — the landing page
// hard-codes them.

// Set the scene's backdrop gradient (behind the template's own full-frame scene — insurance so a
// scene always sits on a fitting sky even if a builder doesn't paint the whole frame).
function setBackdrop(editor: TemplateEditor, angle: number, stops: { color: RGB; position: number }[]) {
  const bg = editor.composition.background.layers[0];
  if (bg) editor.updateBackgroundLayer(bg.id, { type: 'linear', angle, stops: stops.map((s) => ({ ...s, opacity: 1 })) });
}

// A deep-link that opens one of the illustrated scene animation-templates as a fresh, editable,
// autoplaying project. The heavy lifting is the animation-template itself (built with the kit);
// the deep-link just sizes the comp, sets a backdrop and inserts it.
function sceneTemplate(opts: {
  name: string; templateId: string; durationFrames: number;
  backdrop: { angle: number; stops: { color: RGB; position: number }[] };
}): Template {
  return {
    name: opts.name,
    width: 1920,
    height: 1080,
    videoFormat: 'long',
    durationFrames: opts.durationFrames,
    autoplay: true,
    apply: (editor) => {
      setBackdrop(editor, opts.backdrop.angle, opts.backdrop.stops);
      editor.insertAnimationTemplate(opts.templateId);
    },
  };
}

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

  // ── Illustrated scene demos (reuse the animation-template library) ──
  galaxy: sceneTemplate({
    name: 'Galaxy', templateId: 'galaxy', durationFrames: 240,
    backdrop: { angle: 135, stops: [
      { color: [0.03, 0.04, 0.10], position: 0 },
      { color: [0.005, 0.006, 0.02], position: 1 },
    ] },
  }),
  'city-skyline': sceneTemplate({
    name: 'City Skyline', templateId: 'city-skyline', durationFrames: 180,
    backdrop: { angle: 90, stops: [
      { color: [0.05, 0.06, 0.16], position: 0 },
      { color: [0.02, 0.02, 0.06], position: 1 },
    ] },
  }),
  'rocket-launch': sceneTemplate({
    name: 'Rocket Launch', templateId: 'rocket-launch', durationFrames: 150,
    backdrop: { angle: 90, stops: [
      { color: [0.04, 0.07, 0.18], position: 0 },
      { color: [0.16, 0.12, 0.18], position: 1 },
    ] },
  }),
  forest: sceneTemplate({
    name: 'Forest', templateId: 'forest', durationFrames: 180,
    backdrop: { angle: 90, stops: [
      { color: [0.53, 0.78, 0.95], position: 0 },
      { color: [0.80, 0.90, 0.95], position: 1 },
    ] },
  }),
};

export type TemplateId = keyof typeof TEMPLATES;

export function isTemplateId(v: string): v is TemplateId {
  return Object.prototype.hasOwnProperty.call(TEMPLATES, v);
}
