import {
  PALETTE_ROLES, EASING_NAMES, AI_LAYER_TYPES, SHAPE_LANGUAGES, STAGGER_MODES, DECODE_CAPS,
} from '../../schema';
import { PRESET_CATALOG } from '../presetCatalog';

// Fills the `{{...}}` markers in coder.md from the schema enums + the preset catalog, so the prompt
// can never restate (and thus drift from) a vocabulary that lives in code. Pure (the caller supplies
// the raw template). Unlike the Director, the Coder IS handed the preset catalog — it authors motion.
// Uses DECODE_CAPS (the frozen ceiling) so the rendered prompt is byte-identical + sits in the cache.

const list = (arr: readonly string[]) => arr.map((x) => `\`${x}\``).join(', ');
const presets = () => Object.values(PRESET_CATALOG).map((p) => `- \`${p.name}\` (${p.category}): ${p.intent}`).join('\n');

const MARKERS: Record<string, string> = {
  LAYER_TYPES: `**Layer types**: ${list(AI_LAYER_TYPES)}. (No \`camera\`/\`audio\`.)`,
  PALETTE_ROLES: `**Palette roles** — use these as a layer's colors, NEVER a hex/rgb literal: ${list(PALETTE_ROLES)}.`,
  MOTION_PRESETS: `**Motion presets** — attach up to 6 per layer via \`presets\`:\n${presets()}`,
  EASINGS: `**Easings** (prefer the ones the style contract lists): ${list(EASING_NAMES)}.`,
  SHAPE_LANGUAGES: `**Shape languages**: ${list(SHAPE_LANGUAGES)}.`,
  STAGGER_MODES: `**Stagger modes**: ${list(STAGGER_MODES)}.`,
  CAPS: `**Limits**: at most ${DECODE_CAPS.maxLayersPerPanel} layers per panel; at most 6 presets per layer.`,
};

/** The markers this builder knows how to fill. */
export const CODER_MARKERS = Object.keys(MARKERS);

/** Replace every `{{MARKER}}` in the template. Throws if any marker is left unfilled (build error). */
export function renderCoderMarkers(template: string): string {
  let out = template;
  for (const [name, text] of Object.entries(MARKERS)) {
    out = out.split(`{{${name}}}`).join(text);
  }
  const leftover = out.match(/\{\{[A-Z_]+\}\}/g);
  if (leftover) throw new Error(`[coder prompt] unfilled markers: ${[...new Set(leftover)].join(', ')}`);
  return out;
}
