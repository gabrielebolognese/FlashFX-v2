// Live value catalogs for the agent manifest: the ids an agent may pass to catalog-typed action
// params (see AgentParam.catalog in ./featureManifest). Read straight from the shipping preset
// modules, so the list can never drift from what the app actually offers. Pure data, no React /
// DOM / store imports (bundled in Node by scripts/gen-agent-manifest.mjs).

import type { CatalogId } from './featureManifest';
import { ANIMATION_PRESETS } from '../core/animationPresets';
import { TEXT_ANIMATOR_PRESETS } from '../core/textAnimatorPresets';
import { PARTICLE_PRESETS } from '../particles/presets';
import { ANIMATION_TEMPLATES } from '../animation-templates/catalog';
import { ANIMATION_ITEM_PRESETS } from '../animation-items/presets';
import { PROCEDURAL_PRESETS } from '../procedural/presets';
import { VFX_ELEMENTS } from '../core/vfx/vfxElements';
import { EASINGS } from '../core/easings';
import { FONT_MANIFEST, type FontManifestEntry } from '../engine/fonts';

/** B52: "weights 400, 500, 600, 700; true italic 400; loads on first use" for the font catalog. */
function describeFontFaces(f: FontManifestEntry): string {
  const parts = [`weights ${f.weights.join(', ')}`];
  if (f.italicWeights?.length) parts.push(`true italic ${f.italicWeights.join(', ')}`);
  else if (f.slug) parts.push('italic is a synthesized oblique');
  if (!f.slug) parts.push('system font, not bundled');
  else if (f.lazy) parts.push('loads on first use');
  return parts.join('; ');
}

export interface CatalogEntry {
  id: string;
  label: string;
  description?: string;
  category?: string;
}

export type AgentCatalogs = Record<CatalogId, CatalogEntry[]>;

export function buildAgentCatalogs(): AgentCatalogs {
  return {
    animationPresets: ANIMATION_PRESETS.map((p) => ({ id: p.id, label: p.name, description: p.description, category: p.category })),
    textAnimatorPresets: TEXT_ANIMATOR_PRESETS.map((p) => ({ id: p.id, label: p.label })),
    particlePresets: Object.keys(PARTICLE_PRESETS).map((k) => ({ id: k, label: k })),
    animationTemplates: ANIMATION_TEMPLATES.map((t) => ({ id: t.id, label: t.name, description: t.description, category: t.category })),
    animationItems: ANIMATION_ITEM_PRESETS.map((p) => ({ id: p.name, label: p.name, description: p.description })),
    proceduralPresets: PROCEDURAL_PRESETS.map((p) => ({ id: p.name, label: p.name, description: p.description, category: p.category })),
    vfxElements: VFX_ELEMENTS.map((v) => ({ id: v.id, label: v.label, category: v.category })),
    easings: Object.keys(EASINGS).map((k) => ({ id: k, label: k })),
    fontFamilies: FONT_MANIFEST.map((f) => ({ id: f.family, label: f.family, description: describeFontFaces(f), category: f.category })),
  };
}
