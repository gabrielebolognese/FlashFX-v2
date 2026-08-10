import {
  PALETTE_ROLES, EASING_NAMES, TONES, OUTPUT_FORMATS, AI_LAYER_TYPES, TRANSITION_TYPES,
  SHAPE_LANGUAGES, STAGGER_MODES, DECODE_CAPS, MAX_SUBJECTS,
} from '../../schema';

// Fills the `{{...}}` markers in director.md from the schema enums + frozen DECODE_CAPS, so the
// prompt can never restate (and thus drift from) a vocabulary that exists in code. Pure: the caller
// supplies the raw template (loadPrompt.ts reads the file), so this module has no fs/DOM dependency
// and is bundlable anywhere. The Director does NOT get the preset catalog — it names none of it.
//
// Uses DECODE_CAPS (the FROZEN ceiling), not per-tier caps, so the rendered prompt is byte-identical
// on every call and sits in the cached region.

const list = (arr: readonly string[]) => arr.map((x) => `\`${x}\``).join(', ');

const MARKERS: Record<string, string> = {
  PALETTE_ROLES: `**Palette roles** — bind 4–7 of: ${list(PALETTE_ROLES)}.`,
  EASING_NAMES: `**Easings** — choose 4–6 of: ${list(EASING_NAMES)}.`,
  TONES: `**Tones**: ${list(TONES)}.`,
  OUTPUT_FORMATS: `**Formats** (mirror the canvas, never choose): ${list(OUTPUT_FORMATS)}.`,
  AI_LAYER_TYPES: `**Element kinds**: ${list(AI_LAYER_TYPES)}. (No \`camera\`/\`audio\`.)`,
  TRANSITION_TYPES: `**Transitions**: ${list(TRANSITION_TYPES)}.`,
  SHAPE_LANGUAGES: `**Shape languages**: ${list(SHAPE_LANGUAGES)}.`,
  STAGGER_MODES: `**Stagger modes**: ${list(STAGGER_MODES)}.`,
  CAPS: `**Limits**: at most ${DECODE_CAPS.maxPanels} panels; ${MAX_SUBJECTS} subjects; ${DECODE_CAPS.maxLayersPerPanel} elements per panel; palette ≤ ${DECODE_CAPS.maxPaletteEntries} roles; easings 3–6.`,
};

/** The set of markers this builder knows how to fill. */
export const DIRECTOR_MARKERS = Object.keys(MARKERS);

/** Replace every `{{MARKER}}` in the template with its rendered vocabulary. Throws if any marker is
 *  left unfilled (a template/marker mismatch is a build error, never a silent gap in the prompt). */
export function renderDirectorMarkers(template: string): string {
  let out = template;
  for (const [name, text] of Object.entries(MARKERS)) {
    out = out.split(`{{${name}}}`).join(text);
  }
  const leftover = out.match(/\{\{[A-Z_]+\}\}/g);
  if (leftover) throw new Error(`[director prompt] unfilled markers: ${[...new Set(leftover)].join(', ')}`);
  return out;
}
